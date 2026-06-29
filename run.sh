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

# ── Port configuration ────────────────────────────────────────────────────────
BACKEND_PORT=5000
FRONTEND_PORT=5173

echo ""
echo "  STreePA — STPA Tree Planning Application"
echo "  ========================================="
echo ""

# ── Preflight checks ──────────────────────────────────────────────────────────

[[ -f "$BACKEND/.env" ]] || die "backend/.env not found. Run ./setup.sh first."
[[ -d "$BACKEND/venv" ]] || die "Python venv not found. Run ./setup.sh first."
[[ -d "$FRONTEND/node_modules" ]] || die "node_modules not found. Run ./setup.sh first."

# ── Cleanup on exit ───────────────────────────────────────────────────────────

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  info "Shutting down..."
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null && info "Backend stopped."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null && info "Frontend stopped."
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Backend ───────────────────────────────────────────────────────────────────

# Kill any leftover process on the backend port (stale Flask child from previous run)
STALE_PID=$(lsof -t -i:"$BACKEND_PORT" 2>/dev/null || true)
if [[ -n "$STALE_PID" ]]; then
  warn "Killing stale process on port $BACKEND_PORT (PID $STALE_PID)..."
  kill "$STALE_PID" 2>/dev/null || true
  sleep 0.5
fi

info "Starting backend..."
source "$BACKEND/venv/bin/activate"
cd "$BACKEND"
FLASK_RUN_PORT="$BACKEND_PORT" python app.py &
BACKEND_PID=$!
cd "$ROOT"
success "Backend running (PID $BACKEND_PID) → http://localhost:$BACKEND_PORT"

# ── Frontend ──────────────────────────────────────────────────────────────────

info "Starting frontend..."
cd "$FRONTEND"
npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
cd "$ROOT"
success "Frontend running (PID $FRONTEND_PID) → http://localhost:$FRONTEND_PORT"

# ── Ready ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}App is up!${NC} Open ${CYAN}http://localhost:$FRONTEND_PORT${NC}"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop."
echo ""

wait
