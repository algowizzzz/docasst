"""Authentication routes."""

from flask import Blueprint, render_template, request, redirect, url_for, session
from app.auth import auth_manager

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    """Login page."""
    if request.method == 'POST':
        username = request.form.get('user_id') or request.form.get('username')
        password = request.form.get('password')
        
        if auth_manager.authenticate(username, password):
            session['username'] = username
            session['token'] = 'authenticated'  # Simple token
            return redirect(url_for('doc_review.documents'))
        else:
            return render_template('login.html', error='Invalid credentials')
    
    return render_template('login.html')


@auth_bp.route('/logout')
def logout():
    """Logout and clear session."""
    session.clear()
    return redirect(url_for('auth.login'))
