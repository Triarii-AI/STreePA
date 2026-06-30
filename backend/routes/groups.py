from flask import Blueprint, request, jsonify
from flask_login import login_required
from extensions import db
from models import NodeGroup, Loss, Hazard, SystemConstraint, ControlAction, UCA, LossScenario
from routes.utils import check_project_access

groups_bp = Blueprint('groups', __name__)

NODE_MODEL_MAP = {
    'loss': Loss,
    'hazard': Hazard,
    'system_constraint': SystemConstraint,
    'control_action': ControlAction,
    'uca': UCA,
    'loss_scenario': LossScenario,
}


def _get_group_abs_origin(group):
    """Recursively compute the absolute (x, y) of a group's top-left corner."""
    if group.parent_group_id:
        parent = NodeGroup.query.get(group.parent_group_id)
        if parent:
            px, py = _get_group_abs_origin(parent)
            return group.x + px, group.y + py
    return group.x, group.y


@groups_bp.route('/projects/<int:project_id>/groups', methods=['POST'])
@login_required
def create_group(project_id):
    check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}

    group = NodeGroup(
        project_id=project_id,
        label=data.get('label', ''),
        x=float(data.get('x', 0)),
        y=float(data.get('y', 0)),
        width=float(data.get('width', 200)),
        height=float(data.get('height', 200)),
        parent_group_id=data.get('parent_group_id'),
    )
    db.session.add(group)
    db.session.flush()

    for member in data.get('members', []):
        node_type = member.get('node_type')
        node_id = int(member.get('node_id', 0))
        rel_x = float(member.get('rel_x', 0))
        rel_y = float(member.get('rel_y', 0))

        if node_type == 'group':
            child = NodeGroup.query.filter_by(id=node_id, project_id=project_id).first()
            if child:
                child.parent_group_id = group.id
                child.x = rel_x
                child.y = rel_y
        else:
            model_cls = NODE_MODEL_MAP.get(node_type)
            if model_cls:
                node = model_cls.query.filter_by(id=node_id, project_id=project_id).first()
                if node:
                    node.group_id = group.id
                    node.x = rel_x
                    node.y = rel_y

    db.session.commit()
    return jsonify({'group': group.to_dict()}), 201


@groups_bp.route('/projects/<int:project_id>/groups/<int:group_id>', methods=['PUT'])
@login_required
def update_group(project_id, group_id):
    check_project_access(project_id, require_editor=True)
    group = NodeGroup.query.filter_by(id=group_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}

    for field in ('x', 'y', 'width', 'height'):
        if field in data:
            setattr(group, field, float(data[field]))
    if 'label' in data:
        group.label = data['label']

    db.session.commit()
    return jsonify({'group': group.to_dict()})


@groups_bp.route('/projects/<int:project_id>/groups/<int:group_id>', methods=['DELETE'])
@login_required
def delete_group(project_id, group_id):
    check_project_access(project_id, require_editor=True)
    group = NodeGroup.query.filter_by(id=group_id, project_id=project_id).first_or_404()

    gx, gy = _get_group_abs_origin(group)
    released = []

    for child in NodeGroup.query.filter_by(parent_group_id=group_id).all():
        ax, ay = child.x + gx, child.y + gy
        child.parent_group_id = None
        child.x = ax
        child.y = ay
        released.append({'node_type': 'group', 'node_id': child.id, 'abs_x': ax, 'abs_y': ay})

    for ntype, model_cls in NODE_MODEL_MAP.items():
        for node in model_cls.query.filter_by(group_id=group_id, project_id=project_id).all():
            ax, ay = node.x + gx, node.y + gy
            node.group_id = None
            node.x = ax
            node.y = ay
            released.append({'node_type': ntype, 'node_id': node.id, 'abs_x': ax, 'abs_y': ay})

    db.session.delete(group)
    db.session.commit()
    return jsonify({'released_members': released})


@groups_bp.route('/projects/<int:project_id>/groups/<int:group_id>/members', methods=['PATCH'])
@login_required
def add_group_members(project_id, group_id):
    """Add nodes to an existing group and update its bounds."""
    check_project_access(project_id, require_editor=True)
    group = NodeGroup.query.filter_by(id=group_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}

    for field in ('x', 'y', 'width', 'height'):
        if field in data:
            setattr(group, field, float(data[field]))
    if 'label' in data:
        group.label = data['label']

    for member in data.get('members', []):
        node_type = member.get('node_type')
        node_id = int(member.get('node_id', 0))
        rel_x = float(member.get('rel_x', 0))
        rel_y = float(member.get('rel_y', 0))
        if node_type == 'group':
            child = NodeGroup.query.filter_by(id=node_id, project_id=project_id).first()
            if child:
                child.parent_group_id = group.id
                child.x = rel_x
                child.y = rel_y
        else:
            model_cls = NODE_MODEL_MAP.get(node_type)
            if model_cls:
                node = model_cls.query.filter_by(id=node_id, project_id=project_id).first()
                if node:
                    node.group_id = group.id
                    node.x = rel_x
                    node.y = rel_y

    for member in data.get('existing_members', []):
        node_type = member.get('node_type')
        node_id = int(member.get('node_id', 0))
        rel_x = float(member.get('rel_x', 0))
        rel_y = float(member.get('rel_y', 0))
        if node_type == 'group':
            child = NodeGroup.query.filter_by(id=node_id, project_id=project_id).first()
            if child and child.parent_group_id == group.id:
                child.x = rel_x
                child.y = rel_y
        else:
            model_cls = NODE_MODEL_MAP.get(node_type)
            if model_cls:
                node = model_cls.query.filter_by(id=node_id, project_id=project_id).first()
                if node and node.group_id == group.id:
                    node.x = rel_x
                    node.y = rel_y

    db.session.commit()
    return jsonify({'group': group.to_dict()})
