"""WSGI entry point for Railway deployment with gunicorn."""
from app.server import create_app

# Create app and socketio
app, socketio = create_app()

# For gunicorn, we need to expose the app
# Socket.IO will work with eventlet worker class

