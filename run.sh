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

PROD=false
for arg in "$@"; do
  [[ "$arg" == "--prod" ]] && PROD=true
done

echo ""
if $PROD; then
  echo "  STPA Tree Graph — Production Mode"
else
  echo "  STPA Tree Graph — Development Mode"
fi
echo "  ==========================="
echo ""

# ── Preflight checks ──────────────────────────────────────────────────────────

[[ -f "$BACKEND/.env" ]] || die "backend/.env not found. Run ./setup.sh first."
[[ -d "$BACKEND/venv" ]] || die "Python venv not found. Run ./setup.sh first."
[[ -d "$FRONTEND/node_modules" ]] || die "node_modules not found. Run ./setup.sh first."

# ── Production: build frontend first ─────────────────────────────────────────

if $PROD; then
  info "Building frontend..."
  cd "$FRONTEND"
  npm run build
  cd "$ROOT"
  success "Frontend built → frontend/dist"
fi

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

# Kill any leftover process on port 5000 (stale Flask child from previous run)
STALE_PID=$(lsof -t -i:5000 2>/dev/null || true)
if [[ -n "$STALE_PID" ]]; then
  warn "Killing stale process on port 5000 (PID $STALE_PID)..."
  kill "$STALE_PID" 2>/dev/null || true
  sleep 0.5
fi

info "Starting backend..."
source "$BACKEND/venv/bin/activate"
cd "$BACKEND"
python app.py &
BACKEND_PID=$!
cd "$ROOT"
success "Backend running (PID $BACKEND_PID) → http://localhost:5000"

# ── Frontend (dev only) ───────────────────────────────────────────────────────

if ! $PROD; then
  info "Starting frontend..."
  cd "$FRONTEND"
  npm run dev &
  FRONTEND_PID=$!
  cd "$ROOT"
  success "Frontend running (PID $FRONTEND_PID) → http://localhost:5173"
fi

# ── Ready ─────────────────────────────────────────────────────────────────────

echo ""
if $PROD; then
  echo -e "  ${GREEN}App is up!${NC} Open http://localhost:5000"
  echo -e "  Point your Cloudflare tunnel at ${YELLOW}port 5000${NC}."
else
  echo -e "  ${GREEN}App is up!${NC} Open http://localhost:5173"
  echo -e "  For tunnel hosting, use ${YELLOW}./run.sh --prod${NC} instead."
fi
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop."
echo ""

wait
