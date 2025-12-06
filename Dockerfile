# Multi-stage build for Flask + React app
FROM node:18-alpine AS frontend-builder

WORKDIR /app/editor
COPY editor/package*.json ./
RUN npm ci
COPY editor/ ./
RUN npm run build:editor

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Copy built frontend from builder stage
COPY --from=frontend-builder /app/editor/../web/static/js/editor.*.js ./web/static/js/
COPY --from=frontend-builder /app/editor/../web/static/editor/editor.css ./web/static/editor/

# Create data directories
RUN mkdir -p data/documents data/uploads

# Set environment variables
ENV PYTHONPATH=/app
ENV PORT=8000

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "app/server.py"]

