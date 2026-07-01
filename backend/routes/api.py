from flask import Blueprint, request, jsonify
from flask_login import login_required
from extensions import db
from models import (
    Project, Loss, Hazard, SystemConstraint, ControlAction,
    UCA, LossScenario, ControllerConstraint, CanvasEdge,
    hazard_loss_links, uca_hazard_links, ls_hazard_links, sc_hazard_links, cc_uca_links
)
from routes.utils import check_project_access

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
    'controller_constraint': 1300,
    'loss_scenario': 1550,
}


# ─────────────────────────────────────────────
# Label helpers
# ─────────────────────────────────────────────

def _next_loss_label(project_id, parent_loss_id=None):
    if parent_loss_id is None:
        count = Loss.query.filter_by(project_id=project_id, parent_loss_id=None)\
            .filter(~Loss.label.like('L-x%')).count()
        return f'L-{count + 1}'
    parent = Loss.query.get(parent_loss_id)
    parent_label = parent.label if parent else 'L-?'
    count = Loss.query.filter_by(project_id=project_id, parent_loss_id=parent_loss_id).count()
    return f'{parent_label}.{count + 1}'


def _relabel_loss_tree(project_id, loss_id):
    """Recursively relabel all descendants of a loss to reflect its new label."""
    parent = Loss.query.get(loss_id)
    if not parent:
        return []
    updated = []
    children = Loss.query.filter_by(project_id=project_id, parent_loss_id=loss_id).all()
    for child in children:
        parts = child.label.rsplit('.', 1)
        self_num = parts[1] if len(parts) == 2 else '1'
        new_label = f'{parent.label}.{self_num}'
        if new_label != child.label:
            child.label = new_label
            updated.append({'nodeType': 'loss', 'id': child.id, 'label': child.label})
            updated.extend(_relabel_loss_tree(project_id, child.id))
    return updated


def _next_hazard_label(project_id, parent_hazard_id=None):
    if parent_hazard_id is None:
        count = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=None)\
            .filter(~Hazard.label.like('H-x%')).count()
        return f'H-{count + 1}'
    parent = Hazard.query.get(parent_hazard_id)
    parent_label = parent.label if parent else 'H-?'
    count = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=parent_hazard_id).count()
    return f'{parent_label}.{count + 1}'


def _next_sc_label(project_id, hazard_id=None):
    if not hazard_id:
        count = SystemConstraint.query.filter_by(project_id=project_id).count()
        return f'SC-{count + 1}'
    hazard = Hazard.query.get(hazard_id)
    if not hazard:
        count = SystemConstraint.query.filter_by(project_id=project_id).count()
        return f'SC-{count + 1}'
    h_num = hazard.label[2:] if hazard.label.startswith('H-') else str(hazard_id)
    return f'SC-{h_num}'


def _next_cc_label(project_id, uca_id=None):
    if not uca_id:
        count = ControllerConstraint.query.filter_by(project_id=project_id).count()
        return f'CC-{count + 1}'
    uca = UCA.query.get(uca_id)
    if not uca:
        count = ControllerConstraint.query.filter_by(project_id=project_id).count()
        return f'CC-{count + 1}'
    uca_num = uca.label[4:] if uca.label.startswith('UCA-') else str(uca_id)
    return f'CC-{uca_num}'


def _next_ca_label(project_id):
    count = ControlAction.query.filter_by(project_id=project_id).count()
    return f'R-{count + 1}'


def _next_uca_label(project_id, control_action_id):
    ca = ControlAction.query.get(control_action_id)
    # Extract the numeric part from e.g. "R-3"
    if ca and ca.label.startswith('R-'):
        ca_num = ca.label[2:]
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


def _relabel_hazard_tree(project_id, hazard_id):
    """Recursively relabel all descendants of a hazard to reflect its new label."""
    parent = Hazard.query.get(hazard_id)
    if not parent:
        return []
    updated = []
    children = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=hazard_id).all()
    for child in children:
        parts = child.label.rsplit('.', 1)
        self_num = parts[1] if len(parts) == 2 else '1'
        new_label = f'{parent.label}.{self_num}'
        if new_label != child.label:
            child.label = new_label
            updated.append({'nodeType': 'hazard', 'id': child.id, 'label': child.label})
            updated.extend(_relabel_hazard_tree(project_id, child.id))
    return updated


def _relabel_uca_children(project_id, uca_id):
    """Relabel all LSs and Controller Constraints under a UCA to reflect its new label."""
    uca = UCA.query.get(uca_id)
    if not uca:
        return []
    uca_num = uca.label[4:] if uca.label.startswith('UCA-') else str(uca_id)
    updated = []
    for child in LossScenario.query.filter_by(project_id=project_id, uca_id=uca_id).all():
        parts = child.label.rsplit('.', 1)
        self_num = parts[1] if len(parts) == 2 else '1'
        new_label = f'LS-{uca_num}.{self_num}'
        if new_label != child.label:
            child.label = new_label
            updated.append({'nodeType': 'loss_scenario', 'id': child.id, 'label': child.label})
    for child in ControllerConstraint.query.filter_by(project_id=project_id, linked_uca_id=uca_id).all():
        new_label = f'CC-{uca_num}'
        if new_label != child.label:
            child.label = new_label
            updated.append({'nodeType': 'controller_constraint', 'id': child.id, 'label': child.label})
    return updated


def _relabel_ca_children(project_id, ca_id):
    """Relabel all UCAs (and their LSs) under a CA to reflect its new label."""
    ca = ControlAction.query.get(ca_id)
    if not ca:
        return []
    ca_num = ca.label[2:] if ca.label.startswith('R-') else str(ca_id)
    updated = []
    for child in UCA.query.filter_by(project_id=project_id, control_action_id=ca_id).all():
        parts = child.label.rsplit('.', 1)
        self_num = parts[1] if len(parts) == 2 else '1'
        new_label = f'UCA-{ca_num}.{self_num}'
        if new_label != child.label:
            child.label = new_label
            updated.append({'nodeType': 'uca', 'id': child.id, 'label': child.label})
            updated.extend(_relabel_uca_children(project_id, child.id))
    return updated


# ─────────────────────────────────────────────
# LOSSES
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/losses', methods=['POST'])
@login_required
def create_loss(project_id):
    check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}
    parent_loss_id = data.get('parent_loss_id', None)
    label = _next_loss_label(project_id, parent_loss_id)
    if parent_loss_id is not None:
        idx_x = _index_x(project_id, Loss, parent_loss_id=parent_loss_id)
    else:
        idx_x = _index_x(project_id, Loss, parent_loss_id=None)
    node = Loss(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        parent_loss_id=parent_loss_id,
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['loss'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/losses/<int:node_id>', methods=['PUT'])
@login_required
def update_loss(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = Loss.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'parent_loss_id' in data:
        new_parent = data['parent_loss_id']
        if new_parent != node.parent_loss_id:
            node.parent_loss_id = new_parent
            if new_parent is None:
                top_count = Loss.query.filter_by(project_id=project_id, parent_loss_id=None)\
                    .filter(Loss.id != node_id).filter(~Loss.label.like('L-x%')).count()
                node.label = f'L-{top_count + 1}'
            else:
                parent = Loss.query.get(new_parent)
                parent_label = parent.label if parent else 'L-?'
                sibling_count = Loss.query.filter_by(project_id=project_id, parent_loss_id=new_parent)\
                    .filter(Loss.id != node_id).count()
                node.label = f'{parent_label}.{sibling_count + 1}'
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.flush()
    relabeled = _relabel_loss_tree(project_id, node_id)
    db.session.commit()
    result = node.to_dict()
    result['relabeled'] = relabeled
    return jsonify(result)


@api_bp.route('/projects/<int:project_id>/losses/<int:node_id>', methods=['DELETE'])
@login_required
def delete_loss(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = Loss.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    orphaned = []
    children = Loss.query.filter_by(project_id=project_id, parent_loss_id=node_id).all()
    for child in children:
        child.parent_loss_id = None
        parts = child.label.rsplit('.', 1)
        child.label = f'L-x.{parts[1]}' if len(parts) == 2 else 'L-x'
        orphaned.append({'nodeType': 'loss', 'id': child.id, 'label': child.label})
    db.session.flush()
    for o in list(orphaned):
        orphaned.extend(_relabel_loss_tree(project_id, o['id']))
    db.session.flush()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True, 'orphaned': orphaned})


# ─────────────────────────────────────────────
# HAZARDS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/hazards', methods=['POST'])
@login_required
def create_hazard(project_id):
    check_project_access(project_id, require_editor=True)
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
    check_project_access(project_id, require_editor=True)
    node = Hazard.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'parent_hazard_id' in data:
        new_parent = data['parent_hazard_id']
        if new_parent != node.parent_hazard_id:
            node.parent_hazard_id = new_parent
            if new_parent is None:
                top_count = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=None).filter(Hazard.id != node_id).filter(~Hazard.label.like('H-x%')).count()
                node.label = f'H-{top_count + 1}'
            else:
                parent = Hazard.query.get(new_parent)
                parent_label = parent.label if parent else 'H-?'
                sibling_count = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=new_parent).filter(Hazard.id != node_id).count()
                node.label = f'{parent_label}.{sibling_count + 1}'
        else:
            node.parent_hazard_id = new_parent
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.flush()
    relabeled = _relabel_hazard_tree(project_id, node_id)
    db.session.commit()
    result = node.to_dict()
    result['relabeled'] = relabeled
    return jsonify(result)


@api_bp.route('/projects/<int:project_id>/hazards/<int:node_id>', methods=['DELETE'])
@login_required
def delete_hazard(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = Hazard.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    orphaned = []
    # Orphan child hazards
    children = Hazard.query.filter_by(project_id=project_id, parent_hazard_id=node_id).all()
    for child in children:
        child.parent_hazard_id = None
        parts = child.label.rsplit('.', 1)
        child.label = f'H-x.{parts[1]}' if len(parts) == 2 else 'H-x'
        orphaned.append({'nodeType': 'hazard', 'id': child.id, 'label': child.label})
    # Cascade new orphaned labels to grandchildren
    db.session.flush()
    for o in list(orphaned):
        if o['nodeType'] == 'hazard':
            orphaned.extend(_relabel_hazard_tree(project_id, o['id']))
    # Orphan linked SCs
    sc_children = SystemConstraint.query.filter_by(project_id=project_id, linked_hazard_id=node_id).all()
    for sc in sc_children:
        sc.linked_hazard_id = None
        sc.label = 'SC-x'
        orphaned.append({'nodeType': 'system_constraint', 'id': sc.id, 'label': sc.label})
    db.session.flush()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True, 'orphaned': orphaned})


# ─────────────────────────────────────────────
# SYSTEM CONSTRAINTS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/system_constraints', methods=['POST'])
@login_required
def create_system_constraint(project_id):
    check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}
    linked_hazard_id = data.get('linked_hazard_id', None)
    label = _next_sc_label(project_id, linked_hazard_id)
    idx_x = _index_x(project_id, SystemConstraint)
    node = SystemConstraint(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        linked_hazard_id=linked_hazard_id,
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['system_constraint'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/system_constraints/<int:node_id>', methods=['PUT'])
@login_required
def update_system_constraint(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = SystemConstraint.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'linked_hazard_id' in data:
        new_hid = data['linked_hazard_id']
        if new_hid != node.linked_hazard_id:
            node.linked_hazard_id = new_hid
            if new_hid:
                node.label = _next_sc_label(project_id, new_hid)
            else:
                node.label = 'SC-x'
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/system_constraints/<int:node_id>', methods=['DELETE'])
@login_required
def delete_system_constraint(project_id, node_id):
    check_project_access(project_id, require_editor=True)
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
    check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}
    label = _next_ca_label(project_id)
    idx_x = _index_x(project_id, ControlAction)
    node = ControlAction(
        project_id=project_id,
        label=label,
        name=data.get('name', ''),
        controller=data.get('controller', ''),
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['control_action'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/control_actions/<int:node_id>', methods=['PUT'])
@login_required
def update_control_action(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = ControlAction.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'name' in data:
        node.name = data['name']
    if 'controller' in data:
        node.controller = data['controller']
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.flush()
    relabeled = _relabel_ca_children(project_id, node_id)
    db.session.commit()
    result = node.to_dict()
    result['relabeled'] = relabeled
    return jsonify(result)


@api_bp.route('/projects/<int:project_id>/control_actions/<int:node_id>', methods=['DELETE'])
@login_required
def delete_control_action(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = ControlAction.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    orphaned = []
    children = UCA.query.filter_by(project_id=project_id, control_action_id=node_id).all()
    for child in children:
        child.control_action_id = None
        parts = child.label.rsplit('.', 1)
        child.label = f'UCA-x.{parts[1]}' if len(parts) == 2 else 'UCA-x'
        orphaned.append({'nodeType': 'uca', 'id': child.id, 'label': child.label})
    db.session.flush()
    for o in list(orphaned):
        if o['nodeType'] == 'uca':
            orphaned.extend(_relabel_uca_children(project_id, o['id']))
    db.session.flush()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True, 'orphaned': orphaned})


# ─────────────────────────────────────────────
# UCAs
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/ucas', methods=['POST'])
@login_required
def create_uca(project_id):
    check_project_access(project_id, require_editor=True)
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
    check_project_access(project_id, require_editor=True)
    node = UCA.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'uca_type' in data:
        node.uca_type = data['uca_type']
    if 'control_action_id' in data:
        new_ca_id = int(data['control_action_id'])
        if new_ca_id != node.control_action_id:
            node.control_action_id = new_ca_id
            ca = ControlAction.query.get(new_ca_id)
            ca_num = ca.label[2:] if ca and ca.label.startswith('R-') else str(new_ca_id)
            sibling_count = UCA.query.filter_by(project_id=project_id, control_action_id=new_ca_id).filter(UCA.id != node_id).count()
            node.label = f'UCA-{ca_num}.{sibling_count + 1}'
        else:
            node.control_action_id = new_ca_id
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.flush()
    relabeled = _relabel_uca_children(project_id, node_id)
    db.session.commit()
    result = node.to_dict()
    result['relabeled'] = relabeled
    return jsonify(result)


@api_bp.route('/projects/<int:project_id>/ucas/<int:node_id>', methods=['DELETE'])
@login_required
def delete_uca(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = UCA.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    orphaned = []
    children = LossScenario.query.filter_by(project_id=project_id, uca_id=node_id).all()
    for child in children:
        child.uca_id = None
        parts = child.label.rsplit('.', 1)
        child.label = f'LS-x.{parts[1]}' if len(parts) == 2 else 'LS-x'
        orphaned.append({'nodeType': 'loss_scenario', 'id': child.id, 'label': child.label})
    cc_children = ControllerConstraint.query.filter_by(project_id=project_id, linked_uca_id=node_id).all()
    for cc in cc_children:
        cc.linked_uca_id = None
        cc.label = 'CC-x'
        orphaned.append({'nodeType': 'controller_constraint', 'id': cc.id, 'label': cc.label})
    db.session.flush()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True, 'orphaned': orphaned})


# ─────────────────────────────────────────────
# CONTROLLER CONSTRAINTS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/controller_constraints', methods=['POST'])
@login_required
def create_controller_constraint(project_id):
    check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}
    linked_uca_id = data.get('linked_uca_id', None)
    label = _next_cc_label(project_id, linked_uca_id)
    idx_x = _index_x(project_id, ControllerConstraint)
    node = ControllerConstraint(
        project_id=project_id,
        label=label,
        description=data.get('description', ''),
        linked_uca_id=linked_uca_id,
        x=data.get('x', idx_x),
        y=data.get('y', LAYER_Y['controller_constraint'])
    )
    db.session.add(node)
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/controller_constraints/<int:node_id>', methods=['PUT'])
@login_required
def update_controller_constraint(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = ControllerConstraint.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'linked_uca_id' in data:
        new_uid = data['linked_uca_id']
        if new_uid != node.linked_uca_id:
            node.linked_uca_id = new_uid
            if new_uid:
                node.label = _next_cc_label(project_id, new_uid)
            else:
                node.label = 'CC-x'
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/controller_constraints/<int:node_id>', methods=['DELETE'])
@login_required
def delete_controller_constraint(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = ControllerConstraint.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
# LOSS SCENARIOS
# ─────────────────────────────────────────────

@api_bp.route('/projects/<int:project_id>/loss_scenarios', methods=['POST'])
@login_required
def create_loss_scenario(project_id):
    check_project_access(project_id, require_editor=True)
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
    db.session.flush()
    # Inherit hazard links from parent UCA
    uca_hazard_ids = [r.hazard_id for r in db.session.execute(
        db.select(uca_hazard_links.c.hazard_id).where(uca_hazard_links.c.uca_id == uca_id)
    ).fetchall()]
    for hid in uca_hazard_ids:
        db.session.execute(ls_hazard_links.insert().values(ls_id=node.id, hazard_id=hid))
    db.session.commit()
    return jsonify(node.to_dict()), 201


@api_bp.route('/projects/<int:project_id>/loss_scenarios/<int:node_id>', methods=['PUT'])
@login_required
def update_loss_scenario(project_id, node_id):
    check_project_access(project_id, require_editor=True)
    node = LossScenario.query.filter_by(id=node_id, project_id=project_id).first_or_404()
    data = request.get_json() or {}
    if 'description' in data:
        node.description = data['description']
    if 'uca_id' in data:
        new_uca_id = int(data['uca_id'])
        if new_uca_id != node.uca_id:
            node.uca_id = new_uca_id
            uca = UCA.query.get(new_uca_id)
            uca_num = uca.label[4:] if uca and uca.label.startswith('UCA-') else str(new_uca_id)
            sibling_count = LossScenario.query.filter_by(project_id=project_id, uca_id=new_uca_id).filter(LossScenario.id != node_id).count()
            node.label = f'LS-{uca_num}.{sibling_count + 1}'
            # Replace hazard links with those of the new parent UCA
            db.session.execute(ls_hazard_links.delete().where(ls_hazard_links.c.ls_id == node_id))
            for row in db.session.execute(
                db.select(uca_hazard_links.c.hazard_id).where(uca_hazard_links.c.uca_id == new_uca_id)
            ).fetchall():
                db.session.execute(ls_hazard_links.insert().values(ls_id=node_id, hazard_id=row.hazard_id))
        else:
            node.uca_id = new_uca_id
    if 'x' in data:
        node.x = data['x']
    if 'y' in data:
        node.y = data['y']
    if 'label' in data:
        node.label = data['label']
    db.session.commit()
    return jsonify(node.to_dict())


@api_bp.route('/projects/<int:project_id>/loss_scenarios/<int:node_id>', methods=['DELETE'])
@login_required
def delete_loss_scenario(project_id, node_id):
    check_project_access(project_id, require_editor=True)
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
    check_project_access(project_id, require_editor=True)
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
        # Propagate to all child Loss Scenarios
        propagated_ls_ids = []
        for ls in LossScenario.query.filter_by(project_id=project_id, uca_id=from_id).all():
            ls_existing = db.session.execute(
                db.select(ls_hazard_links).where(
                    ls_hazard_links.c.ls_id == ls.id,
                    ls_hazard_links.c.hazard_id == to_id
                )
            ).first()
            if not ls_existing:
                db.session.execute(ls_hazard_links.insert().values(ls_id=ls.id, hazard_id=to_id))
                propagated_ls_ids.append(ls.id)
        db.session.commit()
        return jsonify({'success': True, 'propagated_ls_ids': propagated_ls_ids})
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
    elif from_type == 'system_constraint' and to_type == 'hazard':
        existing = db.session.execute(
            db.select(sc_hazard_links).where(
                sc_hazard_links.c.sc_id == from_id,
                sc_hazard_links.c.hazard_id == to_id
            )
        ).first()
        if not existing:
            db.session.execute(sc_hazard_links.insert().values(sc_id=from_id, hazard_id=to_id))
            db.session.commit()
    elif from_type == 'controller_constraint' and to_type == 'uca':
        existing = db.session.execute(
            db.select(cc_uca_links).where(
                cc_uca_links.c.cc_id == from_id,
                cc_uca_links.c.uca_id == to_id
            )
        ).first()
        if not existing:
            db.session.execute(cc_uca_links.insert().values(cc_id=from_id, uca_id=to_id))
            db.session.commit()
    else:
        return jsonify({'error': 'Unsupported link type combination'}), 400

    return jsonify({'success': True})


@api_bp.route('/projects/<int:project_id>/links', methods=['DELETE'])
@login_required
def delete_link(project_id):
    check_project_access(project_id, require_editor=True)
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
        # Propagate removal to all child Loss Scenarios
        propagated_ls_ids = []
        for ls in LossScenario.query.filter_by(project_id=project_id, uca_id=from_id).all():
            ls_existing = db.session.execute(
                db.select(ls_hazard_links).where(
                    ls_hazard_links.c.ls_id == ls.id,
                    ls_hazard_links.c.hazard_id == to_id
                )
            ).first()
            if ls_existing:
                db.session.execute(ls_hazard_links.delete().where(
                    ls_hazard_links.c.ls_id == ls.id,
                    ls_hazard_links.c.hazard_id == to_id
                ))
                propagated_ls_ids.append(ls.id)
        db.session.commit()
        return jsonify({'success': True, 'propagated_ls_ids': propagated_ls_ids})
    elif from_type == 'loss_scenario' and to_type == 'hazard':
        db.session.execute(
            ls_hazard_links.delete().where(
                ls_hazard_links.c.ls_id == from_id,
                ls_hazard_links.c.hazard_id == to_id
            )
        )
        db.session.commit()
    elif from_type == 'system_constraint' and to_type == 'hazard':
        db.session.execute(
            sc_hazard_links.delete().where(
                sc_hazard_links.c.sc_id == from_id,
                sc_hazard_links.c.hazard_id == to_id
            )
        )
        db.session.commit()
    elif from_type == 'controller_constraint' and to_type == 'uca':
        db.session.execute(
            cc_uca_links.delete().where(
                cc_uca_links.c.cc_id == from_id,
                cc_uca_links.c.uca_id == to_id
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
    check_project_access(project_id, require_editor=True)
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
    check_project_access(project_id, require_editor=True)
    edge = CanvasEdge.query.filter_by(id=edge_id, project_id=project_id).first_or_404()
    db.session.delete(edge)
    db.session.commit()
    return jsonify({'success': True})
