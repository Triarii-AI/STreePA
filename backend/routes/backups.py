import os
import json
import re
import sqlite3
import threading
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, current_app, request
from flask_login import login_required

backups_bp = Blueprint('backups', __name__)

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BACKUP_DIR = os.path.join(_BACKEND_DIR, 'backups')
_SETTINGS_FILE = os.path.join(_BACKUP_DIR, 'settings.json')

_DEFAULT_SETTINGS = {
    'enabled': False,
    'interval_minutes': 60,
    'max_backups': 20,
}

_last_auto_backup = 0.0


def _ensure_dir():
    os.makedirs(_BACKUP_DIR, exist_ok=True)


def _load_settings():
    _ensure_dir()
    if os.path.isfile(_SETTINGS_FILE):
        try:
            with open(_SETTINGS_FILE) as f:
                return {**_DEFAULT_SETTINGS, **json.load(f)}
        except Exception:
            pass
    return dict(_DEFAULT_SETTINGS)


def _save_settings_to_disk(settings):
    _ensure_dir()
    with open(_SETTINGS_FILE, 'w') as f:
        json.dump(settings, f, indent=2)


def _get_db_path(app):
    uri = app.config.get('SQLALCHEMY_DATABASE_URI', '')
    m = re.match(r'sqlite:///(.*)', uri)
    if not m:
        return None
    path = m.group(1)
    if not os.path.isabs(path):
        path = os.path.join(app.instance_path, path)
    return path


def _validate_db(path):
    try:
        conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        result = conn.execute('PRAGMA integrity_check').fetchone()
        conn.close()
        return result is not None and result[0] == 'ok'
    except Exception:
        return False


def do_backup(app):
    _ensure_dir()
    db_path = _get_db_path(app)
    if not db_path or not os.path.isfile(db_path):
        return {'success': False, 'error': 'Database file not found'}

    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    filename = f'stpa_backup_{ts}.db'
    dest = os.path.join(_BACKUP_DIR, filename)

    try:
        src = sqlite3.connect(db_path)
        dst = sqlite3.connect(dest)
        src.backup(dst)
        src.close()
        dst.close()

        valid = _validate_db(dest)
        size = os.path.getsize(dest)

        _prune_old_backups(_load_settings().get('max_backups', 20))

        return {
            'success': True,
            'filename': filename,
            'size': size,
            'valid': valid,
            'created_at': datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        try:
            os.remove(dest)
        except Exception:
            pass
        return {'success': False, 'error': str(e)}


def _list_backups():
    _ensure_dir()
    result = []
    for name in sorted(os.listdir(_BACKUP_DIR), reverse=True):
        if not (name.endswith('.db') and name.startswith('stpa_backup_')):
            continue
        path = os.path.join(_BACKUP_DIR, name)
        stat = os.stat(path)
        valid = _validate_db(path)
        result.append({
            'filename': name,
            'size': stat.st_size,
            'created_at': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            'valid': valid,
        })
    return result


def _prune_old_backups(max_count):
    files = sorted(
        [f for f in os.listdir(_BACKUP_DIR) if f.endswith('.db') and f.startswith('stpa_backup_')],
        reverse=True,
    )
    for f in files[max_count:]:
        try:
            os.remove(os.path.join(_BACKUP_DIR, f))
        except Exception:
            pass


# ── Auto-backup background thread ─────────────────────────────────────────────

def _backup_loop(app):
    global _last_auto_backup
    while True:
        time.sleep(60)
        try:
            settings = _load_settings()
            if not settings.get('enabled'):
                continue
            interval_secs = settings.get('interval_minutes', 60) * 60
            now = time.time()
            if (now - _last_auto_backup) >= interval_secs:
                with app.app_context():
                    do_backup(app)
                _last_auto_backup = now
        except Exception:
            pass


def start_backup_scheduler(app):
    t = threading.Thread(target=_backup_loop, args=(app,), daemon=True)
    t.start()


# ── Routes ────────────────────────────────────────────────────────────────────

@backups_bp.route('', methods=['GET'])
@login_required
def list_backups_route():
    return jsonify(_list_backups())


@backups_bp.route('', methods=['POST'])
@login_required
def create_backup_route():
    result = do_backup(current_app._get_current_object())
    if result['success']:
        return jsonify(result), 201
    return jsonify({'error': result['error']}), 500


@backups_bp.route('/<path:filename>', methods=['DELETE'])
@login_required
def delete_backup_route(filename):
    if '/' in filename or '..' in filename or not filename.endswith('.db'):
        return jsonify({'error': 'Invalid filename'}), 400
    path = os.path.join(_BACKUP_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({'error': 'Not found'}), 404
    os.remove(path)
    return jsonify({'success': True})


@backups_bp.route('/settings', methods=['GET'])
@login_required
def get_settings_route():
    return jsonify(_load_settings())


@backups_bp.route('/settings', methods=['PUT'])
@login_required
def save_settings_route():
    data = request.get_json() or {}
    settings = _load_settings()
    if 'enabled' in data:
        settings['enabled'] = bool(data['enabled'])
    if 'interval_minutes' in data:
        v = int(data['interval_minutes'])
        if v > 0:
            settings['interval_minutes'] = v
    if 'max_backups' in data:
        v = int(data['max_backups'])
        if v > 0:
            settings['max_backups'] = v
    _save_settings_to_disk(settings)
    return jsonify(settings)
