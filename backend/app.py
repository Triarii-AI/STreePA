import os
from flask import Flask, send_from_directory
from flask_cors import CORS
from config import Config
from extensions import db, socketio, login_manager

_FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'dist')


def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False
    app.config.from_object(Config)

    db.init_app(app)
    socketio.init_app(
        app,
        cors_allowed_origins='*',
        async_mode='eventlet'
    )
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'

    CORS(app, supports_credentials=True)

    from models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from routes.auth import auth_bp
    from routes.projects import projects_bp
    from routes.api import api_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(projects_bp, url_prefix='/api/projects')
    app.register_blueprint(api_bp, url_prefix='/api')

    from events import register_events
    register_events(socketio)

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        if not os.path.isdir(_FRONTEND_DIST):
            return ('Frontend not built. Run: cd frontend && npm run build', 503)
        target = os.path.join(_FRONTEND_DIST, path)
        if path and os.path.isfile(target):
            return send_from_directory(_FRONTEND_DIST, path)
        return send_from_directory(_FRONTEND_DIST, 'index.html')

    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == '__main__':
    socketio.run(app, debug=True, use_reloader=False, host='0.0.0.0', port=5000)
