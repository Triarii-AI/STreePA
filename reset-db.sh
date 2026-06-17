#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/backend/.env"

[[ -f "$ENV_FILE" ]] || die "No .env file found at backend/.env. Run setup.sh first."

# Parse DATABASE_URL from .env
DB_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
[[ -n "$DB_URL" ]] || die "DATABASE_URL not found in .env"

# Extract components: mysql+pymysql://user:pass@host:port/dbname
CREDENTIALS="${DB_URL#mysql+pymysql://}"
USERPASS="${CREDENTIALS%%@*}"
HOSTDB="${CREDENTIALS#*@}"
DB_USER="${USERPASS%%:*}"
DB_PASS="${USERPASS#*:}"
HOSTPORT="${HOSTDB%%/*}"
DB_NAME="${HOSTDB#*/}"
DB_HOST="${HOSTPORT%%:*}"
DB_PORT="${HOSTPORT##*:}"

echo ""
echo "  STPA Tree Graph — Database Reset"
echo "  ================================="
echo ""
warn "This will permanently delete ALL data in database '${DB_NAME}'."
warn "Users, projects, nodes, edges — everything."
echo ""
read -rp "  Type 'yes' to confirm: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { info "Aborted."; exit 0; }
echo ""

MYSQL_CMD="mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASS}"

info "Connecting to MySQL at ${DB_HOST}:${DB_PORT}..."
$MYSQL_CMD -e "SELECT 1;" >/dev/null 2>&1 || die "Cannot connect to MySQL. Is the server running?"

info "Clearing all data..."

$MYSQL_CMD "$DB_NAME" <<'SQL'
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE hazard_loss_links;
TRUNCATE TABLE uca_hazard_links;
TRUNCATE TABLE ls_hazard_links;
TRUNCATE TABLE canvas_edges;
TRUNCATE TABLE loss_scenarios;
TRUNCATE TABLE ucas;
TRUNCATE TABLE control_actions;
TRUNCATE TABLE system_constraints;
TRUNCATE TABLE hazards;
TRUNCATE TABLE losses;
TRUNCATE TABLE projects;
TRUNCATE TABLE users;

SET FOREIGN_KEY_CHECKS = 1;
SQL

success "All data erased. Database '${DB_NAME}' is now empty."
echo ""
