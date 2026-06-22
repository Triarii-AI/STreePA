import sqlite3
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from flask_login import LoginManager
from sqlalchemy import event
from sqlalchemy.engine import Engine

db = SQLAlchemy()
socketio = SocketIO()
login_manager = LoginManager()


@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    if isinstance(dbapi_conn, sqlite3.Connection):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        for sql in [
            "ALTER TABLE projects ADD COLUMN root_x REAL DEFAULT 500.0",
            "ALTER TABLE projects ADD COLUMN root_y REAL DEFAULT 50.0",
            "ALTER TABLE users ADD COLUMN dark_mode BOOLEAN NOT NULL DEFAULT 0",
            "ALTER TABLE projects ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
            "ALTER TABLE projects ADD COLUMN icon_color TEXT NOT NULL DEFAULT 'indigo'",
            """CREATE TABLE IF NOT EXISTS project_shares (
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (project_id, user_id)
            )""",
            # Backfill existing loss scenarios with their parent UCA's hazard links
            """INSERT OR IGNORE INTO ls_hazard_links (ls_id, hazard_id)
               SELECT ls.id, uh.hazard_id
               FROM loss_scenarios ls
               JOIN uca_hazard_links uh ON uh.uca_id = ls.uca_id
               WHERE ls.uca_id IS NOT NULL""",
            "ALTER TABLE project_shares ADD COLUMN role TEXT NOT NULL DEFAULT 'editor'",
        ]:
            try:
                cursor.execute(sql)
            except Exception:
                pass
        cursor.close()
