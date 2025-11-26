"""Main Flask application server."""

import logging
from flask import Flask, redirect, url_for
from flask_cors import CORS
from flask_socketio import SocketIO
from datetime import timedelta

from app.config import load_config
from app.routes.auth_routes import auth_bp

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = None
socketio = None


def create_app():
    """Create and configure Flask application."""
    global app, socketio
    
    # Load configuration
    config = load_config()
    
    # Create Flask app
    app = Flask(__name__,
                template_folder='../web/templates',
                static_folder='../web/static')
    
    # Apply configuration
    app.config['SECRET_KEY'] = config.get('SECRET_KEY', 'dev-secret-key')
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
    app.config['MAX_CONTENT_LENGTH'] = config.get('MAX_UPLOAD_SIZE', 50 * 1024 * 1024)
    
    # Setup CORS
    CORS(app, supports_credentials=True, origins=["*"])
    
    # Initialize Socket.IO
    socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
    
    # Register blueprints (doc_review will be registered later)
    app.register_blueprint(auth_bp)
    
    # Root route
    @app.route('/')
    def index():
        return redirect(url_for('auth.login'))
    
    # Register doc review routes (will be done after import)
    try:
        from app.routes.doc_review_routes import doc_review_bp, init_doc_review_routes
        init_doc_review_routes(socketio)
        app.register_blueprint(doc_review_bp)
        logger.info("Doc review routes registered")
    except ImportError as e:
        logger.warning(f"Doc review routes not available: {e}")
    
    # Register Socket.IO handlers
    try:
        from app.socketio_handlers import register_socketio_handlers
        register_socketio_handlers(socketio)
        logger.info("Socket.IO handlers registered")
    except ImportError as e:
        logger.warning(f"Socket.IO handlers not available: {e}")
    
    return app, socketio


if __name__ == '__main__':
    app, socketio = create_app()
    config = load_config()
    port = int(config.get('port', 8000))
    host = config.get('host', '0.0.0.0')
    debug = config.get('DEBUG', False)
    
    logger.info(f"Starting server on {host}:{port}")
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
