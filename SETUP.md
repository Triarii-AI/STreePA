# STPA Tree Graph — Setup Guide

## Prerequisites
- Python 3.10+
- Node.js 18+
- MySQL 8.0+

## Database Setup

```sql
CREATE DATABASE stpa_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set your DATABASE_URL and SECRET_KEY

python app.py
```

The backend runs on http://localhost:5000.
Tables are created automatically on first run via SQLAlchemy.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on http://localhost:5173 and proxies API calls to the backend.

## Usage

1. Open http://localhost:5173
2. Register an account (click "Register" on the login page)
3. Create a new project from the dashboard
4. Use the canvas to add nodes layer by layer:
   - **+ Loss** (Layer 2) — add loss events
   - **+ Hazard** (Layer 3) — add hazards, optionally linked to losses
   - **+ Sys. Constraint** (Layer 4) — add system constraints linked to hazards
   - **+ Control Action** (Layer 5) — add control actions
   - **+ UCA** (Layer 6) — add unsafe control actions under a control action
   - **+ Loss Scenario** (Layer 7) — add loss scenarios under a UCA
5. Click any node to open its detail panel (edit, delete, manage links)
6. Draw edges between nodes by dragging from a handle to another node
7. Open the same project URL in another browser tab to test real-time collaboration
