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
echo "  STPA Tree Graph — Starting"
echo "  ==========================="
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

info "Starting backend..."
source "$BACKEND/venv/bin/activate"
cd "$BACKEND"
python app.py &
BACKEND_PID=$!
cd "$ROOT"
success "Backend running (PID $BACKEND_PID) → http://localhost:5000"

# ── Frontend ──────────────────────────────────────────────────────────────────

info "Starting frontend..."
cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!
cd "$ROOT"
success "Frontend running (PID $FRONTEND_PID) → http://localhost:5173"

# ── Ready ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}App is up!${NC} Open http://localhost:5173"
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop both servers."
echo ""

wait
