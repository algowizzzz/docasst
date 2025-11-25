"""Simple authentication system."""

import json
from pathlib import Path
from functools import wraps
from flask import session, redirect, url_for, request, jsonify
from werkzeug.security import check_password_hash, generate_password_hash


class AuthManager:
    """Simple username/password authentication manager."""
    
    def __init__(self, users_file: str = 'config/users.json'):
        self.users_file = Path(__file__).parent.parent / users_file
        self.users = {}
        self._load_users()
    
    def _load_users(self):
        """Load users from JSON file."""
        if self.users_file.exists():
            with open(self.users_file, 'r') as f:
                self.users = json.load(f)
        else:
            # Default admin user
            self.users = {
                "admin": {
                    "password_hash": generate_password_hash("admin123"),
                    "email": "admin@example.com"
                }
            }
            self._save_users()
    
    def _save_users(self):
        """Save users to JSON file."""
        ensure_directory(self.users_file.parent)
        with open(self.users_file, 'w') as f:
            json.dump(self.users, f, indent=2)
    
    def authenticate(self, username: str, password: str) -> bool:
        """Authenticate user."""
        user = self.users.get(username)
        if not user:
            return False
        return check_password_hash(user['password_hash'], password)
    
    def get_user(self, username: str) -> dict:
        """Get user info."""
        return self.users.get(username)


# Global auth manager
auth_manager = AuthManager()


def login_required(f):
    """Decorator to require login."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            # Check if it's an API call
            if request.path.startswith('/api/'):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated_function


def ensure_directory(path: Path) -> Path:
    """Create directory if it doesn't exist."""
    path.mkdir(parents=True, exist_ok=True)
    return path
