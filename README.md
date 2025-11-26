# Doc Review Assistant

A standalone document review assistant with AI-powered analysis, commenting, and text improvement features.

## Features

- **PDF to JSON Conversion**: Direct PDF processing using Claude Vision
- **Document Analysis**: 6-section comprehensive analysis (TOC Review, Holistic Checks, Synthesis)
- **Rich Text Editor**: Lexical-based editor with comments and AI suggestions
- **AI Chat**: RiskGPT integration for document Q&A
- **Comments System**: Collaborative commenting with highlights
- **AI Text Improvement**: Context-aware text suggestions

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+ (for building editor)
- poppler-utils (for PDF processing)

### Installation

```bash
# Clone repository
cd doc-review-assistant

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Build editor
cd editor
npm install
npm run build:editor
cd ..

# Create data directories
mkdir -p data/documents data/uploads
```

### Configuration

1. Copy example config:
```bash
cp config/config.example.yaml config/config.yaml
```

2. Set environment variables:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export SECRET_KEY="your-secret-key-here"
```

Or edit `config/config.yaml` directly.

### Run

```bash
python app/server.py
```

Open http://localhost:8000 and login with:
- Username: `admin`
- Password: `admin123`

## Project Structure

```
doc-review-assistant/
├── app/              # Flask application
├── core/             # Core business logic
├── tools/            # Utility functions
├── web/              # Templates and static files
├── editor/           # React/Lexical editor source
├── config/            # Configuration files
└── data/             # Document storage
```

## License

Open Source (TBD)
