"""Socket.IO event handlers."""

from flask import request
from flask_socketio import emit, join_room, leave_room


def register_socketio_handlers(socketio):
    """Register Socket.IO event handlers."""
    
    @socketio.on('connect')
    def handle_connect():
        """Handle client connection."""
        print(f"Client connected: {request.sid}")
        emit('connected', {'status': 'ok'})
    
    @socketio.on('doc_review:join')
    def handle_join(data):
        """Join a document review room."""
        file_id = data.get('fileId')
        if file_id:
            room = f"doc_review:{file_id}"
            join_room(room)
            emit('joined', {'fileId': file_id})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection."""
        print(f"Client disconnected: {request.sid}")


def emit_doc_review_event(socketio, file_id: str, event_type: str, data: dict):
    """Emit an event to a specific document review room."""
    socketio.emit(
        f'doc_review:{event_type}',
        data,
        room=f"doc_review:{file_id}"
    )

