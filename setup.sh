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
echo "  STreePA — STPA Tree Planning Application — Setup"
echo "  ================================================="
echo ""

# ── Prerequisites ─────────────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.10+."
PY_VER=$(python3 -c 'import sys; print(sys.version_info[:2])')
[[ "$PY_VER" < "(3, 10)" ]] && warn "Python 3.10+ recommended (found $(python3 --version))."
success "Python: $(python3 --version)"

if ! command -v node >/dev/null 2>&1; then
  info "Node.js not found — installing..."

  if command -v nvm >/dev/null 2>&1 || [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    [[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
    nvm install --lts
    nvm use --lts
    success "Node installed via nvm: $(node --version)"

  elif command -v apt-get >/dev/null 2>&1; then
    info "Installing Node.js LTS via NodeSource (requires sudo)..."
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
    success "Node installed via apt: $(node --version)"

  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm nodejs npm
    success "Node installed via pacman: $(node --version)"

  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs npm
    success "Node installed via dnf: $(node --version)"

  else
    die "Cannot install Node.js automatically. Please install Node.js 18+ manually from https://nodejs.org and re-run this script."
  fi
else
  success "Node:   $(node --version)"
fi

command -v npm >/dev/null 2>&1 || die "npm not found after Node install — something went wrong."
success "npm:    $(npm --version)"

# ── Python virtual environment ────────────────────────────────────────────────

echo ""
info "Setting up Python virtual environment..."

VENV_DIR="$BACKEND/venv"

if [[ ! -d "$VENV_DIR" ]]; then
  info "No venv found at backend/venv — creating one..."
  python3 -m venv "$VENV_DIR"
  success "Virtual environment created at backend/venv"
else
  success "Virtual environment already exists at backend/venv"
fi

info "Activating venv and installing Python dependencies..."
source "$VENV_DIR/bin/activate"
pip install --quiet --upgrade pip
pip install --quiet -r "$BACKEND/requirements.txt"
success "Python dependencies installed ($(pip list 2>/dev/null | wc -l | tr -d ' ') packages)."

# ── Frontend dependencies ──────────────────────────────────────────────────────

echo ""
info "Installing frontend dependencies..."
npm --prefix "$FRONTEND" install --silent
success "npm packages installed."

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo -e "  Start: ${CYAN}./run.sh${NC}"
echo -e "  To change ports, edit ${CYAN}BACKEND_PORT${NC} and ${CYAN}FRONTEND_PORT${NC} at the top of run.sh"
echo ""
