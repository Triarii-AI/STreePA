# STreePA — STPA Tree Planning Application

A web-based collaborative tool for building and visualizing **STPA (System-Theoretic Process Analysis)** models as interactive, hierarchical trees. STreePA guides you through all seven layers of an STPA analysis — from top-level losses down to loss scenarios — with real-time multi-user collaboration, live editing, and high-fidelity export.

---

## Table of Contents

- [What is STPA?](#what-is-stpa)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the App](#running-the-app)
- [First-Time Usage](#first-time-usage)
- [The Seven-Layer Tree](#the-seven-layer-tree)
- [Canvas & Interaction](#canvas--interaction)
- [Exporting](#exporting)
- [Real-Time Collaboration](#real-time-collaboration)
- [Database Utilities](#database-utilities)
- [Project Structure](#project-structure)

---

## What is STPA?

STPA is a systems safety analysis technique based on Systems-Theoretic Accident Model and Processes (STAMP). Unlike traditional failure-based techniques, STPA identifies unsafe control actions and the scenarios that lead to them. An analysis proceeds through seven layers:

1. **Purpose Statement** — the system mission and scope
2. **Losses (Ls)** — unacceptable outcomes (e.g. injury, mission failure)
3. **Hazards (Hs)** — system states that, with worst-case conditions, lead to a loss
4. **System Constraints (SCs)** — safety constraints that prevent hazards
5. **Control Actions (Rs)** — actions a controller can take
6. **Unsafe Control Actions (UCAs)** — conditions under which a control action is unsafe
7. **Loss Scenarios (LSs)** — causal sequences explaining how a UCA occurs

STreePA models all seven layers as connected nodes on a live canvas, preserving the relationships between them.

---

## Features

- **Interactive canvas** — pan, zoom, and freely drag nodes on an infinite canvas powered by React Flow
- **Seven-layer STPA tree** — structured node types with auto-generated labels (`L-1`, `H-2.1`, `UCA-1.3`, `LS-1.3.2`, …)
- **Two edge types** — solid arrows for parent-child hierarchy, dashed arrows for cross-layer references
- **Sub-hazards** — hazards can have child hazards, collapsible to reduce visual clutter
- **Node grouping** — group nodes into labeled, resizable containers
- **Real-time collaboration** — all canvas changes sync instantly to every connected user via WebSocket
- **Presence indicators** — see which teammates are currently viewing a project
- **Project sharing** — share projects with other users on the instance
- **Dark mode** — per-user preference, persisted across sessions
- **Collapsible sidebar** — lists all nodes by layer for quick navigation
- **Export to SVG** — true vector export, scalable and editable
- **Export to PNG** — pixel-accurate render via headless Chromium, with cross-reference edges composited server-side
- **Automatic backups** — timestamped SQLite snapshots stored in `backend/backups/`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+ / Flask |
| Real-time | Flask-SocketIO + eventlet |
| Database | SQLite (via Flask-SQLAlchemy) |
| Auth | Flask-Login (session-based) |
| Frontend | React 18 + Vite |
| Canvas | React Flow (@xyflow/react) |
| State | Zustand |
| Styling | Tailwind CSS |

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.10+ | Required |
| Node.js | 18+ | Required — `setup.sh` will install it if missing |
| npm | any | Comes with Node.js |

---

## Setup

Run the setup script once from the project root:

```bash
./setup.sh
```

This does everything automatically:

1. Checks for Python 3.10+ and Node.js 18+ (installs Node via nvm, apt, pacman, or dnf if missing)
2. Creates `backend/.env` with a randomly generated `SECRET_KEY` and `DATABASE_URL=sqlite:///stpa.db`
3. Creates a Python virtual environment at `backend/venv/` and installs all Python dependencies
4. Runs `npm install` in `frontend/`

The script is safe to re-run — it skips steps that are already complete.

The SQLite database is created automatically at `backend/instance/stpa.db` on first launch.

---

## Running the App

```bash
./run.sh
```

Starts two processes:

- **Flask backend** on `http://localhost:5000`
- **Vite dev server** on `http://localhost:5173`

Open **`http://localhost:5173`** in your browser. The Vite dev server proxies API and WebSocket traffic to Flask automatically.

Press `Ctrl+C` to stop both processes cleanly.

### Changing Ports

The ports are defined at the top of `run.sh`:

```bash
BACKEND_PORT=5000
FRONTEND_PORT=5173
```

Edit those two lines to use any ports you need.

---

## First-Time Usage

1. Open the app URL in your browser
2. Click **Register** to create an account (username + password)
3. You will be redirected to the **Dashboard** after registering
4. Click **New Project** and enter a project title and purpose statement
5. The canvas opens with your root Purpose Statement node already placed
6. Start building your tree — see [The Seven-Layer Tree](#the-seven-layer-tree) below

---

## The Seven-Layer Tree

Each layer has its own node type, color, and label format. Nodes at lower layers reference nodes at higher layers, creating the cross-layer traceability that makes STPA powerful.

### Layer 1 — Purpose Statement (Root)

- One node per project, auto-created when the project is made
- Displays the project title and purpose statement
- All Loss nodes connect upward to this node with solid arrows

### Layer 2 — Losses `L-1, L-2, …`

- Represent unacceptable outcomes the system must avoid
- Click **+ Loss** on the canvas to add one
- Automatically connected to the root with solid arrows

### Layer 3 — Hazards `H-1, H-2, …` and Sub-hazards `H-2.1, H-2.2, …`

- Represent hazardous system states
- Each hazard links to one or more Losses (dashed arrows)
- Hazards can have **sub-hazards** — click the expand/collapse toggle on a hazard node to show or hide them
- Sub-hazards are labeled with their parent's number (e.g., `H-2.1` is the first sub-hazard of `H-2`)

### Layer 4 — System Constraints `SC-1, SC-1.1, …`

- Safety constraints that prevent hazards from being reached
- Each constraint links to one or more Hazards

### Layer 5 — Control Actions `CA-1, CA-2, …`

- Actions a controller can issue to the system
- Displayed as their own layer; parent nodes for UCAs below

### Layer 6 — Unsafe Control Actions `UCA-1.1, UCA-1.2, …`

- Conditions under which a control action is unsafe
- Each UCA belongs to exactly one Control Action and links to one or more Hazards
- Label format: `UCA-<CA number>.<UCA index within that CA>`
- Each UCA carries one of four **type tags** (color-coded):

| Type | Meaning |
|---|---|
| Not Providing | The control action is not issued when it should be |
| Providing Causes Hazard | Issuing it causes a hazard |
| Wrong Timing / Order | Issued at the wrong time or out of sequence |
| Duration Issue | Lasts too long or stops too soon |

### Layer 7 — Loss Scenarios `LS-1.2.1, LS-1.2.3, …`

- Causal sequences explaining *why* a UCA occurs
- Each scenario belongs to exactly one UCA and links to one or more Hazards
- Label format: `LS-<CA number>.<UCA number>.<LS index within that UCA>`

---

## Canvas & Interaction

### Navigating

- **Pan** — click and drag on empty canvas space
- **Zoom** — scroll wheel, or use the zoom controls in the toolbar
- **Fit to screen** — click the fit button in the toolbar to frame all nodes

### Editing Nodes

- **Click** any node to open its detail panel on the right
- Edit the label, description, linked nodes, or UCA type from the panel
- Changes save immediately and sync to all connected collaborators

### Moving Nodes

- **Drag** any node to reposition it
- Positions are saved to the database automatically

### Adding Nodes

Each layer has a **+ Add [type]** button visible near that layer on the canvas. Clicking it opens a small inline form — fill in the description and submit. The label is auto-generated. The new node appears on the canvas immediately, no page reload needed.

### Edges

- **Solid arrows** are auto-generated from parent-child relationships and cannot be manually deleted
- **Dashed arrows** are auto-generated from cross-layer links (e.g., Hazard → Loss) and disappear when the link is removed via the node panel
- You can also **manually draw** a dashed arrow between any two nodes: click the source node's edge handle and drag to the target
- To delete a manual dashed arrow: click it to select it, then press `Delete`, or right-click for a context menu

### Collapse / Expand

- Any node with children shows a toggle to collapse its subtree
- Collapsed nodes display a count badge (e.g., "3 hidden")
- Sub-hazards collapse into their parent hazard node

### Sidebar

The collapsible left sidebar lists all nodes organized by layer. Click any entry to pan the canvas to that node. Use it as a quick-navigation index on large projects.

### Groups

Nodes can be placed inside labeled group containers for visual organization. Groups can be nested and resized.

---

## Exporting

Click the **camera icon** in the toolbar to export the current project.

### PNG Export

Downloads a pixel-accurate PNG rendered by **headless Chromium**. This captures the exact visual state of the canvas including fonts, shadows, and node layout. Cross-reference (dashed) edges are composited onto the Chromium screenshot server-side via Pillow to avoid memory issues on large projects.

If Chromium is unavailable, the backend falls back to a `cairosvg`-based render.

Both export formats respect the current **dark/light theme** and honor any **collapsed/hidden** nodes.

---

## Real-Time Collaboration

STreePA uses **Flask-SocketIO** for WebSocket-based collaboration. Every canvas mutation — adding a node, editing a node, moving a node, drawing or deleting an edge — is immediately broadcast to all other users viewing the same project.

**How it works:**

1. You make a change (e.g., add a Loss node)
2. Your browser sends a SocketIO event to the server
3. The server writes the change to SQLite
4. The server broadcasts the event to everyone else in the project's room
5. Their canvases update in real time — no page refresh needed

The toolbar shows avatar icons for each user currently viewing the project.

Conflict resolution is last-write-wins.

---

## Database Utilities

### Repair (non-destructive)

If the schema has drifted — for example after pulling an update that added new tables — run:

```bash
./repair-db.sh
```

This runs `db.create_all()` against the existing database, creating any missing tables without touching existing data. Also runs a SQLite `PRAGMA integrity_check`.

### Reset (destructive)

To wipe all data and start from a clean schema:

```bash
./reset-db.sh
```

You will be prompted to type `yes` to confirm. This deletes `backend/instance/stpa.db` and recreates an empty schema. **All projects and users will be lost.**

---

## Project Structure

```
STreePA/
├── backend/
│   ├── app.py               # Flask app factory and frontend serving
│   ├── config.py            # Config loaded from .env
│   ├── extensions.py        # db, socketio, login_manager instances
│   ├── models.py            # SQLAlchemy models (all 7 node types + edges/groups)
│   ├── events.py            # SocketIO event handlers
│   ├── screenshot_worker.py # Headless Chromium PNG worker
│   ├── routes/
│   │   ├── auth.py          # Register, login, logout
│   │   ├── projects.py      # Project CRUD and sharing
│   │   ├── api.py           # Node CRUD for all 7 layers
│   │   ├── export.py        # SVG and PNG export
│   │   ├── backups.py       # Backup management
│   │   └── groups.py        # Node group CRUD
│   ├── instance/
│   │   └── stpa.db          # SQLite database (auto-created)
│   ├── backups/             # Timestamped database snapshots
│   ├── requirements.txt
│   └── .env                 # Generated by setup.sh (not committed)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router and top-level layout
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── ProjectCanvas.jsx
│   │   ├── components/
│   │   │   ├── nodes/       # React Flow node components per layer
│   │   │   ├── edges/       # Floating edge component
│   │   │   ├── forms/       # Add-node inline forms
│   │   │   ├── NodePanel.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── Toolbar.jsx
│   │   ├── store/           # Zustand state stores
│   │   ├── api.js           # REST API client
│   │   └── socket.js        # SocketIO client setup
│   └── package.json
├── setup.sh                 # One-time install script
├── run.sh                   # Start backend and frontend dev servers
├── repair-db.sh             # Non-destructive schema sync
└── reset-db.sh              # Wipe and recreate database
```
