#!/bin/bash
# Start Doc Review Assistant Server

cd "$(dirname "$0")"
source venv/bin/activate

# Set PYTHONPATH
export PYTHONPATH="$(pwd)"

# Load .env if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Start server
python app/server.py

