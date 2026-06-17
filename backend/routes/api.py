from flask import Blueprint, request, jsonify
from flask_login import login_required
from extensions import db
from models import (
    Project, Loss, Hazard, SystemConstraint, ControlAction,
    UCA, LossScenario, CanvasEdge,
    hazard_loss_links, uca_hazard_links, ls_hazard_links
)

api_bp = Blueprint('api', __name__)

# ─────────────────────────────────────────────
# Layer Y positions for default placement
# ─────────────────────────────────────────────
LAYER_Y = {
    'loss': 50,
    'hazard': 300,
    'system_constraint': 550,
    'control_action': 800,
    'uca': 1050,
    'loss_scenario': 1300,
}


# ─────────────────────────────────────────────
# Label helpers
# ─────────────────────────────────────────────

def _next_loss_label(project_id):
    count = Loss.query.filter_by(project_id=project_id).count()
    return f'L-{count + 1}'


def _next_hazard_label(project_id, parent_hazard_id=None):
    if parent_hazard_id is None:
        count = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=None).count()
        return f'H-{count + 1}'
    parent = Hazard.query.get(parent_hazard_id)
    parent_label = parent.label if parent else 'H-?'
    count = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=parent_hazard_id).count()
    return f'{parent_label}.{count + 1}'


def _next_sc_label(project_id):
    count = SystemConstraint.query.filter_by(project_id=project_id).count()
    return f'SC-{count + 1}'


def _next_ca_label(project_id):
    count = ControlAction.query.filter_by(project_id=project_id).count()
    return f'CA-{count + 1}'


def _next_uca_label(project_id, control_action_id):
    ca = ControlAction.query.get(control_action_id)
    # Extract the numeric part from e.g. "CA-3"
    if ca and ca.label.startswith('CA-'):
        ca_num = ca.label[3:]
    else:
        ca_num = str(control_action_id)
    count = UCA.query.filter_by(project_id=project_id, control_action_id=control_action_id).count()
    return f'UCA-{ca_num}.{count + 1}'


def _next_ls_label(project_id, uca_id):
    uca = UCA.query.get(uca_id)
    # UCA label is like "UCA-2.1" → strip "UCA-" → "2.1"
    if uca and uca.label.startswith('UCA-'):
        uca_num = uca.label[4:]
    else:
        uca_num = str(uca_id)
    count = LossScenario.query.filter_by(project_id=project_id, uca_id=uca_id).count()
    return f'LS-{uca_num}.{count + 1}'


def _index_x(project_id, model, **filters):
    count = model.query.filter_by(project_id=project_id, **filters).count()
    return count * 220


# ─────────────────────────────────────────────
# LOSSES
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/losses', methods=['POST'])
@login_required
def create_loss(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    label = _next_loss_label(project_id)
    idx_x = _index_x(project_id, Loss)
    node = Loss(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['loss'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/losses/<int:node_id>', methods=['PUT'])
@login_required
def update_loss(project_id, node_id):
    node = Loss.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/losses/<int:node_id>', methods=['DELETE'])
@login_required
def delete_loss(project_id, node_id):
    node = Loss.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# HAZARDS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/hazards', methods=['POST'])
@login_required
def create_hazard(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    parent_hazard_id = data.get('parent_hazard_id', None)
    label = _next_hazard_label(project_id, parent_hazard_id)
    if parent_hazard_id is not None:
        idx_x = _index_x(project_id, Hazard, parent_hazard_id=parent_hazard_id)
    else:
        idx_x = _index_x(project_id, Hazard)
    node = Hazard(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        parent_hazard_id=parent_hazard_id,
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['hazard'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/hazards/<int:node_id>', methods=['PUT'])
@login_required
def update_hazard(project_id, node_id):
    node = Hazard.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'parent_hazard_id' in data:
        node.parent_hazard_id = data['parent_hazard_id']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/hazards/<int:node_id>', methods=['DELETE'])
@login_required
def delete_hazard(project_id, node_id):
    node = Hazard.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# SYSTEM CONSTRAINTS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/system_constraints', methods=['POST'])
@login_required
def create_system_constraint(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    label = _next_sc_label(project_id)
    idx_x = _index_x(project_id, SystemConstraint)
    node = SystemConstraint(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        linked_hazard_id=data.get('linked_hazard_id', None),
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['system_constraint'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/system_constraints/<int:node_id>', methods=['PUT'])
@login_required
def update_system_constraint(project_id, node_id):
    node = SystemConstraint.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'linked_hazard_id' in data:
        node.linked_hazard_id = data['linked_hazard_id']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/system_constraints/<int:node_id>', methods=['DELETE'])
@login_required
def delete_system_constraint(project_id, node_id):
    node = SystemConstraint.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# CONTROL ACTIONS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/control_actions', methods=['POST'])
@login_required
def create_control_action(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    label = _next_ca_label(project_id)
    idx_x = _index_x(project_id, ControlAction)
    node = ControlAction(
        project_id=project_id,
        label=label,
        name=data.get('name', ''),
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['control_action'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/control_actions/<int:node_id>', methods=['PUT'])
@login_required
def update_control_action(project_id, node_id):
    node = ControlAction.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'name' in data:
        node.name = data['name']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/control_actions/<int:node_id>', methods=['DELETE'])
@login_required
def delete_control_action(project_id, node_id):
    node = ControlAction.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# UCAs
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/ucas', methods=['POST'])
@login_required
def create_uca(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    control_action_id = data.get('control_action_id')
    if not control_action_id:
        return jsonify({'error': 'control_action_id is required'}), 400
    uca_type = data.get('uca_type')
    if not uca_type:
        return jsonify({'error': 'uca_type is required'}), 400
    label = _next_uca_label(project_id, control_action_id)
    idx_x = _index_x(project_id, UCA, control_action_id=control_action_id)
    node = UCA(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        control_action_id=control_action_id,
        uca_type=uca_type,
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['uca'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/ucas/<int:node_id>', methods=['PUT'])
@login_required
def update_uca(project_id, node_id):
    node = UCA.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'uca_type' in data:
        node.uca_type = data['uca_type']
    if 'control_action_id' in data:
        node.control_action_id = data['control_action_id']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/ucas/<int:node_id>', methods=['DELETE'])
@login_required
def delete_uca(project_id, node_id):
    node = UCA.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# LOSS SCENARIOS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/loss_scenarios', methods=['POST'])
@login_required
def create_loss_scenario(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    uca_id = data.get('uca_id')
    if not uca_id:
        return jsonify({'error': 'uca_id is required'}), 400
    label = _next_ls_label(project_id, uca_id)
    idx_x = _index_x(project_id, LossScenario, uca_id=uca_id)
    node = LossScenario(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        uca_id=uca_id,
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['loss_scenario'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/loss_scenarios/<int:node_id>', methods=['PUT'])
@login_required
def update_loss_scenario(project_id, node_id):
    node = LossScenario.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'uca_id' in data:
        node.uca_id = data['uca_id']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/loss_scenarios/<int:node_id>', methods=['DELETE'])
@login_required
def delete_loss_scenario(project_id, node_id):
    node = LossScenario.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# LINK MANAGEMENT
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/links', methods=['POST'])
@login_required
def create_link(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    from_type = data.get('from_type')
    from_id = data.get('from_id')
    to_type = data.get('to_type')
    to_id = data.get('to_id')

    if from_type == 'hazard' and to_type == 'loss':
        existing = db.session.execute(
            db.select(hazard_loss_links).where(
                hazard_loss_links.c.hazard_id == from_id,
                hazard_loss_links.c.loss_id == to_id
            )
        ).first()
        if not existing:
            db.session.execute(hazard_loss_links.insert().values(hazard_id=from_id, loss_id=to_id))
            db.session.commit()
    elif from_type == 'uca' and to_type == 'hazard':
        existing = db.session.execute(
            db.select(uca_hazard_links).where(
                uca_hazard_links.c.uca_id == from_id,
                uca_hazard_links.c.hazard_id == to_id
            )
        ).first()
        if not existing:
            db.session.execute(uca_hazard_links.insert().values(uca_id=from_id, hazard_id=to_id))
            db.session.commit()
    elif from_type == 'loss_scenario' and to_type == 'hazard':
        existing = db.session.execute(
            db.select(ls_hazard_links).where(
                ls_hazard_links.c.ls_id == from_id,
                ls_hazard_links.c.hazard_id == to_id
            )
        ).first()
        if not existing:
            db.session.execute(ls_hazard_links.insert().values(ls_id=from_id, hazard_id=to_id))
            db.session.commit()
    else:
        return jsonify({'error': 'Unsupported link type combination'}), 400

    return jsonify({'success': True})


@api_bp.route('/projects/<int:project_id>/links', methods=['DELETE'])
@login_required
def delete_link(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    from_type = data.get('from_type')
    from_id = data.get('from_id')
    to_type = data.get('to_type')
    to_id = data.get('to_id')

    if from_type == 'hazard' and to_type == 'loss':
        db.session.execute(
            hazard_loss_links.delete().where(
                hazard_loss_links.c.hazard_id == from_id,
                hazard_loss_links.c.loss_id == to_id
            )
        )
        db.session.commit()
    elif from_type == 'uca' and to_type == 'hazard':
        db.session.execute(
            uca_hazard_links.delete().where(
                uca_hazard_links.c.uca_id == from_id,
                uca_hazard_links.c.hazard_id == to_id
            )
        )
        db.session.commit()
    elif from_type == 'loss_scenario' and to_type == 'hazard':
        db.session.execute(
            ls_hazard_links.delete().where(
                ls_hazard_links.c.ls_id == from_id,
                ls_hazard_links.c.hazard_id == to_id
            )
        )
        db.session.commit()
    else:
        return jsonify({'error': 'Unsupported link type combination'}), 400

    return jsonify({'success': True})


# ─────────────────────────────────────────────
# CANVAS EDGES
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/canvas_edges', methods=['POST'])
@login_required
def create_canvas_edge(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    edge = CanvasEdge(
        project_id=project_id,
        from_node_type=data.get('from_node_type'),
        from_node_id=data.get('from_node_id'),
        to_node_type=data.get('to_node_type'),
        to_node_id=data.get('to_node_id'),
        style=data.get('style', 'dashed')
    )
    db.session.add(edge)
    db.session.commit()
    return jsonify(edge.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/canvas_edges/<int:edge_id>', methods=['DELETE'])
@login_required
def delete_canvas_edge(project_id, edge_id):
    edge = CanvasEdge.query.filter_by(id=edge_id, project_id=project_id).first_or_404()
    db.session.delete(edge)
    db.session.commit()
    return jsonify({'success': True})
