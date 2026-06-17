#!/usr/bin/env bash
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
die() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT/backend/.env"

echo ""
echo "  STPA Tree Graph — DB Repair"
echo "  ============================"
echo ""

[[ -f "$ENV_FILE" ]] || die ".env not found at backend/.env — run ./setup.sh first."

# Parse DATABASE_URL: mysql+pymysql://user:pass@host:port/dbname
DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
[[ -n "$DATABASE_URL" ]] || die "DATABASE_URL not found in .env"

# Strip the driver prefix
CONN="${DATABASE_URL#*://}"           # user:pass@host:port/dbname
APP_USER="${CONN%%:*}"                # user
CONN="${CONN#*:}"                     # pass@host:port/dbname
APP_PASS="${CONN%%@*}"                # pass
CONN="${CONN#*@}"                     # host:port/dbname
HOST="${CONN%%/*}"                    # host:port
HOST="${HOST%%:*}"                    # host (strip port)
DB_NAME="${CONN##*/}"                 # dbname

info "Parsed credentials from .env:"
echo "    User:     $APP_USER"
echo "    Host:     $HOST"
echo "    Database: $DB_NAME"
echo ""

info "Ensuring MySQL is running..."
if ! sudo service mysql status >/dev/null 2>&1; then
  sudo service mysql start || die "Failed to start MySQL."
  success "MySQL started."
else
  success "MySQL is running."
fi

info "Recreating MySQL user '${APP_USER}'..."

# Create for both 127.0.0.1 and localhost so socket and TCP both work
sudo mysql <<SQL
DROP USER IF EXISTS '${APP_USER}'@'localhost';
DROP USER IF EXISTS '${APP_USER}'@'127.0.0.1';
CREATE USER '${APP_USER}'@'localhost' IDENTIFIED BY '${APP_PASS}';
CREATE USER '${APP_USER}'@'127.0.0.1' IDENTIFIED BY '${APP_PASS}';
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${APP_USER}'@'localhost';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${APP_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

success "User '${APP_USER}' recreated with access to '${DB_NAME}'."
echo ""
echo -e "${GREEN}Done!${NC} Restart the backend and it should connect."
echo ""
