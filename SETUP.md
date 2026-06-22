# STPA Tree Graph — Setup Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.10+ | |
| Node.js | 18+ | |
| cloudflared | any | Optional — only needed for `./run.sh --tunnel` |

## Quick start

```bash
./setup.sh
./run.sh
```

`setup.sh` handles everything: creates the Python venv, installs backend and frontend
dependencies, and writes a `.env` with a random secret key. It is safe to re-run — it
skips steps that are already done.

## What setup.sh does

1. Checks/installs Python 3 and Node.js
2. Detects `cloudflared` (optional, warns if missing)
3. Creates `backend/.env` with a generated `SECRET_KEY` and `DATABASE_URL=sqlite:///stpa.db`
4. Creates `backend/venv` and installs Python packages
5. Runs `npm install` in `frontend/`

The SQLite database (`backend/stpa.db`) is created automatically on first run.

## Running the app

### Development mode

```bash
./run.sh
```

Starts the Flask backend on **http://localhost:5000** and the Vite dev server on
**http://localhost:5173**. Open the Vite URL in your browser.

### Tunnel mode (Cloudflare Quick Tunnel)

```bash
./run.sh --tunnel
```

Builds the frontend, serves it from Flask on port 5000, and starts a Cloudflare Quick
Tunnel. The public `trycloudflare.com` URL is printed in the terminal once the tunnel
is ready. No Cloudflare account required.

Install `cloudflared` if you haven't:

```bash
# Debian / Kali / Ubuntu
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

## First-time usage

1. Open the app URL
2. Click **Register** on the login page to create an account
3. Create a new project from the dashboard
4. Add nodes layer by layer using the **+ Loss / + Hazard / …** buttons on the canvas
5. Click any node to open its detail panel (edit, delete, manage links)

## Database utilities

```bash
./reset-db.sh    # drop and recreate all tables (wipes all data)
./repair-db.sh   # run ALTER TABLE migrations on an existing DB
```
