# Doc Review Assistant - Technical Handover

## Architecture Overview

**Stack**: Flask (Python) + React/Lexical (TypeScript) + Anthropic Claude API + Socket.IO

**Pattern**: State-driven orchestration with file-based JSON storage. The system processes PDFs through a multi-phase pipeline, stores state in JSON files, and provides real-time collaboration via WebSockets.

## Core Components

### 1. **DocReviewAgent** (`core/agent.py`)
State machine orchestrator that runs document review phases:
- **Phase 0 (Ingestion)**: PDF → Images → Claude Vision → JSON blocks
- **Phase 1 (TOC Review)**: LLM analyzes table of contents
- **Phase 2 (Holistic Checks)**: 4 parallel LLM checks (coverage, compliance, language, structure)
- **Phase 2 (Synthesis)**: Executive summary generation

**State Model**: `AgentState` (TypedDict) stored in `data/documents/{file_id}.json`

### 2. **DocReviewStore** (`core/store.py`)
File-based JSON persistence layer:
- Each document = single JSON file: `{file_id}.json`
- Contains: `state` (AgentState), `id`, `source_path`, `status`, timestamps
- Index maintained in `data/documents/index.json`
- Comments, AI suggestions, chat history embedded in document state

### 3. **PDF Processor** (`tools/pdf_processor.py`)
Converts PDFs to structured JSON blocks:
- Uses `pdf2image` to render pages at 300 DPI
- Sends each page image to Claude Vision API (`claude-3-haiku-20240307`)
- Returns BlockEditor-compatible JSON with stable block IDs (`p{page}_b{block}_{hash}`)
- Generates TOC from heading blocks

### 4. **LLM Client** (`tools/llm_client.py`)
Wrapper around Anthropic SDK:
- Singleton pattern with global `_client`
- Methods: `invoke()`, `invoke_with_prompt()`
- Requires `ANTHROPIC_API_KEY` env var

### 5. **Frontend Editor** (`editor/src/`)
React + Lexical-based rich text editor:
- `SingleDocumentEditor.tsx`: Main editor component
- Block-based editing with comments, AI suggestions, highlights
- Real-time sync via Socket.IO
- Auto-saves to `/api/doc_review/documents/{file_id}/markdown` (PUT)

## Data Flow

```
1. Upload → POST /api/doc_review/upload
   └─> Saves PDF to data/uploads/
   └─> Registers document in store

2. Ingestion → POST /api/doc_review/documents/{file_id}/run_phase1
   └─> DocReviewAgent.run_phase1()
   └─> Calls convert_pdf_to_json() (tools/pdf_processor.py)
   └─> Stores result in state.structure.raw_text, block_metadata
   └─> Saves to data/documents/{file_id}.json

3. Phase 2 Analysis → POST /api/doc_review/documents/{file_id}/run_phase2
   └─> Runs 4 LLM checks in sequence
   └─> Stores results in state.phase2_data
   └─> Generates synthesis summary

4. Real-time Updates → Socket.IO events
   └─> node_started, node_completed, markdown_ready
   └─> Frontend subscribes via socket.on()
```

## Key Files & Responsibilities

| File | Purpose |
|------|---------|
| `app/server.py` | Flask app initialization, Socket.IO setup |
| `app/routes/doc_review_routes.py` | REST API endpoints (2000+ lines) |
| `core/agent.py` | Phase orchestration, state transitions |
| `core/store.py` | JSON file persistence |
| `core/comments.py` | Comment CRUD (stored in document state) |
| `core/ai_suggestions.py` | AI suggestion management |
| `core/riskgpt_agent.py` | Q&A chat agent (LangGraph-style) |
| `tools/pdf_processor.py` | PDF → JSON conversion |
| `tools/llm_client.py` | Anthropic API wrapper |
| `config/prompts/*.md` | LLM prompt templates |

## Configuration

**Environment Variables**:
- `ANTHROPIC_API_KEY`: Required for LLM calls
- `SECRET_KEY`: Flask session secret
- `DATA_DIR`: Document storage (default: `data/documents`)
- `UPLOAD_DIR`: PDF uploads (default: `data/uploads`)

**Config File**: `config/config.yaml` (not in git, copy from `config.example.yaml`)

## Important Technical Details

1. **State Persistence**: All state (documents, comments, suggestions) stored in single JSON file per document. No database.

2. **Block IDs**: Format `p{page}_b{block}_{hash}` ensures stability across re-ingestions.

3. **Socket.IO**: Used for real-time progress updates during ingestion/analysis. Events: `node_started`, `node_completed`, `markdown_ready`.

4. **Authentication**: Simple session-based (`app/auth.py`). Default: `admin/admin123`. Can be extended with API keys.

5. **CORS**: Enabled for all origins (`CORS(app, origins=["*"])`). Tighten for production.

6. **Error Handling**: LLM failures are caught and stored in `state.errors[]`. Agent continues with partial results.

7. **Git Tracking**: Document JSON files (with comments) are tracked in git. PDF uploads excluded.

## Common Operations

**Add new LLM prompt**: Add `.md` file to `config/prompts/`, reference in `core/agent.py` via `_invoke_llm_prompt()`.

**Modify ingestion**: Edit `tools/pdf_processor.py` → `_transcribe_page_direct_to_json()`.

**Add new phase**: Extend `DocReviewAgent._build_node_registry()`, add node function, update `NODE_TRANSITIONS`.

**Debug state**: Check `data/documents/{file_id}.json` directly. State structure defined in `core/models.py`.

## Known Limitations

- No database: All state in JSON files (scales to ~100s of documents)
- Synchronous LLM calls: Phase 2 runs checks sequentially (can be parallelized)
- No versioning: Document state overwritten on each save
- Single-threaded: Socket.IO uses `threading` mode (not production-grade)

## Next Steps for Production

1. Add database (PostgreSQL/MongoDB) for state persistence
2. Implement async LLM calls with queue (Celery/RQ)
3. Add document versioning/history
4. Replace file-based auth with OAuth/JWT
5. Add rate limiting and API key management
6. Implement proper error recovery and retries

---

**Repository**: https://github.com/algowizzzz/docasst  
**Entry Point**: `python app/server.py` → http://localhost:8000

