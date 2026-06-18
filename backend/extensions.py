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
        cursor.close()
