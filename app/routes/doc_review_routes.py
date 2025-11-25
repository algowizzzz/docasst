from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple
from uuid import uuid4

from flask import jsonify, request, render_template, session, send_from_directory, abort, Blueprint, redirect, url_for
from app.auth import login_required, auth_manager
from app.config import get_config
from functools import wraps
from werkzeug.utils import secure_filename


from core.agent import DocReviewAgent
from core.store import DocReviewStore
from core.vfs import DocReviewVFSAdapter
from core.template_processor import TemplateProcessor, load_template, list_templates
from core.comments import CommentsManager
from core.ai_suggestions import AISuggestionsManager
from core.chat_history import ChatHistoryManager
from tools.llm_client import get_llm_client, is_llm_available


class LLMNotAvailableError(RuntimeError):
    """LLM not available error."""
    pass


def generate_chat_reply(message: str, context: str = "") -> str:
    """Generate chat reply using LLM."""
    if not is_llm_available():
        raise LLMNotAvailableError("LLM not configured")
    client = get_llm_client()
    prompt = f"Context: {context}\n\nUser: {message}\n\nAssistant:"
    return client.invoke_with_prompt("You are a helpful document review assistant.", prompt)


def configure_doc_review_logging():
    """Configure logging for doc review."""
    import logging
    logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)


def _slugify(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip())
    value = re.sub(r"-+", "-", value)
    return value.strip("-" ).lower() or "doc"



# Blueprint for doc review routes
doc_review_bp = Blueprint('doc_review', __name__)

# Module-level managers (initialized in init_doc_review_routes)
_agent = None
_store = None
_comments = None
_ai_suggestions = None
_chat_history = None
_socketio = None
_upload_dir = None
_vscode_web_dir = Path("web/static/vscode-web")
_angular_app_dir = Path("web/static/doc-review-app/dist/doc-review-app/browser")


def init_doc_review_routes(socketio_instance=None):
    """Initialize doc review routes with dependencies."""
    global _agent, _store, _comments, _ai_suggestions, _chat_history, _socketio, _upload_dir
    _agent = DocReviewAgent()
    config = get_config()
    _store = DocReviewStore(data_dir=config.get('DATA_DIR', 'data/documents'))
    _comments = CommentsManager(_store)
    _ai_suggestions = AISuggestionsManager(_store)
    _chat_history = ChatHistoryManager(_store)
    _socketio = socketio_instance
    _upload_dir = Path(config.get('UPLOAD_DIR', 'data/uploads'))
    _upload_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Doc review routes initialized")



def _api_key_or_login_required(f):
    """Decorator that allows API key OR session login."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Allow OPTIONS requests (CORS preflight) without authentication
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        
        # Check for API key in header
        api_key = request.headers.get('X-API-Key')
        if api_key == 'docreview_dev_key_12345':
            return f(*args, **kwargs)
        
        # Fall back to session login - check for username or token
        if 'username' not in session and 'token' not in session:
            # For API calls, return JSON error instead of redirect
            if request.path.startswith('/api/'):
                return jsonify({"error": "Authentication required"}), 401
            from flask import redirect, url_for
            return redirect(url_for('auth.login'))
        
        return f(*args, **kwargs)
    return wrapper


def _make_event_emitter(file_id: str):
    """Create event emitter for Socket.IO."""
    if not _socketio:
        return None

    room = f"doc_review:{file_id}"

    def emitter(event_type: str, payload: Dict[str, Any]) -> None:
        data = dict(payload)
        data.setdefault("timestamp", datetime.utcnow().isoformat() + "Z")
        data["file_id"] = file_id
        event_name = f"doc_review:{event_type}"
        try:
            _socketio.emit(event_name, data, room=room)
        except Exception:
            logger.exception("Failed to emit %s event for %s", event_name, file_id)

    return emitter


# Class methods converted to module-level functions below

def _convert_to_doc_state(record: str) -> Optional[Callable[[str, Dict[str, Any]], None]]:
    if not _socketio:
        return None

    room = f"doc_review:{file_id}"

    def emitter(event_type: str, payload: Dict[str, Any]) -> None:
        data = dict(payload)
        data.setdefault("timestamp", datetime.utcnow().isoformat() + "Z")
        data["file_id"] = file_id
        event_name = f"doc_review:{event_type}"
        try:
            _socketio.emit(event_name, data, room=room)
        except Exception:  # pragma: no cover - socket failures should not break workflow
            logger.exception("Failed to emit %s event for %s", event_name, file_id)

    return emitter

def _convert_to_doc_state(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert backend document format to DocState format for React editor.
    
    Backend format: { file_id, state: { structure: { block_metadata: [...] } } }
    DocState format: { id, title, version, blocks: [...] }
    """
    file_id = record.get("file_id", "")
    state = record.get("state", {})
    # Read from structure.block_metadata (original IDs) not state.block_metadata (transformed IDs)
    structure = state.get("structure", {})
    block_metadata = structure.get("block_metadata", [])
    
    # DEBUG: Log block IDs being read
    if block_metadata:
        block_ids = [b.get("id", "") for b in block_metadata[:10]]
        logger.info(f"[_convert_to_doc_state] Reading from structure.block_metadata (first 10 IDs): {block_ids}")
    
    # Check if there's block_metadata at state level (shouldn't be used)
    state_block_metadata = state.get("block_metadata", [])
    if state_block_metadata:
        state_block_ids = [b.get("id", "") for b in state_block_metadata[:10]]
        logger.warning(f"[_convert_to_doc_state] ⚠️ Found block_metadata at state level (first 10 IDs): {state_block_ids} - NOT USING THIS")
    
    # Convert blocks
    blocks = []
    for block in block_metadata:
        block_id = block.get("id", "")
        block_type = block.get("type", "paragraph")
        content = block.get("content", "")
        
        # Convert content to TextRun format
        text_runs = []
        if isinstance(content, list):
            # Already in InlineSegment format
            for seg in content:
                text_runs.append({
                    "text": seg.get("text", ""),
                    "bold": seg.get("bold", False),
                    "italic": seg.get("italic", False),
                    "underline": seg.get("underline", False),
                    "code": seg.get("code", False),
                })
        elif isinstance(content, str):
            # Plain string
            text_runs = [{"text": content}]
        
        # Create block based on type
        if block_type == "heading":
            blocks.append({
                "id": block_id,
                "type": "heading",
                "level": block.get("level", 1),
                "text": text_runs,
                "sectionKey": block.get("section_key"),
            })
        elif block_type == "paragraph":
            blocks.append({
                "id": block_id,
                "type": "paragraph",
                "text": text_runs,
                "sectionKey": block.get("section_key"),
            })
        elif block_type == "list":
            # Convert list items
            items = []
            list_items = block.get("items", [])
            for item in list_items:
                item_text = item.get("text", "") if isinstance(item, dict) else str(item)
                items.append({
                    "id": f"{block_id}_item_{len(items)}",
                    "text": [{"text": item_text}],
                })
            
            blocks.append({
                "id": block_id,
                "type": "list",
                "style": block.get("list_type", "bullet"),
                "items": items,
                "sectionKey": block.get("section_key"),
            })
        elif block_type == "code" or block_type == "preformatted":
            blocks.append({
                "id": block_id,
                "type": "preformatted",
                "text": content if isinstance(content, str) else "",
                "language": block.get("language"),
            })
        elif block_type == "divider":
            blocks.append({
                "id": block_id,
                "type": "divider",
            })
        else:
            # Default to paragraph
            blocks.append({
                "id": block_id,
                "type": "paragraph",
                "text": text_runs,
            })
    
    # Build DocState
    doc_state = {
        "id": file_id,
        "title": record.get("file_id", ""),
        "version": "1.0",
        "blocks": blocks,
    }
    
    return doc_state

def _should_use_flask_ui(feature: str = 'default') -> bool:
    """Always use Flask UI in standalone version."""
    return True

def register_routes(app):  # noqa: D401
    """Register document review routes."""

    def _load_record_and_state(file_id: str) -> Optional[Dict[str, Any]]:
        record = _store.load(file_id)
        if not record:
            return None
        state = record.get("state")
        if not isinstance(state, dict):
            return None
        record["state"] = state
        return record

    def _api_key_or_login_required(f):
        """Decorator that allows API key OR session login."""
        from functools import wraps
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Allow OPTIONS requests (CORS preflight) without authentication
            if request.method == 'OPTIONS':
                return f(*args, **kwargs)
            
            # Check for API key in header
            api_key = request.headers.get('X-API-Key')
            if api_key == 'docreview_dev_key_12345':  # Simple dev key
                return f(*args, **kwargs)
            
            # Fall back to session login - check if user is logged in
            from flask import session
            if 'token' not in session:
                # For API calls, return JSON error instead of redirect
                if request.path.startswith('/api/'):
                    return jsonify({"error": "Authentication required"}), 401
                from flask import redirect, url_for, request as flask_request
                return redirect(url_for('login', next=flask_request.url))
            
            # Validate session token
            session_data = _auth_manager.validate_session(session['token'])
            if not session_data:
                session.pop('token', None)
                if request.path.startswith('/api/'):
                    return jsonify({"error": "Invalid or expired session"}), 401
                from flask import redirect, url_for, request as flask_request
                return redirect(url_for('login', next=flask_request.url))
            
            return f(*args, **kwargs)
        return wrapper

@doc_review_bp.route("/doc-review")
@login_required
def doc_review_dashboard():
    return render_template("doc_review_cockpit.html")

@doc_review_bp.route("/doc-review/documents")
@doc_review_bp.route("/doc-review/documents/")
@login_required
def doc_review_documents():
    """Documents list page - Flask template version"""
    # Check feature flag
    if _should_use_flask_ui('documents'):
        try:
            # Load documents from store
            documents = _store.list_documents()
            return render_template(
                "doc_review_documents.html",
                documents=documents
            )
        except Exception as e:
            logger.error(f"Error loading documents: {e}", exc_info=True)
            return render_template(
                "doc_review_documents.html",
                documents=[],
                error=str(e)
            )
    else:
        # Redirect to React app
        from flask import redirect
        return redirect('/doc-review/app/documents')

@doc_review_bp.route("/doc-review/workspace")
@doc_review_bp.route("/doc-review/workspace/<file_id>")
@login_required
def doc_review_workspace(file_id: Optional[str] = None):
    """Workspace page with editor island - Flask template version"""
    # Check feature flag
    if _should_use_flask_ui('workspace'):
        try:
            doc_state_json = "{}"
            
            if file_id:
                record = _store.load(file_id)
                if record:
                    # Convert to DocState format
                    doc_state = _convert_to_doc_state(record)
                    
                    # Debug: Log block IDs being sent to editor
                    block_ids_from_api = [b.get("id", "") for b in doc_state.get("blocks", [])]
                    logger.info(f"[Workspace] Block IDs from API DocState: {block_ids_from_api[:20]}... (total: {len(block_ids_from_api)})")
                    
                    doc_state_json = json.dumps(doc_state)
            
            return render_template(
                "doc_review_workspace.html",
                file_id=file_id,
                doc_state_json=doc_state_json,
            )
        except Exception as e:
            logger.error(f"Error loading workspace: {e}", exc_info=True)
            return render_template(
                "doc_review_workspace.html",
                file_id=None,
                doc_state_json="{}",
                error=str(e)
            )
    else:
        # Redirect to React app
        from flask import redirect
        if file_id:
            return redirect(f'/doc-review/app/workspace?file={file_id}')
        return redirect('/doc-review/app/workspace')

@doc_review_bp.route("/doc-review/prompts")
@login_required
def doc_review_prompts():
    """Prompts page - Flask template version"""
    if _should_use_flask_ui('prompts'):
        return render_template("doc_review_prompts.html")
    else:
        from flask import redirect
        return redirect('/doc-review/app/prompts')

@doc_review_bp.route("/doc-review/settings")
@login_required
def doc_review_settings():
    """Settings page - Flask template version"""
    if _should_use_flask_ui('settings'):
        return render_template("doc_review_settings.html")
    else:
        from flask import redirect
        return redirect('/doc-review/app/settings')

@doc_review_bp.route("/doc-review/editor-demo")
@doc_review_bp.route("/doc-review/editor-demo/<file_id>")
@login_required
def doc_review_editor_demo(file_id: Optional[str] = None):
    """
    Demo page showing React editor mounted as an "island" in Flask template.
    This demonstrates Option 2: React Island pattern.
    """
    import time
    
    # Get document if file_id provided
    doc_state_json = "{}"
    doc_status = "No document loaded"
    
    if file_id:
        try:
            record = _store.load(file_id)
            if record:
                # Convert backend format to DocState format
                doc_state = _convert_to_doc_state(record)
                doc_state_json = json.dumps(doc_state)
                doc_status = record.get("status", "unknown")
        except Exception as e:
            logger.warning(f"Failed to load document {file_id}: {e}")
            doc_status = f"Error: {str(e)}"
    
    # Cache bust for editor bundle
    cache_bust = int(time.time())
    
    return render_template(
        "doc_review_editor_demo.html",
        file_id=file_id,
        doc_state_json=doc_state_json,
        doc_status=doc_status,
        cache_bust=cache_bust,
    )

@doc_review_bp.route("/doc-review/ide")
@login_required
def doc_review_vscode_dashboard():
    vscode_ready = _vscode_web_dir.exists()
    return render_template(
        "doc_review_vscode_shell.html",
        vscode_ready=vscode_ready,
    )

@doc_review_bp.route("/doc-review/ide/launch")
@login_required
def doc_review_vscode_launch():
    if not _vscode_web_dir.exists():
        return render_template(
            "doc_review_vscode_shell.html",
            vscode_ready=False,
            error="VS Code Web assets missing. Run setup script first.",
        ), 503
    index_path = _vscode_web_dir / "index.html"
    if not index_path.exists():
        return render_template(
            "doc_review_vscode_shell.html",
            vscode_ready=False,
            error="VS Code Web index.html not found.",
        ), 503
    return send_from_directory(_vscode_web_dir, "index.html")

@doc_review_bp.route("/doc-review/ide/assets/<path:filename>")
@login_required
def doc_review_vscode_assets(filename: str):
    if not _vscode_web_dir.exists():
        abort(404)
    return send_from_directory(_vscode_web_dir, filename)

# Angular App Routes
@doc_review_bp.route("/doc-review/app")
@doc_review_bp.route("/doc-review/app/")
@doc_review_bp.route("/doc-review/app/<path:path>")
@login_required
def doc_review_angular_app(path=None):
    """Serve the Angular production build."""
    if not _angular_app_dir.exists():
        return render_template(
            "doc_review_placeholder.html",
            error="Angular app not built yet. Run 'npm run build' in web/static/doc-review-app/"
        ), 503

    # Serve index.html for all routes (Angular handles routing)
    index_path = _angular_app_dir / "index.html"
    if not index_path.exists():
        return "Angular app index.html not found", 404

    # For file requests with extensions, serve the actual file
    if path and '.' in path.split('/')[-1]:
        try:
            return send_from_directory(_angular_app_dir, path)
        except:
            pass

    # For all other routes, serve index.html (SPA routing)
    return send_from_directory(_angular_app_dir, 'index.html')

@doc_review_bp.route("/api/doc_review/welcome", methods=["GET"])
@_api_key_or_login_required
def doc_review_get_welcome_message():
    """Return the welcome message for the chatbot."""
    welcome_path = Path("config/agent_welcome.md")
    if not welcome_path.exists():
        welcome_path = Path("external/config/agent_welcome.md")
    
    if welcome_path.exists():
        try:
            content = welcome_path.read_text(encoding="utf-8")
            return jsonify({"content": content})
        except Exception as exc:
            logger.warning("Failed to read welcome message: %s", exc)
    
    # Fallback welcome message
    return jsonify({
        "content": "Welcome to the Document Review Agent! This tool helps you ingest, analyze, and restructure documents through a streamlined four-phase workflow. Select a document from the left sidebar to begin."
    })

@doc_review_bp.route("/api/doc_review/templates/<template_id>", methods=["GET"])
@login_required
def get_template(template_id: str):
    # Try primary location first
    template_path = Path("config/doc_review/outline_templates") / f"{template_id}.json"
    if not template_path.exists():
        # Fallback to legacy location
        template_path = Path("external/doc_review/templates") / f"{template_id}.json"
    
    if not template_path.exists():
        return jsonify({"error": f"Template '{template_id}' not found"}), 404
    
    try:
        with template_path.open("r", encoding="utf-8") as f:
            data = f.read()
        return jsonify({
            "template_id": template_id,
            "path": str(template_path),
            "content": json.loads(data),
            "location": "config/doc_review/outline_templates" if "config/doc_review" in str(template_path) else "external/doc_review/templates",
        })
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to load template %s: %s", template_id, exc)
        return jsonify({"error": "Template could not be loaded"}), 500

@doc_review_bp.route("/api/doc_review/documents", methods=["GET", "POST"])
@_api_key_or_login_required
def documents():
    if request.method == "GET":
        return jsonify({"documents": _store.list_documents()})

    payload = request.get_json(force=True, silent=True) or {}
    source_path = payload.get("source_path", "").strip()
    if not source_path:
        return jsonify({"error": "source_path is required"}), 400

    path = Path(source_path).expanduser()
    if not path.exists():
        return jsonify({"error": f"File not found at {path}"}), 400

    file_id = payload.get("file_id") or _slugify(path.stem)
    if _store.load(file_id):
        return jsonify({"error": "Document with this file_id already exists"}), 409

    overrides = payload.get("config") or {}
    # Accept overrides directly if no builder available
    config = overrides
    record = _store.save(
        file_id,
        str(path.resolve()),
        state={"config": config},
        status="ready",
    )

    emitter = _make_event_emitter(file_id)
    if emitter:
        emitter(
            "status",
            {
                "status": "ready",
                "message": "Document registered. Run the workflow to process.",
            },
        )

    return jsonify({"document": record}), 201

@doc_review_bp.route("/api/doc_review/documents/<file_id>", methods=["GET", "DELETE"])
@_api_key_or_login_required
def get_or_delete_document(file_id: str):
    if request.method == "DELETE":
        success = _store.delete(file_id)
        if success:
            logger.info(f"Document deleted: {file_id}")
            return jsonify({"message": f"Document '{file_id}' deleted successfully"}), 200
        return jsonify({"error": "Document not found"}), 404
    
    # GET method
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    return jsonify({"document": record})

@doc_review_bp.route("/api/doc_review/documents/<file_id>/phase1_summary", methods=["GET"])
@_api_key_or_login_required
def get_phase1_summary(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    state = record.get("state", {}) or {}
    phase1_stats = state.get("phase1_stats", {})
    phase1_report = state.get("phase1_report", {})
    
    return jsonify({
        "file_id": file_id,
        "phase1_stats": phase1_stats,
        "phase1_report": phase1_report,
    })

@doc_review_bp.route("/api/doc_review/documents/<file_id>/phase1_reports", methods=["GET"])
@_api_key_or_login_required
def get_phase1_reports(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    state = record.get("state", {}) or {}
    return jsonify(
        {
            "file_id": file_id,
            "phase1_stats": state.get("phase1_stats"),
            "phase1_report": state.get("phase1_report"),
            "toc_report": state.get("phase1_toc_report"),
            "structure_analysis": state.get("phase1_structure_report"),
            "template_fitness_reports": state.get(
                "phase1_template_fitness_reports", []
            ),
        }
    )

@doc_review_bp.route(
    "/api/doc_review/documents/<file_id>/template_fitness",
    methods=["POST"],
)
@login_required
def run_template_fitness_analysis(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    state = record.get("state", {}) or {}
    if not state.get("raw_markdown"):
        return jsonify(
            {
                "error": "Phase 1 must be completed before running template fitness analysis."
            },
            400,
        )

    body = request.get_json(force=True, silent=True) or {}
    template_id = body.get("template_id") or state.get("config", {}).get(
        "template", {}
    ).get("template_id")
    if not template_id:
        return jsonify({"error": "template_id is required"}), 400

    template_label = body.get("template_label")
    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Document missing source_path"}), 500

    working_state = dict(state)
    working_state["file_id"] = file_id
    working_state["source_path"] = source_path
    # Config is no longer used - agent uses its own config file
    working_state = _agent._initialise_state(working_state)

    try:
        working_state = _agent._node_template_fitness_analysis_llm(
            working_state,
            template_id,
            template_label=template_label,
        )
        updated = _store.save(
            file_id, source_path, working_state, record.get("status", "ready")
        )
        latest_report = (
            working_state.get("phase1_template_fitness_reports", []) or []
        )
        latest = latest_report[-1] if latest_report else {}
        return jsonify(
            {
                "document": updated,
                "template_report": latest,
            }
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Template fitness analysis failed for %s", file_id)
        return jsonify({"error": str(exc)}), 500

@doc_review_bp.route("/api/doc_review/upload_dir/files", methods=["GET"])
@login_required
def list_upload_dir_files():
    """List all files in the upload directory."""
    files = []
    if _upload_dir.exists():
        for path in sorted(_upload_dir.glob("*")):
            if path.is_file():
                stat = path.stat()
                files.append({
                    "filename": path.name,
                    "path": str(path.resolve()),
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat() + "Z",
                })
    return jsonify({
        "upload_dir": str(_upload_dir.resolve()),
        "files": files,
    })

@doc_review_bp.route("/api/doc_review/documents/<file_id>/run_phase1", methods=["POST"])
@_api_key_or_login_required
def run_phase1_only(file_id: str):
    """Run Phase 0 ingestion only (converts document to markdown with block metadata)."""
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    body = request.get_json(force=True, silent=True) or {}
    template_id = body.get("template_id")
    use_direct_json = body.get("use_direct_json", True)  # Default to direct JSON
    
    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Stored document missing source_path"}), 500
    
    emitter = _make_event_emitter(file_id)
    _agent.set_event_emitter(emitter)
    
    try:
        _store.update_status(file_id, "running")
        
        # Set environment variable for tool to use
        import os
        os.environ['USE_DIRECT_PDF_JSON'] = 'true' if use_direct_json else 'false'
        
        # Run Phase 1 using the agent's method
        state = _agent.run_phase1(
            document_path=source_path,
            run_id=file_id,
            template_id=template_id,
        )
        # Save the completed state
        updated = _store.save(file_id, source_path, state, status="ready")
        if emitter:
            emitter(
                "status",
                {
                    "status": "ready",
                    "message": "Phase 1 completed successfully",
                },
            )
            # Also notify UI that raw markdown is available (if present)
            try:
                raw_md = (state.get("raw_markdown") or "").strip()
                if raw_md:
                    emitter("markdown_ready", {"path": "/raw.md", "bytes": len(raw_md)})
            except Exception:
                logger.exception("Failed to emit markdown_ready event for %s", file_id)
        return jsonify({"document": updated})
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Phase 1 run failed for %s", file_id)
        _store.update_status(file_id, "error")
        if emitter:
            emitter(
                "log",
                {
                    "node": "workflow",
                    "message": str(exc),
                    "level": "error",
                },
            )
            emitter(
                "status",
                {
                    "status": "error",
                    "message": str(exc),
                },
            )
        return jsonify({"error": str(exc)}), 500

@doc_review_bp.route("/api/doc_review/documents/<file_id>/analyze", methods=["POST"])
@_api_key_or_login_required
def analyze_document(file_id: str):
    """Run full document analysis workflow (TOC review + 4 holistic checks + synthesis)."""
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    # Load existing state
    existing_state = record.get("state", {})
    if not existing_state:
        return jsonify({"error": "Document must be ingested first. Please run Phase 1."}), 400
    
    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Stored document missing source_path"}), 500
    
    emitter = _make_event_emitter(file_id)
    _agent.set_event_emitter(emitter)
    
    try:
        _store.update_status(file_id, "running")
        
        # Use existing state from store
        state = existing_state.copy()
        state["doc_id"] = file_id
        
        # Always start analysis workflow from phase1_toc_review
        state["control"] = "phase1_toc_review"
        
        # Run orchestrator from current control point
        state = _agent.orchestrate(state)
        
        # Save the completed state
        updated = _store.save(file_id, source_path, state, status="ready")
        
        if emitter:
            emitter(
                "status",
                {
                    "status": "ready",
                    "message": "Analysis completed successfully",
                    "control": state.get("control"),
                },
            )
        
        return jsonify({
            "status": "completed",
            "control": state.get("control"),
            "document": updated
        })
        
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Document analysis failed for %s", file_id)
        _store.update_status(file_id, "error")
        if emitter:
            emitter(
                "log",
                {
                    "node": "workflow",
                    "message": str(exc),
                    "level": "error",
                },
            )
            emitter(
                "status",
                {
                    "status": "error",
                    "message": str(exc),
                },
            )
        return jsonify({"error": str(exc)}), 500

# DEPRECATED: Agent planner not used by React editor
# @doc_review_bp.route("/api/doc_review/handle_user_message", methods=["POST"])
# @login_required
def handle_user_message_api_DEPRECATED():
    payload = request.get_json(force=True, silent=True) or {}
    file_id = (payload.get("file_id") or "").strip()
    user_message = (payload.get("message") or "").strip()
    auto_execute = bool(payload.get("auto_execute", True))
    if not file_id or not user_message:
        return jsonify({"error": "file_id and message are required"}), 400

    record = _load_record_and_state(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Document missing source path"}), 500

    state = record["state"]
    emitter = _make_event_emitter(file_id)
    previous_emitter = _agent.event_emitter
    _agent.set_event_emitter(emitter)

    session_id = (
        session.get("user_id")
        or session.get("email")
        or session.get("username")
        or request.headers.get("X-Session-ID")
        or request.remote_addr
        or "anonymous"
    )

    try:
        result = _agent.handle_user_message(
            state,
            user_message,
            auto_execute=auto_execute,
            session_id=str(session_id),
        )
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 409
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("handle_user_message failed for %s", file_id)
        return jsonify({"error": str(exc)}), 500
    finally:
        _agent.set_event_emitter(previous_emitter)

    updated = _store.save(
        file_id,
        source_path,
        state,
        record.get("status", "ready"),
    )
    return jsonify({"result": result, "document": updated})

def _build_vfs_adapter(file_id: str) -> Tuple[Dict[str, Any], DocReviewVFSAdapter]:
    record = _load_record_and_state(file_id)
    if not record:
        raise KeyError("Document not found")
    adapter = DocReviewVFSAdapter(record["state"])
    return record, adapter

def _emit_vfs_event(file_id: str, path: str) -> None:
    emitter = _make_event_emitter(file_id)
    if emitter:
        emitter(
            "vfs_file_updated",
            {
                "path": path,
                "message": "VFS file updated",
            },
        )

@doc_review_bp.route("/api/doc_review/vfs/tree", methods=["GET"])
@_api_key_or_login_required
def doc_review_vfs_tree():
    file_id = (request.args.get("file_id") or "").strip()
    path = request.args.get("path") or "/"
    if not file_id:
        return jsonify({"error": "file_id is required"}), 400
    try:
        record, adapter = _build_vfs_adapter(file_id)
        entries = adapter.list_dir(path)
        return jsonify({"file_id": file_id, "path": path, "entries": entries})
    except KeyError:
        return jsonify({"error": "Document not found"}), 404
    except FileNotFoundError:
        return jsonify({"error": f"Path '{path}' not found"}), 404

@doc_review_bp.route("/api/doc_review/vfs/stat", methods=["GET"])
@_api_key_or_login_required
def doc_review_vfs_stat():
    file_id = (request.args.get("file_id") or "").strip()
    path = request.args.get("path") or "/"
    if not file_id:
        return jsonify({"error": "file_id is required"}), 400
    try:
        _, adapter = _build_vfs_adapter(file_id)
        stat = adapter.stat(path)
        return jsonify({"file_id": file_id, "stat": stat})
    except KeyError:
        return jsonify({"error": "Document not found"}), 404
    except FileNotFoundError:
        return jsonify({"error": f"Path '{path}' not found"}), 404

@doc_review_bp.route("/api/doc_review/vfs/file", methods=["GET", "PATCH"])
@_api_key_or_login_required
def doc_review_vfs_file():
    if request.method == "GET":
        file_id = (request.args.get("file_id") or "").strip()
        if not file_id:
            return jsonify({"error": "file_id is required"}), 400
        path = request.args.get("path") or "/"
        try:
            _, adapter = _build_vfs_adapter(file_id)
            content = adapter.read_file(path)
            return jsonify({"file_id": file_id, "path": path, "content": content})
        except KeyError:
            return jsonify({"error": "Document not found"}), 404
        except FileNotFoundError:
            return jsonify({"error": f"Path '{path}' not found"}), 404

    body = request.get_json(force=True, silent=True) or {}
    file_id = (body.get("file_id") or "").strip()
    path = body.get("path") or ""
    data = body.get("data")
    if not file_id:
        return jsonify({"error": "file_id is required"}), 400
    if not path:
        return jsonify({"error": "path is required"}), 400
    if data is None:
        return jsonify({"error": "data is required"}), 400
    if not isinstance(data, str):
        data = json.dumps(data, ensure_ascii=False)

    try:
        record, adapter = _build_vfs_adapter(file_id)
        adapter.write_file(path, data)
        updated = _store.save(
            file_id,
            record.get("source_path"),
            record["state"],
            record.get("status", "ready"),
        )
        _emit_vfs_event(file_id, path)
        return jsonify({"file_id": file_id, "path": path, "document": updated})
    except KeyError:
        return jsonify({"error": "Document not found"}), 404
    except FileNotFoundError:
        return jsonify({"error": f"Path '{path}' not found"}), 404
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

# DEPRECATED: Phase 2 LLM workflow not used by React editor (uses TemplateProcessor instead)
# @doc_review_bp.route("/api/doc_review/documents/<file_id>/run_phase2", methods=["POST"])
# @_api_key_or_login_required
def run_phase2_only_DEPRECATED(file_id: str):
    """DEPRECATED: Run only Phase 2 (section extraction & reviews) workflow."""
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    # Check if Phase 1 is completed (needed for Phase 2)
    existing_state = record.get("state", {}) or {}
    if not existing_state:
        return jsonify({"error": "Phase 1 must be completed before running Phase 2. Please run Phase 1 first."}), 400
    
    body = request.get_json(force=True, silent=True) or {}
    section_scope = body.get("section_scope")  # Optional: specific sections to review
    
    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Stored document missing source_path"}), 500
    
    emitter = _make_event_emitter(file_id)
    _agent.set_event_emitter(emitter)
    
    try:
        _store.update_status(file_id, "running")
        
        # Run Phase 2 using the agent's method
        state = _agent.run_phase2(
            state=existing_state,
            section_scope=section_scope,
        )
        
        # Save the completed state
        updated = _store.save(file_id, source_path, state, status="ready")
        if emitter:
            emitter(
                "status",
                {
                    "status": "ready",
                    "message": "Phase 2 completed successfully",
                },
            )
        return jsonify({"document": updated})
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Phase 2 run failed for %s", file_id)
        _store.update_status(file_id, "error")
        if emitter:
            emitter(
                "log",
                {
                    "node": "workflow",
                    "message": str(exc),
                    "level": "error",
                },
            )
            emitter(
                "status",
                {
                    "status": "error",
                    "message": str(exc),
                },
            )
        return jsonify({"error": str(exc)}), 500

@doc_review_bp.route("/api/doc_review/documents/<file_id>/config", methods=["PATCH"])
@_api_key_or_login_required
def update_document_config(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    overrides = request.get_json(force=True, silent=True) or {}
    if not isinstance(overrides, dict):
        return jsonify({"error": "Config payload must be an object"}), 400

    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Stored document missing source_path"}), 500

    existing_state = record.get("state") or {}
    if not isinstance(existing_state, dict):
        existing_state = {}

    # Accept overrides directly if no builder available
    existing_state["config"] = overrides
    updated = _store.save(file_id, source_path, existing_state, status="ready")

    emitter = _make_event_emitter(file_id)
    if emitter:
        emitter(
            "status",
            {
                "status": "ready",
                "message": "Configuration saved. Run the workflow when ready.",
            },
        )

    return jsonify({"document": updated})

# DEPRECATED: Full Phase 1/2/3 workflow not used by React editor
# @doc_review_bp.route("/api/doc_review/documents/<file_id>/run", methods=["POST"])
# @_api_key_or_login_required
def run_document_workflow_DEPRECATED(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Stored document missing source_path"}), 500

    state_input = {
        "file_id": file_id,
        "source_path": source_path,
    }

    emitter = _make_event_emitter(file_id)

    try:
        _store.update_status(file_id, "running")
        state = _agent.run(state_input, event_emitter=emitter)
        updated = _store.save(file_id, source_path, state, status="completed")
        if emitter:
            emitter(
                "status",
                {
                    "status": "completed",
                    "message": "Workflow completed successfully",
                },
            )
        return jsonify({"document": updated})
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Doc review run failed for %s", file_id)
        _store.update_status(file_id, "error")
        if emitter:
            emitter(
                "log",
                {
                    "node": "workflow",
                    "message": str(exc),
                    "level": "error",
                },
            )
            emitter(
                "status",
                {
                    "status": "error",
                    "message": str(exc),
                },
            )
        return jsonify({"error": str(exc)}), 500

@doc_review_bp.route("/api/doc_review/upload", methods=["POST"])
@_api_key_or_login_required
def upload_document():
    if "file" not in request.files:
        return jsonify({"error": "file field is required"}), 400

    uploaded = request.files["file"]
    original_name = uploaded.filename or ""
    filename = secure_filename(original_name)
    if not filename:
        return jsonify({"error": "Selected file has no name"}), 400

    stem = Path(filename).stem or "document"
    unique_name = f"{uuid4().hex}_{filename}"
    target_path = _upload_dir / unique_name
    try:
        uploaded.save(str(target_path))
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Doc review upload failed for %s: %s", filename, exc)
        return jsonify({"error": "Failed to save uploaded file"}), 500

    return jsonify(
        {
            "file_id": stem,
            "saved_path": str(target_path.resolve()),
            "original_filename": original_name,
        }
    ), 201

@doc_review_bp.route("/api/doc_review/documents/<file_id>/markdown", methods=["PUT"])
@_api_key_or_login_required
def update_document_markdown(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    payload = request.get_json(force=True, silent=True) or {}
    markdown = payload.get("markdown", "")
    toc_markdown = payload.get("toc_markdown")
    block_metadata = payload.get("block_metadata")  # New: save block metadata
    accepted_suggestions = payload.get("accepted_suggestions")  # New: track accepted suggestions
    rejected_suggestions = payload.get("rejected_suggestions")  # New: track rejected suggestions

    if not isinstance(markdown, str) or not markdown.strip():
        return jsonify({"error": "markdown must be a non-empty string"}), 400

    updated = _store.update_markdown(
        file_id, 
        markdown, 
        toc_markdown,
        block_metadata=block_metadata,
        accepted_suggestions=accepted_suggestions,
        rejected_suggestions=rejected_suggestions
    )
    if not updated:
        return jsonify({"error": "Unable to persist markdown"}), 500

    return jsonify({"document": updated})

@doc_review_bp.route("/api/doc_review/chat/<file_id>", methods=["POST"])
@login_required
def doc_review_chat(file_id: str):
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404

    body = request.get_json(force=True, silent=True) or {}
    user_message = body.get("message", "").strip()
    if not user_message:
        return jsonify({"error": "message is required"}), 400
    selection = body.get("selected_text", "").strip() or None

    try:
        document_state = record.get("state", {}) or {}
        reply = generate_chat_reply(user_message, document_state, selection=selection)
    except LLMNotAvailableError:
        return jsonify({"error": "LLM not configured for chat"}), 503
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Doc review chat failed for %s: %s", file_id, exc)
        return jsonify({"error": "Chat processing failed"}), 500

    updated = _store.append_chat_message(file_id, user_message, reply, selection=selection)
    if updated:
        record = updated

    return jsonify({
        "file_id": file_id,
        "message": user_message,
        "response": reply,
        "selection": selection,
        "chat_history": record.get("state", {}).get("chat_history", []),
        "document_status": record.get("status"),
    })

@doc_review_bp.route("/api/doc_review/ask_riskgpt", methods=["POST"])
@_api_key_or_login_required
def ask_riskgpt():
    """Ask RiskGPT to improve selected blocks or answer general questions."""
    body = request.get_json(force=True, silent=True) or {}
    file_id = body.get("file_id", "").strip()
    selected_block_ids = body.get("selected_block_ids", [])  # Empty for general chat
    user_prompt = body.get("user_prompt", "").strip()
    conversation_history = body.get("conversation_history", [])  # Last 5 messages
    
    if not file_id:
        return jsonify({"error": "file_id is required"}), 400
    if not user_prompt:
        return jsonify({"error": "user_prompt is required"}), 400
    
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    try:
        document_state = record.get("state", {}) or {}
        full_markdown = document_state.get("raw_markdown", "")
        block_metadata = document_state.get("block_metadata", [])
        
        if not full_markdown:
            return jsonify({"error": "Document has no markdown content"}), 400
        
        # Get template info
        template_name = document_state.get("template_name")
        template_content = None
        if template_name:
            from external.doc_review.template_processor import load_template
            template_content = load_template(template_name)
        
        # Get all suggestions
        template_improvements = document_state.get("template_improvements", [])
        accepted_suggestions = set(document_state.get("accepted_suggestions", []))
        rejected_suggestions = set(document_state.get("rejected_suggestions", []))
        
        all_suggestions = []
        for imp in template_improvements:
            block_id = imp.get("block_id")
            status = "pending"
            if block_id in accepted_suggestions:
                status = "accepted"
            elif block_id in rejected_suggestions:
                status = "rejected"
            all_suggestions.append({
                "block_id": block_id,
                "status": status,
                "reasoning": imp.get("reasoning", ""),
                "changes_made": imp.get("changes_made", [])
            })
        
        # Find selected blocks (empty for general chat)
        selected_blocks = []
        if selected_block_ids and block_metadata:
            selected_blocks = [b for b in block_metadata if b["id"] in selected_block_ids]
        
        # Call RiskGPT Agent
        from external.products.doc_review.riskgpt.agent import RiskGPTAgent
        agent = RiskGPTAgent()
        result = agent.run(
            file_id=file_id,
            user_prompt=user_prompt,
            selected_block_ids=selected_block_ids,
            conversation_history=conversation_history,
            document_state=document_state,
            template_content=template_content
        )
        
        return jsonify({
            "file_id": file_id,
            "analysis": result.get("analysis", ""),
            "suggestions": result.get("suggestions", []),
            "selected_block_ids": selected_block_ids,
            "user_prompt": user_prompt,
            "intent": result.get("intent"),
            "intent_confidence": result.get("intent_confidence"),
            "metrics": result.get("metrics")
        })
        
    except LLMNotAvailableError:
        return jsonify({"error": "LLM not configured for RiskGPT"}), 503
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Ask RiskGPT failed for %s: %s", file_id, exc)
        return jsonify({"error": f"RiskGPT processing failed: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/templates", methods=["GET"])
@_api_key_or_login_required
def get_templates():
    """List available templates."""
    try:
        templates = list_templates()
        return jsonify({"templates": templates})
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to list templates: %s", exc)
        return jsonify({"error": f"Failed to list templates: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/templates/<template_name>/content", methods=["GET"])
@_api_key_or_login_required
def get_template_content(template_name: str):
    """Get markdown template content."""
    try:
        from external.doc_review.template_processor import load_template
        content = load_template(template_name)
        return jsonify({
            "template_name": template_name,
            "content": content
        })
    except FileNotFoundError:
        return jsonify({"error": f"Template '{template_name}' not found"}), 404
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to load template content: %s", exc)
        return jsonify({"error": f"Failed to load template: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/templates/upload", methods=["POST"])
@_api_key_or_login_required
def upload_template():
    """Upload a new template."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.endswith('.md'):
        return jsonify({"error": "Only markdown (.md) files are supported"}), 400
    
    try:
        template_name = secure_filename(file.filename[:-3])  # Remove .md extension
        template_dir = Path("data/templates")
        template_dir.mkdir(parents=True, exist_ok=True)
        
        template_path = template_dir / f"{template_name}.md"
        file.save(str(template_path))
        
        logger.info(f"Template uploaded: {template_name}")
        return jsonify({
            "template_name": template_name,
            "message": f"Template '{template_name}' uploaded successfully"
        })
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Template upload failed: %s", exc)
        return jsonify({"error": f"Template upload failed: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/templates/<template_name>", methods=["DELETE"])
@_api_key_or_login_required
def delete_template(template_name: str):
    """Delete a template file."""
    try:
        template_dir = Path("data/templates")
        template_path = template_dir / f"{template_name}.md"
        
        if not template_path.exists():
            return jsonify({"error": f"Template '{template_name}' not found"}), 404
        
        template_path.unlink()
        logger.info(f"Template deleted: {template_name}")
        return jsonify({
            "message": f"Template '{template_name}' deleted successfully"
        }), 200
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Template delete failed: %s", exc)
        return jsonify({"error": f"Template delete failed: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/documents/<file_id>/apply_template", methods=["POST"])
@_api_key_or_login_required
def apply_template(file_id: str):
    """Apply a template to a document for gap analysis and improvement."""
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    data = request.get_json() or {}
    template_name = data.get("template_name")
    
    if not template_name:
        return jsonify({"error": "template_name is required"}), 400
    
    try:
        # Load document state
        state = record.get("state", {})
        full_markdown = state.get("raw_markdown")
        block_metadata = state.get("block_metadata", [])
        
        if not full_markdown:
            return jsonify({"error": "Document not yet processed (missing raw_markdown)"}), 400
        
        if not block_metadata:
            return jsonify({"error": "Document missing block metadata"}), 400
        
        # Load template
        template_content = load_template(template_name)
        
        # Initialize template processor
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return jsonify({"error": "ANTHROPIC_API_KEY not configured"}), 503
        
        processor = TemplateProcessor(api_key)
        
        # Update status
        _store.update_status(file_id, "running")
        emitter = _make_event_emitter(file_id)
        if emitter:
            emitter("status", {
                "status": "running",
                "message": f"Applying template '{template_name}'..."
            })
        
        # Process document with template
        gap_analysis, improvements = processor.process_document_with_template(
            full_markdown=full_markdown,
            block_metadata=block_metadata,
            template_content=template_content,
            template_name=template_name
        )
        
        # Generate synthesis summary
        file_metadata = state.get("file_metadata", {})
        document_title = file_metadata.get("file_name", file_id)
        total_pages = len(set(b.get("page", 1) for b in block_metadata))
        
        synthesis_summary = processor.generate_synthesis_summary(
            template_name=template_name,
            document_title=document_title,
            total_pages=total_pages,
            all_gap_analyses=gap_analysis,
            all_suggestions=improvements
        )
        
        # Store results in state
        state["template_applied"] = template_name
        state["template_gap_analysis"] = gap_analysis
        state["template_improvements"] = improvements
        state["template_synthesis"] = synthesis_summary
        
        # Save updated state
        source_path = record.get("source_path")
        updated = _store.save(file_id, source_path, state, status="ready")
        
        if emitter:
            emitter("status", {
                "status": "ready",
                "message": f"Template '{template_name}' applied successfully"
            })
            emitter("template_applied", {
                "template_name": template_name,
                "gap_count": len(gap_analysis),
                "improvement_count": len(improvements),
                "synthesis": synthesis_summary
            })
        
        return jsonify({
            "file_id": file_id,
            "template_name": template_name,
            "gap_analysis": gap_analysis,
            "improvements": improvements,
            "synthesis": synthesis_summary,
            "document": updated
        })
        
    except FileNotFoundError:
        return jsonify({"error": f"Template '{template_name}' not found"}), 404
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Template application failed for %s: %s", file_id, exc)
        _store.update_status(file_id, "error")
        if emitter:
            emitter("status", {
                "status": "error",
                "message": f"Template application failed: {str(exc)}"
            })
        return jsonify({"error": f"Template application failed: {str(exc)}"}), 500

# DEPRECATED: Phase 4 not used by React editor
# @doc_review_bp.route("/api/doc_review/documents/<file_id>/run_phase4", methods=["POST"])
# @_api_key_or_login_required
def run_phase4_only_DEPRECATED(file_id: str):
    """DEPRECATED: Run only Phase 4 (output artefacts: TOC, assemble, annotate) workflow."""
    record = _store.load(file_id)
    if not record:
        return jsonify({"error": "Document not found"}), 404
    
    # Check if Phase 2 is completed (needed for Phase 4). If not, create minimal fallbacks so Phase 4 can proceed.
    existing_state = record.get("state", {}) or {}
    if not existing_state.get("chunks"):
        existing_state["chunks"] = []
    if not existing_state.get("index"):
        existing_state["index"] = {}
    
    source_path = record.get("source_path")
    if not source_path:
        return jsonify({"error": "Stored document missing source_path"}), 500
    
    # Start from existing state (preserve all previous phase results)
    state_input = {
        "file_id": file_id,
        "source_path": source_path,
    }
    
    # Merge existing state to preserve all previous phase data
    state_input.update({
        "file_type": existing_state.get("file_type"),
        "md_file_id": existing_state.get("md_file_id"),
        "md_path": existing_state.get("md_path"),
        "raw_markdown": existing_state.get("raw_markdown"),
        "images": existing_state.get("images", []),
        "file_metadata": existing_state.get("file_metadata", {}),
        "heading_structure": existing_state.get("heading_structure", []),
        "phase1_stats": existing_state.get("phase1_stats"),
        "phase1_report": existing_state.get("phase1_report"),
        "chunking_decision": existing_state.get("chunking_decision"),
        "chunks": existing_state.get("chunks", []),
        "index": existing_state.get("index", {}),
        "template": existing_state.get("template", {}),
        "phase3_stats": existing_state.get("phase3_stats"),
        "phase3_report": existing_state.get("phase3_report"),
    })
    
    emitter = _make_event_emitter(file_id)
    
    try:
        _store.update_status(file_id, "running")
        
        # Initialize state from existing data
        state = _agent._initialise_state(state_input)
        # Restore all existing state fields
        for key in existing_state.keys():
            if key not in ["config"]:  # config is handled above
                state[key] = existing_state[key]
        
        if emitter:
            emitter(
                "status",
                {
                    "status": "running",
                    "message": "Phase 4 workflow started",
                },
            )
        
        # Phase 4: output artefacts only
        state = _agent._node_generate_toc_from_index(state)
        state = _agent._node_assemble_improved_markdown(state)
        state = _agent._node_annotate_markdown_for_ui(state)
        
        updated = _store.save(file_id, source_path, state, status="ready")
        if emitter:
            emitter(
                "status",
                {
                    "status": "ready",
                    "message": "Phase 4 completed successfully",
                },
            )
        return jsonify({"document": updated})
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Phase 4 run failed for %s", file_id)
        _store.update_status(file_id, "error")
        if emitter:
            emitter(
                "log",
                {
                    "node": "workflow",
                    "message": str(exc),
                    "level": "error",
                },
            )
            emitter(
                "status",
                {
                    "status": "error",
                    "message": str(exc),
                },
            )
        return jsonify({"error": str(exc)}), 500

@doc_review_bp.route("/api/doc_review/token", methods=["GET"])
@login_required
def doc_review_token():
    token = session.get("token")
    if not token:
        return jsonify({"error": "No active session"}), 401
    response = jsonify({"token": token})
    response.set_cookie("mcp_token", token, httponly=False, samesite="Lax")
    return response

# Dev-only token for Socket.IO (no login) guarded by API key
@doc_review_bp.route("/api/doc_review/dev_token", methods=["GET"])
def doc_review_dev_token():
    api_key = request.headers.get('X-API-Key')
    if api_key != 'docreview_dev_key_12345':
        return jsonify({"error": "Unauthorized"}), 401
    try:
        # Try existing session token on flask session
        tok = session.get("token")
        if not tok:
            # Fallback: authenticate default admin (dev only)
            tok = _auth_manager.authenticate("admin", "admin123")
            if not tok:
                return jsonify({"error": "Unable to mint dev token"}), 500
            session["token"] = tok
        resp = jsonify({"token": tok, "dev": True})
        resp.set_cookie("mcp_token", tok, httponly=False, samesite="Lax")
        return resp
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

@doc_review_bp.route("/api/doc_review/prompts", methods=["GET"])
@_api_key_or_login_required
def list_prompts():
    """List all available prompts."""
    try:
        prompts_dir = Path("external/products/doc_review/prompts")
        if not prompts_dir.exists():
            return jsonify({"prompts": []})
        
        prompts = []
        # Include both .txt and .md files
        for prompt_file in prompts_dir.glob("*"):
            if prompt_file.suffix in [".txt", ".md"]:
                prompts.append({
                    "name": prompt_file.stem,
                    "filename": prompt_file.name,
                    "size": prompt_file.stat().st_size
                })
        
        return jsonify({"prompts": sorted(prompts, key=lambda x: x["name"])})
    except Exception as exc:
        logger.exception("Failed to list prompts: %s", exc)
        return jsonify({"error": f"Failed to list prompts: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/prompts/<prompt_name>", methods=["GET"])
@_api_key_or_login_required
def get_prompt(prompt_name: str):
    """Get prompt content by name."""
    try:
        prompts_dir = Path("external/products/doc_review/prompts")
        
        # Try both .txt and .md extensions
        prompt_path = None
        for ext in [".txt", ".md"]:
            candidate = prompts_dir / f"{prompt_name}{ext}"
            if candidate.exists():
                prompt_path = candidate
                break
        
        if not prompt_path:
            return jsonify({"error": f"Prompt '{prompt_name}' not found"}), 404
        
        content = prompt_path.read_text(encoding="utf-8")
        # Return plain text for frontend textarea
        return content, 200, {'Content-Type': 'text/plain; charset=utf-8'}
    except Exception as exc:
        logger.exception("Failed to get prompt: %s", exc)
        return jsonify({"error": f"Failed to get prompt: {str(exc)}"}), 500

@doc_review_bp.route("/api/doc_review/prompts/<prompt_name>", methods=["PUT"])
@_api_key_or_login_required
def update_prompt(prompt_name: str):
    """Update prompt content."""
    try:
        # Accept plain text body
        content = request.get_data(as_text=True)
        
        if not content:
            return jsonify({"error": "content is required"}), 400
        
        prompts_dir = Path("external/products/doc_review/prompts")
        prompts_dir.mkdir(parents=True, exist_ok=True)
        
        # Determine existing file extension or default to .md
        prompt_path = None
        for ext in [".txt", ".md"]:
            candidate = prompts_dir / f"{prompt_name}{ext}"
            if candidate.exists():
                prompt_path = candidate
                break
        
        # If file doesn't exist, create as .md
        if not prompt_path:
            prompt_path = prompts_dir / f"{prompt_name}.md"
        
        prompt_path.write_text(content, encoding="utf-8")
        
        logger.info(f"Prompt updated: {prompt_name}")
        return jsonify({
            "name": prompt_name,
            "message": f"Prompt '{prompt_name}' updated successfully"
        })
    except Exception as exc:
        logger.exception("Failed to update prompt: %s", exc)
        return jsonify({"error": f"Failed to update prompt: {str(exc)}"}), 500

# ===================================================================
# COMMENT MANAGEMENT ROUTES
# ===================================================================

@doc_review_bp.route("/api/doc_review/<file_id>/comments", methods=["GET"])
@_api_key_or_login_required
def list_comments(file_id):
    """List all comments for a document, optionally filtered by block_id."""
    try:
        block_id = request.args.get("block_id")
        comments = _comments.list_comments(file_id, block_id)
        return jsonify({"comments": comments}), 200
    except Exception as e:
        logger.error("Error listing comments: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/comments", methods=["POST"])
@_api_key_or_login_required
def add_comment(file_id):
    """Add a new comment to a block."""
    try:
        data = request.get_json() or {}
        block_id = data.get("block_id")
        block_title = data.get("block_title", "")
        content = data.get("content", "")
        author = data.get("author", "User")
        selection_text = data.get("selection_text")
        start_offset = data.get("start_offset")
        end_offset = data.get("end_offset")
        
        if not block_id or not content:
            return jsonify({"error": "block_id and content are required"}), 400
        
        comment = _comments.add_comment(
            file_id, block_id, block_title, content, author, selection_text, start_offset, end_offset
        )
        
        # Emit socket event for real-time updates
        if _socketio:
            room = f"doc_review:{file_id}"
            _socketio.emit("comment:added", comment, room=room)
        
        return jsonify(comment), 201
    except Exception as e:
        logger.error("Error adding comment: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/comments/<comment_id>/reply", methods=["POST"])
@_api_key_or_login_required
def add_reply(file_id, comment_id):
    """Add a reply to a comment."""
    try:
        data = request.get_json() or {}
        content = data.get("content", "")
        author = data.get("author", "User")
        
        if not content:
            return jsonify({"error": "content is required"}), 400
        
        comment = _comments.add_reply(file_id, comment_id, content, author)
        if not comment:
            return jsonify({"error": "Comment not found"}), 404
        
        # Emit socket event
        if _socketio:
            room = f"doc_review:{file_id}"
            _socketio.emit("comment:reply_added", comment, room=room)
        
        return jsonify(comment), 200
    except Exception as e:
        logger.error("Error adding reply: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/comments/<comment_id>/resolve", methods=["POST"])
@_api_key_or_login_required
def resolve_comment(file_id, comment_id):
    """Toggle resolved status of a comment."""
    try:
        comment = _comments.resolve_comment(file_id, comment_id)
        if not comment:
            return jsonify({"error": "Comment not found"}), 404
        
        # Emit socket event
        if _socketio:
            room = f"doc_review:{file_id}"
            _socketio.emit("comment:resolved", comment, room=room)
        
        return jsonify(comment), 200
    except Exception as e:
        logger.error("Error resolving comment: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/comments/<comment_id>", methods=["DELETE"])
@_api_key_or_login_required
def delete_comment(file_id, comment_id):
    """Delete a comment."""
    try:
        success = _comments.delete_comment(file_id, comment_id)
        if not success:
            return jsonify({"error": "Comment not found"}), 404
        
        # Emit socket event
        if _socketio:
            room = f"doc_review:{file_id}"
            _socketio.emit("comment:deleted", {"comment_id": comment_id}, room=room)
        
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error("Error deleting comment: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/comments/<comment_id>", methods=["PATCH"])
@_api_key_or_login_required
def update_comment(file_id, comment_id):
    """Update a comment's content."""
    try:
        data = request.get_json() or {}
        content = data.get("content")
        
        if not content:
            return jsonify({"error": "content is required"}), 400
        
        comment = _comments.update_comment(file_id, comment_id, content)
        if not comment:
            return jsonify({"error": "Comment not found"}), 404
        
        # Emit socket event
        if _socketio:
            room = f"doc_review:{file_id}"
            _socketio.emit("comment:updated", comment, room=room)
        
        return jsonify(comment), 200
    except Exception as e:
        logger.error("Error updating comment: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/comments/counts", methods=["GET"])
@_api_key_or_login_required
def get_comment_counts(file_id):
    """Get comment counts by block."""
    try:
        counts = _comments.get_comment_count_by_block(file_id)
        return jsonify({"counts": counts}), 200
    except Exception as e:
        logger.error("Error getting comment counts: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

# ===================================================================
# AI SUGGESTIONS MANAGEMENT ROUTES
# ===================================================================

@doc_review_bp.route("/api/doc_review/<file_id>/ai_suggestions", methods=["GET", "OPTIONS"])
@_api_key_or_login_required
def list_ai_suggestions(file_id):
    """List all AI suggestions for a document."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        block_id = request.args.get("block_id")
        suggestions = _ai_suggestions.list_suggestions(file_id, block_id)
        return jsonify({"suggestions": suggestions}), 200
    except Exception as e:
        logger.error("Error listing AI suggestions: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/ai_suggestions", methods=["POST", "OPTIONS"])
@_api_key_or_login_required
def add_ai_suggestion(file_id):
    """Add a new AI suggestion."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json() or {}
        block_id = data.get("block_id")
        selection_text = data.get("selection_text", "")
        improved_text = data.get("improved_text", "")
        status = data.get("status", "pending")
        start_offset = data.get("start_offset")
        end_offset = data.get("end_offset")
        
        if not block_id or not selection_text or not improved_text:
            return jsonify({"error": "block_id, selection_text, and improved_text are required"}), 400
        
        suggestion = _ai_suggestions.add_suggestion(
            file_id, block_id, selection_text, improved_text, status, start_offset, end_offset
        )
        
        return jsonify(suggestion), 201
    except Exception as e:
        logger.error("Error adding AI suggestion: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/ai_suggestions/<suggestion_id>", methods=["PATCH", "OPTIONS"])
@_api_key_or_login_required
def update_ai_suggestion_status(file_id, suggestion_id):
    """Update the status of an AI suggestion (accept/reject)."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json() or {}
        status = data.get("status")
        
        if not status or status not in ["pending", "accepted", "rejected"]:
            return jsonify({"error": "status must be 'pending', 'accepted', or 'rejected'"}), 400
        
        suggestion = _ai_suggestions.update_status(file_id, suggestion_id, status)
        if not suggestion:
            return jsonify({"error": "Suggestion not found"}), 404
        
        return jsonify(suggestion), 200
    except Exception as e:
        logger.error("Error updating AI suggestion: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/ai_suggestions/<suggestion_id>", methods=["DELETE", "OPTIONS"])
@_api_key_or_login_required
def delete_ai_suggestion(file_id, suggestion_id):
    """Delete an AI suggestion."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        success = _ai_suggestions.delete_suggestion(file_id, suggestion_id)
        if not success:
            return jsonify({"error": "Suggestion not found"}), 404
        
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error("Error deleting AI suggestion: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

# ===== Chat History Routes =====

@doc_review_bp.route("/api/doc_review/<file_id>/chat", methods=["GET", "OPTIONS"])
@_api_key_or_login_required
def list_chat_messages(file_id):
    """List all chat messages for a document."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        messages = _chat_history.list_messages(file_id)
        return jsonify({"messages": messages}), 200
    except Exception as e:
        logger.error("Error listing chat messages: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/chat", methods=["POST", "OPTIONS"])
@_api_key_or_login_required
def add_chat_message(file_id):
    """Add a new chat message."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        data = request.get_json() or {}
        role = data.get("role")  # 'user' or 'assistant'
        content = data.get("content", "")
        context = data.get("context")  # Optional selected text
        
        if not role or not content:
            return jsonify({"error": "role and content are required"}), 400
        
        if role not in ['user', 'assistant']:
            return jsonify({"error": "role must be 'user' or 'assistant'"}), 400
        
        message = _chat_history.add_message(
            file_id, role, content, context
        )
        
        return jsonify(message), 201
    except Exception as e:
        logger.error("Error adding chat message: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500

@doc_review_bp.route("/api/doc_review/<file_id>/chat/clear", methods=["POST", "OPTIONS"])
@_api_key_or_login_required
def clear_chat_messages(file_id):
    """Clear all chat messages for a document."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        success = _chat_history.clear_messages(file_id)
        return jsonify({"success": success}), 200
    except Exception as e:
        logger.error("Error clearing chat messages: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500
