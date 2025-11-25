"""File-based JSON storage for document review."""

from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.models import AgentState
from tools.file_utils import ensure_directory

logger = logging.getLogger(__name__)


def _timestamp() -> str:
    """Get current timestamp in ISO format."""
    return datetime.utcnow().isoformat() + "Z"


class DocReviewStore:
    """File-based JSON storage for document review runs."""

    def __init__(self, data_dir: str = "data/documents"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.data_dir / "index.json"
        self._ensure_index()

    def _ensure_index(self):
        """Ensure index.json exists."""
        if not self.index_file.exists():
            with open(self.index_file, 'w') as f:
                json.dump({"documents": []}, f, indent=2)

    def _doc_file(self, file_id: str) -> Path:
        """Get path to document JSON file."""
        return self.data_dir / f"{file_id}.json"

    def _source_file(self, file_id: str) -> Path:
        """Get path to source PDF file."""
        return self.data_dir / f"{file_id}_source.pdf"

    def _update_index(self, file_id: str, doc_data: Dict[str, Any]):
        """Update the index.json file."""
        with open(self.index_file, 'r') as f:
            index = json.load(f)
        
        docs = [d for d in index["documents"] if d["id"] != file_id]
        docs.append({
            "id": file_id,
            "title": doc_data.get("title", "Untitled"),
            "status": doc_data.get("status", "unknown"),
            "uploaded_at": doc_data.get("uploaded_at"),
            "updated_at": doc_data.get("updated_at"),
        })
        index["documents"] = sorted(docs, key=lambda x: x.get("updated_at", ""), reverse=True)
        
        with open(self.index_file, 'w') as f:
            json.dump(index, f, indent=2)

    def list_documents(self) -> List[Dict[str, Any]]:
        """List all documents (returns minimal metadata for performance)."""
        documents: List[Dict[str, Any]] = []
        for path in sorted(self.data_dir.glob("*.json")):
            if path.name == "index.json":
                continue
            try:
                with path.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                state = data.get("state", {})
                # Only include essential fields to reduce response size
                metadata = {
                    "file_id": data.get("id") or data.get("file_id"),
                    "source_path": data.get("source_path"),
                    "status": data.get("status", "unknown"),
                    "updated_at": data.get("updated_at"),
                    "file_metadata": state.get("file_metadata"),
                    # Include minimal state for Phase 2 filtering
                    "state": {
                        "structure": {
                            "ingestion_stats": state.get("structure", {}).get("ingestion_stats"),
                        },
                    } if state.get("structure", {}).get("ingestion_stats") else {},
                }
                documents.append(metadata)
            except Exception as exc:
                logger.error("Failed to read doc review state %s: %s", path, exc)
        return documents

    def load(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Load a document by file_id."""
        path = self._doc_file(file_id)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, file_id: str, source_path: str, state: AgentState, status: str) -> Dict[str, Any]:
        """Save a document."""
        # Preserve original_markdown if not yet set and raw_markdown exists
        if state.get("raw_markdown") and not state.get("original_markdown"):
            state["original_markdown"] = state["raw_markdown"]
            logger.info(f"Preserved original_markdown for {file_id}")
        
        # Get title from state
        title = state.get("doc_meta", {}).get("doc_title", "Untitled")
        
        # Check if document already exists
        existing = self.load(file_id)
        uploaded_at = existing.get("uploaded_at") if existing else _timestamp()
        
        payload = {
            "id": file_id,
            "file_id": file_id,  # Keep both for compatibility
            "title": title,
            "source_path": str(source_path),
            "status": status,
            "uploaded_at": uploaded_at,
            "updated_at": _timestamp(),
            "state": state,
        }
        
        path = self._doc_file(file_id)
        ensure_directory(path.parent)
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        
        # Update index
        self._update_index(file_id, payload)
        
        logger.info(f"Saved document {file_id} with status {status}")
        return payload

    def delete(self, file_id: str) -> bool:
        """Delete a document and its source file."""
        doc_path = self._doc_file(file_id)
        source_path = self._source_file(file_id)
        
        deleted = False
        if doc_path.exists():
            doc_path.unlink()
            deleted = True
        
        if source_path.exists():
            source_path.unlink()
        
        # Update index
        with open(self.index_file, 'r') as f:
            index = json.load(f)
        index["documents"] = [d for d in index["documents"] if d["id"] != file_id]
        with open(self.index_file, 'w') as f:
            json.dump(index, f, indent=2)
        
        return deleted

    def update_status(self, file_id: str, status: str) -> bool:
        """Update document status."""
        doc = self.load(file_id)
        if not doc:
            return False
        
        doc["status"] = status
        doc["updated_at"] = _timestamp()
        
        path = self._doc_file(file_id)
        with path.open("w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2)
        
        self._update_index(file_id, doc)
        return True

    def update_markdown(
        self,
        file_id: str,
        markdown: str,
        block_metadata: Optional[List[Dict[str, Any]]] = None,
        accepted_suggestions: Optional[List[str]] = None,
        rejected_suggestions: Optional[List[str]] = None,
    ) -> bool:
        """Update markdown content (for compatibility, though we use JSON blocks)."""
        doc = self.load(file_id)
        if not doc:
            return False
        
        state = doc.get("state", {})
        state["raw_markdown"] = markdown
        
        if block_metadata:
            structure = state.get("structure", {})
            structure["block_metadata"] = block_metadata
            state["structure"] = structure
        
        doc["state"] = state
        doc["updated_at"] = _timestamp()
        
        path = self._doc_file(file_id)
        with path.open("w", encoding="utf-8") as f:
            json.dump(doc, f, indent=2)
        
        self._update_index(file_id, doc)
        return True
