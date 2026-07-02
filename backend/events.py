from functools import wraps
from flask_login import current_user
from flask import request
from flask_socketio import join_room, emit
from extensions import db
from models import Loss, Hazard, SystemConstraint, ControlAction, UCA, ControllerConstraint, LossScenario

room_users = {}  # { room_key: { sid: { user_id, username, avatar_color } } }

AVATAR_COLORS = [
    '#6366f1', '#ef4444', '#f97316', '#eab308',
    '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
]


def get_avatar_color(user_id):
    return AVATAR_COLORS[user_id % len(AVATAR_COLORS)]


def get_room_key(project_id):
    return f'project:{project_id}'


def get_model_for_type(node_type):
    mapping = {
        'loss': Loss,
        'hazard': Hazard,
        'system_constraint': SystemConstraint,
        'control_action': ControlAction,
        'uca': UCA,
        'controller_constraint': ControllerConstraint,
        'loss_scenario': LossScenario,
    }
    return mapping.get(node_type)


def emit_presence_update(socketio, room):
    users = list(room_users.get(room, {}).values())
    socketio.emit('presence:update', {'active_users': users}, room=room)


def login_required_socket(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            emit('error', {'message': 'Authentication required'})
            return
        return f(*args, **kwargs)
    return decorated


def register_events(socketio):

    @socketio.on('project:join')
    @login_required_socket
    def on_project_join(data):
        project_id = data.get('project_id')
        if not project_id:
            emit('error', {'message': 'project_id is required'})
            return
        room = get_room_key(project_id)
        join_room(room)
        if room not in room_users:
            room_users[room] = {}
        room_users[room][request.sid] = {
            'user_id': current_user.id,
            'username': current_user.username,
            'avatar_color': get_avatar_color(current_user.id)
        }
        emit_presence_update(socketio, room)

    @socketio.on('disconnect')
    def on_disconnect():
        for room, users in list(room_users.items()):
            if request.sid in users:
                del users[request.sid]
                emit_presence_update(socketio, room)

    @socketio.on('node:moved')
    def on_node_moved(data):
        node_type = data.get('node_type')
        node_id = data.get('node_id')
        x = data.get('x')
        y = data.get('y')
        model = get_model_for_type(node_type)
        if model and node_id is not None:
            node = model.query.get(node_id)
            if node:
                node.x = x
                node.y = y
                db.session.commit()
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('node:moved', data, room=room, include_self=False)

    @socketio.on('node:added')
    def on_node_added(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('node:added', data, room=room, include_self=False)

    @socketio.on('node:updated')
    def on_node_updated(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('node:updated', data, room=room, include_self=False)

    @socketio.on('node:deleted')
    def on_node_deleted(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('node:deleted', data, room=room, include_self=False)

    @socketio.on('edge:added')
    def on_edge_added(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('edge:added', data, room=room, include_self=False)

    @socketio.on('edge:deleted')
    def on_edge_deleted(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('edge:deleted', data, room=room, include_self=False)

    @socketio.on('group:created')
    def on_group_created(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('group:created', data, room=room, include_self=False)

    @socketio.on('group:moved')
    def on_group_moved(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('group:moved', data, room=room, include_self=False)

    @socketio.on('group:updated')
    def on_group_updated(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('group:updated', data, room=room, include_self=False)

    @socketio.on('group:deleted')
    def on_group_deleted(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('group:deleted', data, room=room, include_self=False)

    @socketio.on('group:resized')
    def on_group_resized(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('group:resized', data, room=room, include_self=False)

    @socketio.on('group:members_updated')
    def on_group_members_updated(data):
        project_id = data.get('project_id')
        if project_id:
            room = get_room_key(project_id)
            emit('group:members_updated', data, room=room, include_self=False)

    @socketio.on('user:select')
    @login_required_socket
    def on_user_select(data):
        project_id = data.get('project_id')
        rf_node_id = data.get('rf_node_id')
        if project_id:
            room = get_room_key(project_id)
            if room in room_users and request.sid in room_users[room]:
                room_users[room][request.sid]['selected_node'] = rf_node_id
            emit('user:select', {
                'user_id': current_user.id,
                'username': current_user.username,
                'avatar_color': get_avatar_color(current_user.id),
                'rf_node_id': rf_node_id,
            }, room=room, include_self=False)

    @socketio.on('cursor:move')
    @login_required_socket
    def on_cursor_move(data):
        project_id = data.get('project_id')
        x = data.get('x')
        y = data.get('y')
        if project_id:
            room = get_room_key(project_id)
            emit('cursor:move', {
                'user_id': current_user.id,
                'username': current_user.username,
                'avatar_color': get_avatar_color(current_user.id),
                'x': x,
                'y': y,
            }, room=room, include_self=False)
