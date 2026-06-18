#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="$ROOT/backend/instance/stpa.db"

echo ""
echo "  STPA Tree Graph — Database Reset"
echo "  ================================="
echo ""
warn "This will permanently delete ALL data (users, projects, nodes, edges)."
echo ""
read -rp "  Type 'yes' to confirm: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { info "Aborted."; exit 0; }
echo ""

if [[ -f "$DB_FILE" ]]; then
  rm "$DB_FILE"
  info "Deleted $DB_FILE"
else
  info "No database file found at $DB_FILE — nothing to delete."
fi

# Recreate tables by starting the backend briefly
VENV="$ROOT/backend/venv"
[[ -d "$VENV" ]] || die "Python venv not found at backend/venv. Run ./setup.sh first."

source "$VENV/bin/activate"
cd "$ROOT/backend"
python3 -c "from app import create_app; create_app()"

success "Database reset. Fresh schema created at backend/stpa.db."
echo ""
