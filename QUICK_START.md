# Quick Start Guide

## ✅ Setup Complete!

The Doc Review Assistant has been extracted and is ready to run.

## Start the Server

### Option 1: Use the startup script
```bash
cd /Users/saadahmed/samjha_agent/doc-review-assistant
./START_SERVER.sh
```

### Option 2: Manual start
```bash
cd /Users/saadahmed/samjha_agent/doc-review-assistant
source venv/bin/activate
export PYTHONPATH=$(pwd)
python app/server.py
```

## Access the Application

1. Open your browser: **http://localhost:8000**
2. Login with:
   - Username: `admin`
   - Password: `admin123`

## Environment Variables

Make sure your `.env` file contains:
```bash
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=your-secret-key
```

## What's Working

✅ Flask server with all routes  
✅ Authentication (admin/admin123)  
✅ Document list page  
✅ Workspace with editor  
✅ PDF to JSON ingestion  
✅ Comments system  
✅ AI suggestions  
✅ Chat with RiskGPT  

## Directory Structure

```
doc-review-assistant/
├── app/                    # Flask application
│   ├── server.py          # Main server
│   ├── config.py          # Configuration
│   ├── auth.py            # Authentication
│   └── routes/            # Route handlers
├── core/                   # Business logic
│   ├── agent.py           # Doc review agent
│   ├── store.py           # JSON file storage
│   └── ...                # Other modules
├── tools/                  # Utilities
│   ├── llm_client.py      # Anthropic API
│   └── pdf_processor.py   # PDF conversion
├── web/                    # Frontend
│   ├── templates/         # HTML templates
│   └── static/            # CSS, JS, editor
├── config/                 # Configuration files
├── data/                   # Document storage
└── editor/                 # React editor source
```

## Troubleshooting

### Port Already in Use
```bash
export PORT=8001
python app/server.py
```

### Editor Not Loading
Make sure the editor bundle exists:
```bash
ls -la web/static/editor/editor.iife.js
```

If missing, rebuild:
```bash
cd editor
npm install
npm run build:editor
```

## Next Steps

1. Upload a PDF document
2. Wait for ingestion to complete
3. Open the document in the workspace
4. Try adding comments, using AI suggestions, or chatting with RiskGPT

