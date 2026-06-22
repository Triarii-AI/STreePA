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

TUNNEL=false
for arg in "$@"; do
  [[ "$arg" == "--tunnel" ]] && TUNNEL=true
done

echo ""
if $TUNNEL; then
  echo "  STPA Tree Graph — Tunnel Mode"
else
  echo "  STPA Tree Graph — Development Mode"
fi
echo "  ==========================="
echo ""

# ── Preflight checks ──────────────────────────────────────────────────────────

[[ -f "$BACKEND/.env" ]] || die "backend/.env not found. Run ./setup.sh first."
[[ -d "$BACKEND/venv" ]] || die "Python venv not found. Run ./setup.sh first."
[[ -d "$FRONTEND/node_modules" ]] || die "node_modules not found. Run ./setup.sh first."

if $TUNNEL; then
  command -v cloudflared >/dev/null 2>&1 || die "cloudflared not found.\nInstall: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
fi

# ── Tunnel mode: build frontend first ────────────────────────────────────────

if $TUNNEL; then
  info "Building frontend..."
  cd "$FRONTEND"
  npm run build
  cd "$ROOT"
  success "Frontend built → frontend/dist"
fi

# ── Cleanup on exit ───────────────────────────────────────────────────────────

BACKEND_PID=""
FRONTEND_PID=""
TUNNEL_PID=""
TUNNEL_TAIL_PID=""
TUNNEL_LOG=""

cleanup() {
  echo ""
  info "Shutting down..."
  [[ -n "$TUNNEL_TAIL_PID" ]] && kill "$TUNNEL_TAIL_PID" 2>/dev/null; true
  [[ -n "$TUNNEL_PID" ]]      && kill "$TUNNEL_PID"      2>/dev/null && info "Tunnel stopped."
  [[ -n "$BACKEND_PID" ]]     && kill "$BACKEND_PID"     2>/dev/null && info "Backend stopped."
  [[ -n "$FRONTEND_PID" ]]    && kill "$FRONTEND_PID"    2>/dev/null && info "Frontend stopped."
  [[ -n "$TUNNEL_LOG" ]]      && rm -f "$TUNNEL_LOG"
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

if ! $TUNNEL; then
  info "Starting frontend..."
  cd "$FRONTEND"
  npm run dev &
  FRONTEND_PID=$!
  cd "$ROOT"
  success "Frontend running (PID $FRONTEND_PID) → http://localhost:5173"
fi

# ── Cloudflare tunnel ─────────────────────────────────────────────────────────

if $TUNNEL; then
  TUNNEL_LOG=$(mktemp /tmp/cloudflared-XXXXXX.log)
  info "Starting Cloudflare tunnel..."

  cloudflared tunnel --url http://localhost:5000 >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  # Stream tunnel output live while we wait for the URL
  tail -f "$TUNNEL_LOG" 2>/dev/null &
  TUNNEL_TAIL_PID=$!

  # Poll up to 20 s for the public URL
  TUNNEL_URL=""
  for i in $(seq 1 40); do
    TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
    [[ -n "$TUNNEL_URL" ]] && break
    sleep 0.5
  done

  # Stop the tail now that we have the URL
  kill "$TUNNEL_TAIL_PID" 2>/dev/null || true
  TUNNEL_TAIL_PID=""
  sleep 0.1  # let any buffered tail lines flush

  echo ""
  if [[ -n "$TUNNEL_URL" ]]; then
    echo -e "  ${GREEN}Tunnel URL:${NC} ${CYAN}${TUNNEL_URL}${NC}"
  else
    warn "Tunnel started but URL not detected yet — check $TUNNEL_LOG"
  fi
fi

# ── Ready ─────────────────────────────────────────────────────────────────────

echo ""
if $TUNNEL; then
  echo -e "  ${GREEN}App is up!${NC} Serving on ${CYAN}${TUNNEL_URL:-http://localhost:5000}${NC}"
else
  echo -e "  ${GREEN}App is up!${NC} Open http://localhost:5173"
  echo -e "  For tunnel hosting, use ${YELLOW}./run.sh --tunnel${NC} instead."
fi
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop."
echo ""

wait
