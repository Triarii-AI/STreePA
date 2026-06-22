from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from extensions import db
from models import User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password are required'}), 400

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        login_user(user)
        return jsonify({'success': True, 'user': user.to_dict()})

    return jsonify({'success': False, 'error': 'Invalid credentials'}), 401


@auth_bp.route('/logout', methods=['POST'])
def logout():
    logout_user()
    return jsonify({'success': True})


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password are required'}), 400

    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({'success': False, 'error': 'Username already taken'}), 400

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    login_user(user)
    return jsonify({'success': True, 'user': user.to_dict()}), 201


@auth_bp.route('/me', methods=['GET'])
def me():
    if current_user.is_authenticated:
        return jsonify({'user': current_user.to_dict()})
    return jsonify({'error': 'Not authenticated'}), 401


@auth_bp.route('/user', methods=['PUT'])
@login_required
def update_user():
    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_username = data.get('new_username', '').strip()
    new_password = data.get('new_password', '')

    if not current_password:
        return jsonify({'success': False, 'error': 'Current password is required'}), 400

    if not current_user.check_password(current_password):
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 400

    if new_username and new_username != current_user.username:
        existing = User.query.filter_by(username=new_username).first()
        if existing:
            return jsonify({'success': False, 'error': 'Username already taken'}), 400
        current_user.username = new_username

    if new_password:
        if len(new_password) < 6:
            return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400
        current_user.set_password(new_password)

    db.session.commit()
    return jsonify({'success': True, 'user': current_user.to_dict()})
