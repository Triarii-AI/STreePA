from flask import Flask
from flask_cors import CORS
from config import Config
from extensions import db, socketio, login_manager


def _run_migrations(app):
    with app.app_context():
        try:
            with db.engine.connect() as conn:
                db_name = conn.execute(db.text("SELECT DATABASE()")).scalar()

                row = conn.execute(db.text(
                    "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'ucas' AND COLUMN_NAME = 'control_action_id'"
                ), {"db": db_name}).fetchone()
                if row and row[0] == 'NO':
                    fk = conn.execute(db.text(
                        "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE "
                        "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'ucas' "
                        "AND COLUMN_NAME = 'control_action_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
                    ), {"db": db_name}).fetchone()
                    if fk:
                        conn.execute(db.text(f"ALTER TABLE ucas DROP FOREIGN KEY `{fk[0]}`"))
                    conn.execute(db.text("ALTER TABLE ucas MODIFY COLUMN control_action_id INT NULL"))
                    conn.execute(db.text(
                        "ALTER TABLE ucas ADD CONSTRAINT fk_ucas_ca_id "
                        "FOREIGN KEY (control_action_id) REFERENCES control_actions(id) ON DELETE SET NULL"
                    ))
                    conn.commit()

                row = conn.execute(db.text(
                    "SELECT IS_NULLABLE FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'loss_scenarios' AND COLUMN_NAME = 'uca_id'"
                ), {"db": db_name}).fetchone()
                if row and row[0] == 'NO':
                    fk = conn.execute(db.text(
                        "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE "
                        "WHERE TABLE_SCHEMA = :db AND TABLE_NAME = 'loss_scenarios' "
                        "AND COLUMN_NAME = 'uca_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
                    ), {"db": db_name}).fetchone()
                    if fk:
                        conn.execute(db.text(f"ALTER TABLE loss_scenarios DROP FOREIGN KEY `{fk[0]}`"))
                    conn.execute(db.text("ALTER TABLE loss_scenarios MODIFY COLUMN uca_id INT NULL"))
                    conn.execute(db.text(
                        "ALTER TABLE loss_scenarios ADD CONSTRAINT fk_ls_uca_id "
                        "FOREIGN KEY (uca_id) REFERENCES ucas(id) ON DELETE SET NULL"
                    ))
                    conn.commit()
        except Exception as e:
            print(f"[migration] warning: {e}")


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Initialize extensions
    db.init_app(app)
    socketio.init_app(
        app,
        cors_allowed_origins='*',
        async_mode='eventlet'
    )
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'

    CORS(app, supports_credentials=True)

    # User loader
    from models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Register blueprints
    from routes.auth import auth_bp
    from routes.projects import projects_bp
    from routes.api import api_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    app.register_blueprint(api_bp, url_prefix='/api')

    # Register SocketIO events
    from events import register_events
    register_events(socketio)

    # Create database tables
    with app.app_context():
        db.create_all()

    _run_migrations(app)

    return app


app = create_app()

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
