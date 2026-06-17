#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "  STPA Tree Graph — Setup"
echo "  ========================"
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.10+."
PY_VER=$(python3 -c 'import sys; print(sys.version_info[:2])')
[[ "$PY_VER" < "(3, 10)" ]] && warn "Python 3.10+ recommended (found $(python3 --version))."
success "Python: $(python3 --version)"

command -v node >/dev/null 2>&1 || die "node not found. Install Node.js 18+."
success "Node:   $(node --version)"

command -v npm >/dev/null 2>&1 || die "npm not found."
success "npm:    $(npm --version)"

command -v mysql >/dev/null 2>&1 || die "mysql client not found. Install MySQL 8.0+."
success "MySQL:  $(mysql --version | head -1)"

# ── MySQL database ─────────────────────────────────────────────────────────────

echo ""
info "Setting up MySQL database..."

read -rp "  MySQL host   [localhost]: " DB_HOST;   DB_HOST="${DB_HOST:-localhost}"
read -rp "  MySQL port   [3306]:      " DB_PORT;   DB_PORT="${DB_PORT:-3306}"
read -rp "  MySQL user   [root]:      " DB_USER;   DB_USER="${DB_USER:-root}"
read -rsp "  MySQL password:           " DB_PASS;   echo ""
read -rp "  Database name [stpa_db]:  " DB_NAME;   DB_NAME="${DB_NAME:-stpa_db}"

MYSQL_CMD="mysql -h$DB_HOST -P$DB_PORT -u$DB_USER"
[[ -n "$DB_PASS" ]] && MYSQL_CMD="$MYSQL_CMD -p$DB_PASS"

$MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
  || die "Failed to create database. Check your MySQL credentials."
success "Database '$DB_NAME' ready."

DB_URL="mysql+pymysql://${DB_USER}${DB_PASS:+:$DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# ── Backend .env ───────────────────────────────────────────────────────────────

echo ""
info "Configuring backend .env..."

SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
ENV_FILE="$BACKEND/.env"

if [[ -f "$ENV_FILE" ]]; then
  warn ".env already exists — skipping (delete it to regenerate)."
else
  cat > "$ENV_FILE" <<EOF
SECRET_KEY=$SECRET_KEY
DATABASE_URL=$DB_URL
EOF
  success ".env written."
fi

# ── Python virtual environment ────────────────────────────────────────────────

echo ""
info "Setting up Python virtual environment..."

if [[ ! -d "$BACKEND/venv" ]]; then
  python3 -m venv "$BACKEND/venv"
  success "Virtual environment created."
else
  warn "venv already exists — skipping creation."
fi

source "$BACKEND/venv/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet -r "$BACKEND/requirements.txt"
success "Python dependencies installed."

# ── Frontend dependencies ──────────────────────────────────────────────────────

echo ""
info "Installing frontend dependencies..."
npm --prefix "$FRONTEND" install --silent
success "npm packages installed."

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "  To start the app, open two terminals:"
echo ""
echo -e "  ${CYAN}Terminal 1 — Backend:${NC}"
echo "    cd backend && source venv/bin/activate && python app.py"
echo ""
echo -e "  ${CYAN}Terminal 2 — Frontend:${NC}"
echo "    cd frontend && npm run dev"
echo ""
echo "  Then open http://localhost:5173"
echo ""
