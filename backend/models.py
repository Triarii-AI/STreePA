from datetime import datetime, timezone
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db


# Association tables
hazard_loss_links = db.Table(
    'hazard_loss_links',
    db.Column('hazard_id', db.Integer, db.ForeignKey('hazards.id', ondelete='CASCADE'), primary_key=True),
    db.Column('loss_id', db.Integer, db.ForeignKey('losses.id', ondelete='CASCADE'), primary_key=True)
)

uca_hazard_links = db.Table(
    'uca_hazard_links',
    db.Column('uca_id', db.Integer, db.ForeignKey('ucas.id', ondelete='CASCADE'), primary_key=True),
    db.Column('hazard_id', db.Integer, db.ForeignKey('hazards.id', ondelete='CASCADE'), primary_key=True)
)

ls_hazard_links = db.Table(
    'ls_hazard_links',
    db.Column('ls_id', db.Integer, db.ForeignKey('loss_scenarios.id', ondelete='CASCADE'), primary_key=True),
    db.Column('hazard_id', db.Integer, db.ForeignKey('hazards.id', ondelete='CASCADE'), primary_key=True)
)

sc_hazard_links = db.Table(
    'sc_hazard_links',
    db.Column('sc_id', db.Integer, db.ForeignKey('system_constraints.id', ondelete='CASCADE'), primary_key=True),
    db.Column('hazard_id', db.Integer, db.ForeignKey('hazards.id', ondelete='CASCADE'), primary_key=True)
)


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    dark_mode = db.Column(db.Boolean, default=False, nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'dark_mode': bool(self.dark_mode),
        }


class Project(db.Model):
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    purpose_statement = db.Column(db.Text, nullable=True)
    root_x = db.Column(db.Float, default=500.0)
    root_y = db.Column(db.Float, default=50.0)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    icon_color = db.Column(db.String(20), default='indigo', nullable=False, server_default='indigo')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    owner = db.relationship('User', foreign_keys=[owner_id], lazy=True)
    shares = db.relationship('ProjectShare', backref='project', cascade='all, delete-orphan', lazy=True)
    losses = db.relationship('Loss', backref='project', cascade='all, delete-orphan', lazy=True)
    hazards = db.relationship('Hazard', backref='project', cascade='all, delete-orphan', lazy=True)
    system_constraints = db.relationship('SystemConstraint', backref='project', cascade='all, delete-orphan', lazy=True)
    control_actions = db.relationship('ControlAction', backref='project', cascade='all, delete-orphan', lazy=True)
    ucas = db.relationship('UCA', backref='project', cascade='all, delete-orphan', lazy=True)
    loss_scenarios = db.relationship('LossScenario', backref='project', cascade='all, delete-orphan', lazy=True)
    canvas_edges = db.relationship('CanvasEdge', backref='project', cascade='all, delete-orphan', lazy=True)
    groups = db.relationship('NodeGroup', backref='project', cascade='all, delete-orphan', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'purpose_statement': self.purpose_statement,
            'root_x': self.root_x if self.root_x is not None else 500.0,
            'root_y': self.root_y if self.root_y is not None else 50.0,
            'owner_id': self.owner_id,
            'owner_username': self.owner.username if self.owner else None,
            'icon_color': self.icon_color or 'indigo',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ProjectShare(db.Model):
    __tablename__ = 'project_shares'

    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    role = db.Column(db.String(10), default='editor', nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = db.relationship('User', foreign_keys=[user_id], lazy=True)


class Loss(db.Model):
    __tablename__ = 'losses'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text, nullable=True)
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label,
            'description': self.description,
            'x': self.x,
            'y': self.y,
            'group_id': self.group_id,
        }


class Hazard(db.Model):
    __tablename__ = 'hazards'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text, nullable=True)
    parent_hazard_id = db.Column(db.Integer, db.ForeignKey('hazards.id', ondelete='CASCADE'), nullable=True)
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    sub_hazards = db.relationship('Hazard', backref=db.backref('parent', remote_side='Hazard.id'), lazy=True)
    linked_losses = db.relationship('Loss', secondary=hazard_loss_links, lazy=True)

    def to_dict(self):
        loss_ids = [row.loss_id for row in db.session.execute(
            db.select(hazard_loss_links.c.loss_id).where(hazard_loss_links.c.hazard_id == self.id)
        ).fetchall()]
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label,
            'description': self.description,
            'parent_hazard_id': self.parent_hazard_id,
            'x': self.x,
            'y': self.y,
            'loss_ids': loss_ids,
            'group_id': self.group_id,
        }


class SystemConstraint(db.Model):
    __tablename__ = 'system_constraints'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(20), nullable=False)
    description = db.Column(db.Text, nullable=True)
    linked_hazard_id = db.Column(db.Integer, db.ForeignKey('hazards.id', ondelete='SET NULL'), nullable=True)
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    linked_hazards = db.relationship('Hazard', secondary=sc_hazard_links, lazy=True)

    def to_dict(self):
        hazard_ids = [row.hazard_id for row in db.session.execute(
            db.select(sc_hazard_links.c.hazard_id).where(sc_hazard_links.c.sc_id == self.id)
        ).fetchall()]
        if self.linked_hazard_id and self.linked_hazard_id not in hazard_ids:
            hazard_ids.append(self.linked_hazard_id)
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label,
            'description': self.description,
            'linked_hazard_id': self.linked_hazard_id,
            'hazard_ids': hazard_ids,
            'x': self.x,
            'y': self.y,
            'group_id': self.group_id,
        }


class ControlAction(db.Model):
    __tablename__ = 'control_actions'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(20), nullable=False)
    name = db.Column(db.String(255), nullable=True)
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    ucas = db.relationship('UCA', backref='control_action', cascade='save-update, merge', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label,
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'group_id': self.group_id,
        }


class UCA(db.Model):
    __tablename__ = 'ucas'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(30), nullable=False)
    description = db.Column(db.Text, nullable=True)
    control_action_id = db.Column(db.Integer, db.ForeignKey('control_actions.id', ondelete='SET NULL'), nullable=True)
    uca_type = db.Column(
        db.Enum('not_providing', 'providing_causes_hazard', 'wrong_timing_order', 'duration_issue'),
        nullable=False
    )
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    linked_hazards = db.relationship('Hazard', secondary=uca_hazard_links, lazy=True)
    loss_scenarios = db.relationship('LossScenario', backref='uca', cascade='save-update, merge', lazy=True)

    def to_dict(self):
        hazard_ids = [row.hazard_id for row in db.session.execute(
            db.select(uca_hazard_links.c.hazard_id).where(uca_hazard_links.c.uca_id == self.id)
        ).fetchall()]
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label,
            'description': self.description,
            'control_action_id': self.control_action_id,
            'uca_type': self.uca_type,
            'x': self.x,
            'y': self.y,
            'hazard_ids': hazard_ids,
            'group_id': self.group_id,
        }


class LossScenario(db.Model):
    __tablename__ = 'loss_scenarios'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(30), nullable=False)
    description = db.Column(db.Text, nullable=True)
    uca_id = db.Column(db.Integer, db.ForeignKey('ucas.id', ondelete='SET NULL'), nullable=True)
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    linked_hazards = db.relationship('Hazard', secondary=ls_hazard_links, lazy=True)

    def to_dict(self):
        hazard_ids = [row.hazard_id for row in db.session.execute(
            db.select(ls_hazard_links.c.hazard_id).where(ls_hazard_links.c.ls_id == self.id)
        ).fetchall()]
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label,
            'description': self.description,
            'uca_id': self.uca_id,
            'x': self.x,
            'y': self.y,
            'hazard_ids': hazard_ids,
            'group_id': self.group_id,
        }


class NodeGroup(db.Model):
    __tablename__ = 'node_groups'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    label = db.Column(db.String(200), nullable=True)
    x = db.Column(db.Float, default=0.0)
    y = db.Column(db.Float, default=0.0)
    width = db.Column(db.Float, default=200.0)
    height = db.Column(db.Float, default=200.0)
    parent_group_id = db.Column(db.Integer, db.ForeignKey('node_groups.id', ondelete='SET NULL'), nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'label': self.label or '',
            'x': self.x,
            'y': self.y,
            'width': self.width,
            'height': self.height,
            'parent_group_id': self.parent_group_id,
        }


class CanvasEdge(db.Model):
    __tablename__ = 'canvas_edges'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False)
    from_node_type = db.Column(db.String(50), nullable=False)
    from_node_id = db.Column(db.Integer, nullable=False)
    to_node_type = db.Column(db.String(50), nullable=False)
    to_node_id = db.Column(db.Integer, nullable=False)
    style = db.Column(db.Enum('solid', 'dashed'), default='dashed', nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'from_node_type': self.from_node_type,
            'from_node_id': self.from_node_id,
            'to_node_type': self.to_node_type,
            'to_node_id': self.to_node_id,
            'style': self.style
        }
