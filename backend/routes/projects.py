from flask import Blueprint, request, jsonify
from flask_login import login_required
from extensions import db
from models import (
    Project, Loss, Hazard, SystemConstraint,
    ControlAction, UCA, LossScenario, CanvasEdge
)

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/', methods=['GET'])
@login_required
def list_projects():
    projects = Project.query.order_by(Project.updated_at.desc()).all()
    return jsonify([p.to_dict() for p in projects])


@projects_bp.route('/', methods=['POST'])
@login_required
def create_project():
    data = request.get_json() or {}
    title = data.get('title', 'Untitled Project')
    purpose_statement = data.get('purpose_statement', '')

    project = Project(title=title, purpose_statement=purpose_statement)
    db.session.add(project)
    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    project = Project.query.get_or_404(project_id)

    losses = Loss.query.filter_by(project_id=project_id).all()
    hazards = Hazard.query.filter_by(project_id=project_id).all()
    scs = SystemConstraint.query.filter_by(project_id=project_id).all()
    cas = ControlAction.query.filter_by(project_id=project_id).all()
    ucas = UCA.query.filter_by(project_id=project_id).all()
    lss = LossScenario.query.filter_by(project_id=project_id).all()
    edges = CanvasEdge.query.filter_by(project_id=project_id).all()

    return jsonify({
        'project': project.to_dict(),
        'losses': [l.to_dict() for l in losses],
        'hazards': [h.to_dict() for h in hazards],
        'system_constraints': [sc.to_dict() for sc in scs],
        'control_actions': [ca.to_dict() for ca in cas],
        'ucas': [u.to_dict() for u in ucas],
        'loss_scenarios': [ls.to_dict() for ls in lss],
        'canvas_edges': [e.to_dict() for e in edges]
    })


@projects_bp.route('/<int:project_id>', methods=['PUT'])
@login_required
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.get_json() or {}

    if 'title' in data:
        project.title = data['title']
    if 'purpose_statement' in data:
        project.purpose_statement = data['purpose_statement']

    db.session.commit()
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'success': True})
