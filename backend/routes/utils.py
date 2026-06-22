from flask import abort
from flask_login import current_user
from models import Project, ProjectShare


def check_project_access(project_id, owner_only=False):
    """Return the project if current_user may access it, else 403/404."""
    project = Project.query.get_or_404(project_id)
    # Legacy project with no owner — accessible to all authenticated users
    if project.owner_id is None:
        return project
    if project.owner_id == current_user.id:
        return project
    if not owner_only:
        share = ProjectShare.query.filter_by(
            project_id=project_id, user_id=current_user.id
        ).first()
        if share:
            return project
    abort(403)
