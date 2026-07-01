import io
import json
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, Response, send_file
from flask_login import login_required, current_user
from extensions import db, socketio
from models import (
    Project, ProjectShare, User, Loss, Hazard, SystemConstraint,
    ControlAction, UCA, LossScenario, ControllerConstraint, CanvasEdge, NodeGroup
)
from routes.utils import check_project_access, get_user_role

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/', methods=['GET'])
@login_required
def list_projects():
    projects = Project.query.filter(
        (Project.owner_id == current_user.id) | (Project.owner_id == None)
    ).order_by(Project.updated_at.desc()).all()
    return jsonify([p.to_dict() for p in projects])


@projects_bp.route('/shared', methods=['GET'])
@login_required
def list_shared_projects():
    shares = ProjectShare.query.filter_by(user_id=current_user.id).all()
    share_roles = {s.project_id: s.role for s in shares}
    projects = [Project.query.get(s.project_id) for s in shares]
    projects = [p for p in projects if p is not None]
    projects.sort(key=lambda p: p.updated_at or p.created_at, reverse=True)
    result = []
    for p in projects:
        d = p.to_dict()
        d['user_role'] = share_roles.get(p.id, 'editor')
        result.append(d)
    return jsonify(result)


@projects_bp.route('/', methods=['POST'])
@login_required
def create_project():
    data = request.get_json() or {}
    title = data.get('title', 'Untitled Project')
    purpose_statement = data.get('purpose_statement', '')

    project = Project(title=title, purpose_statement=purpose_statement, owner_id=current_user.id)
    db.session.add(project)
    db.session.commit()
    return jsonify({'project': project.to_dict()}), 201


@projects_bp.route('/<int:project_id>/shares', methods=['GET'])
@login_required
def list_shares(project_id):
    check_project_access(project_id)
    shares = ProjectShare.query.filter_by(project_id=project_id).all()
    return jsonify([{
        'user_id': s.user_id,
        'username': s.user.username,
        'role': s.role,
    } for s in shares])


@projects_bp.route('/<int:project_id>/shares', methods=['POST'])
@login_required
def add_share(project_id):
    check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    if not username:
        return jsonify({'error': 'Username is required'}), 400
    target = User.query.filter_by(username=username).first()
    if not target:
        return jsonify({'error': f'User "{username}" not found'}), 404
    if target.id == current_user.id:
        return jsonify({'error': 'You cannot share a project with yourself'}), 400
    existing = ProjectShare.query.filter_by(project_id=project_id, user_id=target.id).first()
    if existing:
        return jsonify({'error': f'Project already shared with {username}'}), 400
    requested_role = data.get('role', 'editor')
    if requested_role not in ('editor', 'viewer'):
        requested_role = 'editor'
    share = ProjectShare(project_id=project_id, user_id=target.id, role=requested_role)
    db.session.add(share)
    db.session.commit()
    return jsonify({'user_id': target.id, 'username': target.username, 'role': share.role}), 201


@projects_bp.route('/<int:project_id>/shares/<int:user_id>', methods=['PATCH'])
@login_required
def update_share(project_id, user_id):
    check_project_access(project_id, require_editor=True)
    share = ProjectShare.query.filter_by(project_id=project_id, user_id=user_id).first_or_404()
    data = request.get_json() or {}
    role = data.get('role')
    if role not in ('editor', 'viewer'):
        return jsonify({'error': 'role must be "editor" or "viewer"'}), 400
    share.role = role
    db.session.commit()
    socketio.emit('share:role_changed', {
        'project_id': project_id,
        'user_id': user_id,
        'new_role': share.role,
    }, room=f'project:{project_id}')
    return jsonify({'user_id': user_id, 'username': share.user.username, 'role': share.role})


@projects_bp.route('/<int:project_id>/shares/<int:user_id>', methods=['DELETE'])
@login_required
def remove_share(project_id, user_id):
    check_project_access(project_id, owner_only=True)
    share = ProjectShare.query.filter_by(project_id=project_id, user_id=user_id).first_or_404()
    db.session.delete(share)
    db.session.commit()
    return jsonify({'success': True})


@projects_bp.route('/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    project = check_project_access(project_id)

    losses = Loss.query.filter_by(project_id=project_id).all()
    hazards = Hazard.query.filter_by(project_id=project_id).all()
    scs = SystemConstraint.query.filter_by(project_id=project_id).all()
    cas = ControlAction.query.filter_by(project_id=project_id).all()
    ucas = UCA.query.filter_by(project_id=project_id).all()
    ccs = ControllerConstraint.query.filter_by(project_id=project_id).all()
    lss = LossScenario.query.filter_by(project_id=project_id).all()
    edges = CanvasEdge.query.filter_by(project_id=project_id).all()
    groups = NodeGroup.query.filter_by(project_id=project_id).all()

    return jsonify({
        'project': project.to_dict(),
        'user_role': get_user_role(project_id),
        'losses': [l.to_dict() for l in losses],
        'hazards': [h.to_dict() for h in hazards],
        'system_constraints': [sc.to_dict() for sc in scs],
        'control_actions': [ca.to_dict() for ca in cas],
        'ucas': [u.to_dict() for u in ucas],
        'controller_constraints': [cc.to_dict() for cc in ccs],
        'loss_scenarios': [ls.to_dict() for ls in lss],
        'canvas_edges': [e.to_dict() for e in edges],
        'groups': [g.to_dict() for g in groups],
    })


@projects_bp.route('/<int:project_id>', methods=['PUT'])
@login_required
def update_project(project_id):
    project = check_project_access(project_id, require_editor=True)
    data = request.get_json() or {}

    if 'title' in data:
        project.title = data['title']
    if 'purpose_statement' in data:
        project.purpose_statement = data['purpose_statement']
    if 'root_x' in data:
        project.root_x = float(data['root_x'])
    if 'root_y' in data:
        project.root_y = float(data['root_y'])
    if 'icon_color' in data:
        project.icon_color = data['icon_color']

    db.session.commit()
    socketio.emit('project:updated', {
        'project_id': project_id,
        'title': project.title,
        'icon_color': project.icon_color,
        'purpose_statement': project.purpose_statement,
    }, room=f'project:{project_id}')
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    project = check_project_access(project_id, owner_only=True)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'success': True})


@projects_bp.route('/<int:project_id>/duplicate', methods=['POST'])
@login_required
def duplicate_project(project_id):
    src = check_project_access(project_id)

    copy = Project(
        title=src.title + ' (Copy)',
        purpose_statement=src.purpose_statement,
        root_x=src.root_x, root_y=src.root_y,
        icon_color=src.icon_color,
        owner_id=current_user.id,
    )
    db.session.add(copy)
    db.session.flush()

    loss_map, hazard_map, sc_map, ca_map, uca_map, cc_map = {}, {}, {}, {}, {}, {}

    for l in Loss.query.filter_by(project_id=project_id).all():
        n = Loss(project_id=copy.id, label=l.label, description=l.description, x=l.x, y=l.y)
        db.session.add(n); db.session.flush(); loss_map[l.id] = n.id

    for h in Hazard.query.filter_by(project_id=project_id, parent_hazard_id=None).all():
        def copy_hazard(orig, new_parent_id=None):
            n = Hazard(project_id=copy.id, label=orig.label, description=orig.description,
                       parent_hazard_id=new_parent_id, x=orig.x, y=orig.y)
            db.session.add(n); db.session.flush()
            hazard_map[orig.id] = n.id
            for child in Hazard.query.filter_by(project_id=project_id, parent_hazard_id=orig.id).all():
                copy_hazard(child, n.id)
        copy_hazard(h)

    from models import hazard_loss_links, sc_hazard_links, uca_hazard_links, ls_hazard_links
    for h in Hazard.query.filter_by(project_id=project_id).all():
        nh = Hazard.query.get(hazard_map.get(h.id))
        if not nh: continue
        for l in h.linked_losses:
            nl = Loss.query.get(loss_map.get(l.id))
            if nl: nh.linked_losses.append(nl)

    for sc in SystemConstraint.query.filter_by(project_id=project_id).all():
        n = SystemConstraint(project_id=copy.id, label=sc.label, description=sc.description,
                             linked_hazard_id=hazard_map.get(sc.linked_hazard_id), x=sc.x, y=sc.y)
        db.session.add(n); db.session.flush(); sc_map[sc.id] = n.id
        for h in sc.linked_hazards:
            nh = Hazard.query.get(hazard_map.get(h.id))
            if nh: n.linked_hazards.append(nh)

    for ca in ControlAction.query.filter_by(project_id=project_id).all():
        n = ControlAction(project_id=copy.id, label=ca.label, name=ca.name, controller=ca.controller, x=ca.x, y=ca.y)
        db.session.add(n); db.session.flush(); ca_map[ca.id] = n.id

    for u in UCA.query.filter_by(project_id=project_id).all():
        n = UCA(project_id=copy.id, label=u.label, description=u.description,
                control_action_id=ca_map.get(u.control_action_id), uca_type=u.uca_type, x=u.x, y=u.y)
        db.session.add(n); db.session.flush(); uca_map[u.id] = n.id
        for h in u.linked_hazards:
            nh = Hazard.query.get(hazard_map.get(h.id))
            if nh: n.linked_hazards.append(nh)

    for cc in ControllerConstraint.query.filter_by(project_id=project_id).all():
        n = ControllerConstraint(project_id=copy.id, label=cc.label, description=cc.description,
                                 linked_uca_id=uca_map.get(cc.linked_uca_id), x=cc.x, y=cc.y)
        db.session.add(n); db.session.flush(); cc_map[cc.id] = n.id
        for u in cc.linked_ucas:
            nu = UCA.query.get(uca_map.get(u.id))
            if nu: n.linked_ucas.append(nu)

    for ls in LossScenario.query.filter_by(project_id=project_id).all():
        n = LossScenario(project_id=copy.id, label=ls.label, description=ls.description,
                         uca_id=uca_map.get(ls.uca_id), x=ls.x, y=ls.y)
        db.session.add(n); db.session.flush()
        for h in ls.linked_hazards:
            nh = Hazard.query.get(hazard_map.get(h.id))
            if nh: n.linked_hazards.append(nh)

    type_map = {'loss': loss_map, 'hazard': hazard_map, 'system_constraint': sc_map,
                'control_action': ca_map, 'uca': uca_map, 'controller_constraint': cc_map}
    for ce in CanvasEdge.query.filter_by(project_id=project_id).all():
        fm = type_map.get(ce.from_node_type, {}); tm = type_map.get(ce.to_node_type, {})
        nf = fm.get(ce.from_node_id); nt = tm.get(ce.to_node_id)
        if nf and nt:
            db.session.add(CanvasEdge(project_id=copy.id, from_node_type=ce.from_node_type,
                                      from_node_id=nf, to_node_type=ce.to_node_type,
                                      to_node_id=nt, style=ce.style))

    db.session.commit()
    return jsonify({'project': copy.to_dict()}), 201


# ─────────────────────────────────────────────
# EXPORT — JSON backup
# ─────────────────────────────────────────────

@projects_bp.route('/<int:project_id>/export/json', methods=['GET'])
@login_required
def export_project_json(project_id):
    project = check_project_access(project_id)
    data = {
        'version': '1.0',
        'project': {
            'title': project.title,
            'purpose_statement': project.purpose_statement or '',
            'root_x': project.root_x if project.root_x is not None else 500.0,
            'root_y': project.root_y if project.root_y is not None else 50.0,
            'icon_color': project.icon_color or 'indigo',
        },
        'losses':             [l.to_dict()  for l  in Loss.query.filter_by(project_id=project_id).all()],
        'hazards':            [h.to_dict()  for h  in Hazard.query.filter_by(project_id=project_id).all()],
        'system_constraints': [sc.to_dict() for sc in SystemConstraint.query.filter_by(project_id=project_id).all()],
        'control_actions':    [ca.to_dict() for ca in ControlAction.query.filter_by(project_id=project_id).all()],
        'ucas':               [u.to_dict()  for u  in UCA.query.filter_by(project_id=project_id).all()],
        'controller_constraints': [cc.to_dict() for cc in ControllerConstraint.query.filter_by(project_id=project_id).all()],
        'loss_scenarios':     [ls.to_dict() for ls in LossScenario.query.filter_by(project_id=project_id).all()],
        'canvas_edges':       [ce.to_dict() for ce in CanvasEdge.query.filter_by(project_id=project_id).all()],
        'groups':             [g.to_dict()  for g  in NodeGroup.query.filter_by(project_id=project_id).all()],
    }
    safe_title = ''.join(c if c.isalnum() or c in ' _-' else '_' for c in project.title).strip()
    filename = f"{safe_title or 'project'}.stpa.json"
    return Response(
        json.dumps(data, indent=2),
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


# ─────────────────────────────────────────────
# EXPORT — Excel
# ─────────────────────────────────────────────

@projects_bp.route('/<int:project_id>/export/excel', methods=['GET'])
@login_required
def export_project_excel(project_id):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    project = check_project_access(project_id)
    losses          = Loss.query.filter_by(project_id=project_id).all()
    hazards         = Hazard.query.filter_by(project_id=project_id).all()
    scs             = SystemConstraint.query.filter_by(project_id=project_id).all()
    cas             = ControlAction.query.filter_by(project_id=project_id).all()
    ucas            = UCA.query.filter_by(project_id=project_id).all()
    ccs             = ControllerConstraint.query.filter_by(project_id=project_id).all()
    loss_scenarios  = LossScenario.query.filter_by(project_id=project_id).all()

    # Label lookup helpers
    loss_labels    = {l.id: l.label   for l  in losses}
    hazard_labels  = {h.id: h.label   for h  in hazards}
    ca_labels      = {ca.id: ca.label for ca in cas}
    uca_labels     = {u.id: u.label   for u  in ucas}

    UCA_TYPE_LABELS = {
        'not_providing': 'Not Providing',
        'providing_causes_hazard': 'Providing Causes Hazard',
        'wrong_timing_order': 'Wrong Timing / Order',
        'duration_issue': 'Duration Issue',
    }

    wb = Workbook()

    def make_sheet(wb, title, header_hex, remove_default=False):
        if remove_default:
            ws = wb.active
            ws.title = title
        else:
            ws = wb.create_sheet(title)
        return ws

    def style_headers(ws, headers, header_hex):
        fill  = PatternFill('solid', fgColor=header_hex)
        font  = Font(bold=True, color='1F2937')
        align = Alignment(horizontal='left', vertical='center', wrap_text=False)
        ws.append(headers)
        for cell in ws[1]:
            cell.fill  = fill
            cell.font  = font
            cell.alignment = align
        ws.freeze_panes = 'A2'

    def autofit(ws, min_w=12, max_w=60):
        for col in ws.columns:
            length = max((len(str(c.value or '')) for c in col), default=min_w)
            ws.column_dimensions[get_column_letter(col[0].column)].width = min(max(length + 2, min_w), max_w)

    # ── Project Info ──
    ws = make_sheet(wb, 'Project', 'E0E7FF', remove_default=True)
    style_headers(ws, ['Field', 'Value'], 'C7D2FE')
    ws.append(['Title',             project.title])
    ws.append(['Purpose Statement', project.purpose_statement or ''])
    ws.append(['Exported At',       datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')])
    autofit(ws)

    # ── Losses ──
    ws = make_sheet(wb, 'Losses', 'FECACA')
    style_headers(ws, ['Label', 'Description'], 'FECACA')
    for l in losses:
        ws.append([l.label, l.description or ''])
    autofit(ws)

    # ── Hazards ──
    ws = make_sheet(wb, 'Hazards', 'FED7AA')
    style_headers(ws, ['Label', 'Description', 'Parent Hazard', 'Associated Losses'], 'FED7AA')
    h_dict = {h.id: h for h in hazards}
    for h in hazards:
        parent_label = hazard_labels.get(h.parent_hazard_id, '') if h.parent_hazard_id else ''
        h_data       = h.to_dict()
        assoc_losses = ', '.join(loss_labels[lid] for lid in h_data.get('loss_ids', []) if lid in loss_labels)
        ws.append([h.label, h.description or '', parent_label, assoc_losses])
    autofit(ws)

    # ── System Constraints ──
    ws = make_sheet(wb, 'System Constraints', 'FEF08A')
    style_headers(ws, ['Label', 'Description', 'Primary Hazard', 'Additional Hazards'], 'FEF08A')
    for sc in scs:
        sc_data      = sc.to_dict()
        primary      = hazard_labels.get(sc.linked_hazard_id, '') if sc.linked_hazard_id else ''
        extra_ids    = [hid for hid in sc_data.get('hazard_ids', []) if hid != sc.linked_hazard_id]
        extra        = ', '.join(hazard_labels[hid] for hid in extra_ids if hid in hazard_labels)
        ws.append([sc.label, sc.description or '', primary, extra])
    autofit(ws)

    # ── Control Actions ──
    ws = make_sheet(wb, 'Control Actions', 'BBF7D0')
    style_headers(ws, ['Label', 'Name', 'Controller'], 'BBF7D0')
    for ca in cas:
        ws.append([ca.label, ca.name or '', ca.controller or ''])
    autofit(ws)

    # ── UCAs ──
    ws = make_sheet(wb, 'UCAs', 'BFDBFE')
    style_headers(ws, ['Label', 'Description', 'Control Action', 'Controller', 'UCA Type', 'Associated Hazards'], 'BFDBFE')
    for u in ucas:
        u_data     = u.to_dict()
        ca_label   = ca_labels.get(u.control_action_id, '') if u.control_action_id else ''
        type_label = UCA_TYPE_LABELS.get(u.uca_type, u.uca_type or '')
        assoc_haz  = ', '.join(hazard_labels[hid] for hid in u_data.get('hazard_ids', []) if hid in hazard_labels)
        ws.append([u.label, u.description or '', ca_label, u_data.get('controller') or '', type_label, assoc_haz])
    autofit(ws)

    # ── Controller Constraints ──
    ws = make_sheet(wb, 'Controller Constraints', '99F6E4')
    style_headers(ws, ['Label', 'Description', 'Parent UCA', 'Controller', 'Additional UCAs'], '99F6E4')
    for cc in ccs:
        cc_data   = cc.to_dict()
        primary   = uca_labels.get(cc.linked_uca_id, '') if cc.linked_uca_id else ''
        extra_ids = [uid for uid in cc_data.get('uca_ids', []) if uid != cc.linked_uca_id]
        extra     = ', '.join(uca_labels[uid] for uid in extra_ids if uid in uca_labels)
        ws.append([cc.label, cc.description or '', primary, cc_data.get('controller') or '', extra])
    autofit(ws)

    # ── Loss Scenarios ──
    ws = make_sheet(wb, 'Loss Scenarios', 'E9D5FF')
    style_headers(ws, ['Label', 'Description', 'UCA', 'Controller'], 'E9D5FF')
    for ls in loss_scenarios:
        ls_data   = ls.to_dict()
        uca_label = uca_labels.get(ls.uca_id, '') if ls.uca_id else ''
        ws.append([ls.label, ls.description or '', uca_label, ls_data.get('controller') or ''])
    autofit(ws)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    safe_title = ''.join(c if c.isalnum() or c in ' _-' else '_' for c in project.title).strip()
    filename = f"{safe_title or 'project'}.stpa.xlsx"
    return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)


# ─────────────────────────────────────────────
# IMPORT — JSON backup
# ─────────────────────────────────────────────

@projects_bp.route('/import', methods=['POST'])
@login_required
def import_project():
    data = request.get_json()
    if not data or 'project' not in data:
        return jsonify({'error': 'Invalid import file — missing project key'}), 400

    proj_data = data['project']
    project = Project(
        title=proj_data.get('title', 'Imported Project'),
        purpose_statement=proj_data.get('purpose_statement', ''),
        root_x=proj_data.get('root_x', 500.0),
        root_y=proj_data.get('root_y', 50.0),
        icon_color=proj_data.get('icon_color', 'indigo'),
        owner_id=current_user.id
    )
    db.session.add(project)
    db.session.flush()

    loss_map    = {}
    hazard_map  = {}
    sc_map      = {}
    ca_map      = {}
    uca_map     = {}
    cc_map      = {}
    ls_map      = {}
    group_map   = {}

    # Node Groups — BFS so parents exist before nested child groups
    pending = list(data.get('groups', []))
    max_passes = len(pending) + 1
    for _ in range(max_passes):
        if not pending:
            break
        still_pending = []
        for g in pending:
            old_parent = g.get('parent_group_id')
            if old_parent is not None and old_parent not in group_map:
                still_pending.append(g)
                continue
            node = NodeGroup(project_id=project.id, label=g.get('label') or '',
                             x=g.get('x', 0), y=g.get('y', 0),
                             width=g.get('width', 200), height=g.get('height', 200),
                             parent_group_id=group_map.get(old_parent))
            db.session.add(node)
            db.session.flush()
            group_map[g['id']] = node.id
        pending = still_pending

    # Losses
    for l in data.get('losses', []):
        node = Loss(project_id=project.id, label=l['label'],
                    description=l.get('description') or '',
                    group_id=group_map.get(l.get('group_id')),
                    x=l.get('x', 0), y=l.get('y', 0))
        db.session.add(node)
        db.session.flush()
        loss_map[l['id']] = node.id

    # Hazards — BFS so parents exist before children
    pending = list(data.get('hazards', []))
    max_passes = len(pending) + 1
    for _ in range(max_passes):
        if not pending:
            break
        still_pending = []
        for h in pending:
            old_parent = h.get('parent_hazard_id')
            if old_parent is not None and old_parent not in hazard_map:
                still_pending.append(h)
                continue
            node = Hazard(project_id=project.id, label=h['label'],
                          description=h.get('description') or '',
                          parent_hazard_id=hazard_map.get(old_parent),
                          group_id=group_map.get(h.get('group_id')),
                          x=h.get('x', 0), y=h.get('y', 0))
            db.session.add(node)
            db.session.flush()
            hazard_map[h['id']] = node.id
        pending = still_pending

    # Hazard → Loss links
    for h in data.get('hazards', []):
        new_hid = hazard_map.get(h['id'])
        if not new_hid:
            continue
        hazard_obj = Hazard.query.get(new_hid)
        for old_lid in h.get('loss_ids', []):
            new_lid = loss_map.get(old_lid)
            if new_lid:
                loss_obj = Loss.query.get(new_lid)
                if loss_obj and loss_obj not in hazard_obj.linked_losses:
                    hazard_obj.linked_losses.append(loss_obj)

    # System Constraints
    for sc in data.get('system_constraints', []):
        new_linked = hazard_map.get(sc.get('linked_hazard_id'))
        node = SystemConstraint(project_id=project.id, label=sc['label'],
                                description=sc.get('description') or '',
                                linked_hazard_id=new_linked,
                                group_id=group_map.get(sc.get('group_id')),
                                x=sc.get('x', 0), y=sc.get('y', 0))
        db.session.add(node)
        db.session.flush()
        sc_map[sc['id']] = node.id
        for old_hid in sc.get('hazard_ids', []):
            new_hid = hazard_map.get(old_hid)
            if new_hid and new_hid != new_linked:
                h_obj = Hazard.query.get(new_hid)
                if h_obj and h_obj not in node.linked_hazards:
                    node.linked_hazards.append(h_obj)

    # Control Actions
    for ca in data.get('control_actions', []):
        node = ControlAction(project_id=project.id, label=ca['label'],
                             name=ca.get('name') or '',
                             controller=ca.get('controller') or '',
                             group_id=group_map.get(ca.get('group_id')),
                             x=ca.get('x', 0), y=ca.get('y', 0))
        db.session.add(node)
        db.session.flush()
        ca_map[ca['id']] = node.id

    # UCAs
    for u in data.get('ucas', []):
        new_ca = ca_map.get(u.get('control_action_id'))
        node = UCA(project_id=project.id, label=u['label'],
                   description=u.get('description') or '',
                   control_action_id=new_ca,
                   uca_type=u['uca_type'],
                   group_id=group_map.get(u.get('group_id')),
                   x=u.get('x', 0), y=u.get('y', 0))
        db.session.add(node)
        db.session.flush()
        uca_map[u['id']] = node.id
        for old_hid in u.get('hazard_ids', []):
            new_hid = hazard_map.get(old_hid)
            if new_hid:
                h_obj = Hazard.query.get(new_hid)
                if h_obj and h_obj not in node.linked_hazards:
                    node.linked_hazards.append(h_obj)

    # Controller Constraints
    for cc in data.get('controller_constraints', []):
        new_linked = uca_map.get(cc.get('linked_uca_id'))
        node = ControllerConstraint(project_id=project.id, label=cc['label'],
                                    description=cc.get('description') or '',
                                    linked_uca_id=new_linked,
                                    group_id=group_map.get(cc.get('group_id')),
                                    x=cc.get('x', 0), y=cc.get('y', 0))
        db.session.add(node)
        db.session.flush()
        cc_map[cc['id']] = node.id
        for old_uid in cc.get('uca_ids', []):
            new_uid = uca_map.get(old_uid)
            if new_uid and new_uid != new_linked:
                u_obj = UCA.query.get(new_uid)
                if u_obj and u_obj not in node.linked_ucas:
                    node.linked_ucas.append(u_obj)

    # Loss Scenarios
    for ls in data.get('loss_scenarios', []):
        new_uca = uca_map.get(ls.get('uca_id'))
        node = LossScenario(project_id=project.id, label=ls['label'],
                            description=ls.get('description') or '',
                            uca_id=new_uca,
                            group_id=group_map.get(ls.get('group_id')),
                            x=ls.get('x', 0), y=ls.get('y', 0))
        db.session.add(node)
        db.session.flush()
        ls_map[ls['id']] = node.id
        for old_hid in ls.get('hazard_ids', []):
            new_hid = hazard_map.get(old_hid)
            if new_hid:
                h_obj = Hazard.query.get(new_hid)
                if h_obj and h_obj not in node.linked_hazards:
                    node.linked_hazards.append(h_obj)

    # Canvas Edges
    type_map = {'loss': loss_map, 'hazard': hazard_map, 'system_constraint': sc_map,
                'control_action': ca_map, 'uca': uca_map, 'controller_constraint': cc_map,
                'loss_scenario': ls_map}
    for ce in data.get('canvas_edges', []):
        from_map = type_map.get(ce['from_node_type'], {})
        to_map   = type_map.get(ce['to_node_type'], {})
        new_from = from_map.get(ce['from_node_id'])
        new_to   = to_map.get(ce['to_node_id'])
        if new_from and new_to:
            edge = CanvasEdge(project_id=project.id,
                              from_node_type=ce['from_node_type'], from_node_id=new_from,
                              to_node_type=ce['to_node_type'],   to_node_id=new_to,
                              style=ce.get('style', 'dashed'))
            db.session.add(edge)

    db.session.commit()
    return jsonify({'success': True, 'project': project.to_dict()}), 201
