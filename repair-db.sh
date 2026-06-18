#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$ROOT/backend/instance/stpa.db"
VENV="$ROOT/backend/venv"

echo ""
echo "  STPA Tree Graph — DB Repair"
echo "  ============================"
echo ""

[[ -d "$VENV" ]] || die "Python venv not found at backend/venv. Run ./setup.sh first."
[[ -f "$ROOT/backend/.env" ]] || die ".env not found. Run ./setup.sh first."

info "Ensuring all SQLite tables exist..."
source "$VENV/bin/activate"
cd "$ROOT/backend"
python3 -c "from app import create_app; create_app()"

success "Schema verified. Tables created if missing."
echo ""

if command -v sqlite3 >/dev/null 2>&1 && [[ -f "$DB_FILE" ]]; then
  info "Quick integrity check..."
  RESULT=$(sqlite3 "$DB_FILE" "PRAGMA integrity_check;" 2>&1)
  if [[ "$RESULT" == "ok" ]]; then
    success "Database integrity: ok"
  else
    warn "Integrity issues detected:"
    echo "$RESULT"
    echo ""
    warn "If the database is corrupt, run ./reset-db.sh to start fresh (data will be lost)."
  fi
fi

echo ""
echo -e "${GREEN}Done!${NC} Restart the backend to apply any changes."
echo ""
