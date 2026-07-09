# STreePA — STPA Tree Planning Application

A web-based collaborative tool for building and visualizing **STPA (System-Theoretic Process Analysis)** models as interactive, hierarchical trees. STreePA guides you through all eight layers of an STPA analysis — from top-level losses down to loss scenarios — with real-time multi-user collaboration, live editing, and high-fidelity export.

---

## Table of Contents

- [What is STPA?](#what-is-stpa)
- [Features](#features)
- [Specifications](#specifications)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the App](#running-the-app)
- [First-Time Usage](#first-time-usage)
- [The Eight-Layer Tree](#the-eight-layer-tree)
- [Canvas & Interaction](#canvas--interaction)
- [Exporting](#exporting)
- [Real-Time Collaboration](#real-time-collaboration)
- [Database Utilities](#database-utilities)
- [Project Structure](#project-structure)

---

## What is STPA?

STPA is a systems safety analysis technique based on Systems-Theoretic Accident Model and Processes (STAMP). Unlike traditional failure-based techniques, STPA identifies unsafe control actions and the scenarios that lead to them. An analysis proceeds through eight layers:

1. **Purpose Statement** — the system mission and scope
2. **Losses (Ls)** — unacceptable outcomes (e.g. injury, mission failure)
3. **Hazards (Hs)** — system states that, with worst-case conditions, lead to a loss
4. **System Constraints (SCs)** — safety constraints that prevent hazards
5. **Control Actions (Rs)** — actions a controller can take
6. **Unsafe Control Actions (UCAs)** — conditions under which a control action is unsafe
7. **Controller Constraints (CCs)** — constraints on the controller's behavior, mirroring System Constraints one layer up
8. **Loss Scenarios (LSs)** — causal sequences explaining how a UCA occurs

STreePA models all eight layers as connected nodes on a live canvas, preserving the relationships between them.

---

## Features

- **Interactive canvas** — pan, zoom, and freely drag nodes on an infinite canvas powered by React Flow
- **Eight-layer STPA tree** — structured node types with auto-generated labels (`L-1`, `H-2.1`, `UCA-1.3`, `LS-1.3.2`, …)
- **Two edge types** — solid arrows for parent-child hierarchy, dashed arrows for cross-layer references
- **Sub-hazards and sub-losses** — hazards and losses can each have child nodes, collapsible to reduce visual clutter
- **Controller Constraints** — a child node type under UCAs (mirrors System Constraints) for constraining the controller's behavior
- **Controller field on Control Actions** — optionally tag a Control Action with the controller that issues it; the value is inherited and displayed on its UCAs, Controller Constraints, and Loss Scenarios, and propagates live if changed
- **Node grouping** — group nodes into labeled, resizable containers that nest, auto-dissolve when down to one member, and move/align/distribute as a unit
- **Multi-node copy/paste** — select multiple nodes (and groups) and Ctrl+C/Ctrl+V to duplicate them together in one shot, preserving fields, links, internal parent-child structure, and group membership
- **Node reparenting** — change a node's structural parent from its detail panel; edges and labels update live for all collaborators and support undo/redo
- **Bulk relabeling** — auto-label selected nodes as if freshly created, dropping into the lowest free numbering gap left by deletions, or shift their label numbers en masse with +1/−1, with full undo/redo
- **Real-time collaboration** — all canvas changes sync instantly to every connected user via WebSocket, including group operations
- **Presence indicators** — see which teammates are currently viewing a project
- **Project sharing** — share projects with other users on the instance
- **Dark mode** — per-user preference, persisted across sessions
- **Collapsible sidebar** — lists all nodes by layer for quick navigation
- **Scales to large models** — smooth interaction at 1,000–2,000 nodes; on large projects, cross-reference arrows pause during drags and pans to hold full frame rate
- **Export to SVG** — true vector export, scalable and editable
- **Export to PNG** — pixel-accurate render via headless Chromium, with cross-reference edges composited server-side
- **Automatic backups** — timestamped SQLite snapshots stored in `backend/backups/`, including canvas groups on JSON export/import

---

## Specifications

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
2. Creates a Python virtual environment at `backend/venv/` and installs all Python dependencies
3. Runs `npm install` in `frontend/`

The script is safe to re-run — it skips steps that are already complete.

The SQLite database is created automatically at `backend/instance/stpa.db` on first launch. A secret key for session signing is auto-generated and saved to `backend/.secret_key` on first run — this file is gitignored and stays local to your machine.

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

### Exposing on Your Network

To make the frontend reachable from other devices on your LAN, pass `--host` with the machine's IP address:

```bash
./run.sh --host 192.168.1.50
```

---

## First-Time Usage

1. Open the app URL in your browser
2. Click **Register** to create an account (username + password)
3. You will be redirected to the **Dashboard** after registering
4. Click **New Project** and enter a project title and purpose statement
5. The canvas opens with your root Purpose Statement node already placed
6. Start building your tree — see [The Eight-Layer Tree](#the-eight-layer-tree) below

---

## The Eight-Layer Tree

Each layer has its own node type, color, and label format. Nodes at lower layers reference nodes at higher layers, creating the cross-layer traceability that makes STPA powerful.

### Layer 1 — Purpose Statement (Root)

- One node per project, auto-created when the project is made
- Displays the project title and purpose statement
- All Loss nodes connect upward to this node with solid arrows

### Layer 2 — Losses `L-1, L-2, …` and Sub-losses `L-1.1, L-1.2, …`

- Represent unacceptable outcomes the system must avoid
- Click **+ Loss** on the canvas to add one
- Automatically connected to the root with solid arrows
- Losses can have **sub-losses** — a loss can be assigned a parent loss via the panel, labeled with the parent's number (e.g., `L-1.1` is the first sub-loss of `L-1`)

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
- Optional **Controller** field identifies who/what issues the action; this value is inherited and shown on the Control Action's UCAs, Controller Constraints, and Loss Scenarios, and updates live everywhere it's used if changed

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

### Layer 7 — Controller Constraints `CC-1.1, CC-1.2, …` (labeled after their parent UCA)

- Constraints on the controller's behavior, mirroring System Constraints one layer up
- Each Controller Constraint belongs to a UCA and can additionally link to other UCAs
- Label format: `CC-<UCA number>`, inherits the Controller value from its parent UCA's Control Action

### Layer 8 — Loss Scenarios `LS-1.2.1, LS-1.2.3, …`

- Causal sequences explaining *why* a UCA occurs
- Each scenario belongs to exactly one UCA and links to one or more Hazards
- Label format: `LS-<CA number>.<UCA number>.<LS index within that UCA>`
- Each Loss Scenario carries one of two **type tags** (color-coded):

| Type | Question |
|---|---|
| UCA Occurrence | Why would Unsafe Control Actions occur? |
| Improper Execution | Why would control actions be improperly executed or not executed, leading to hazards? |

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

Each layer has a **+ Add [type]** button visible near that layer on the canvas. Clicking it opens a small inline form — fill in the description and submit. The label is auto-generated — it fills the lowest available gap in the numbering left by a prior deletion (e.g. `L-1, L-2, L-4` → next new Loss is `L-3`) rather than always appending after the highest number in use. The new node appears on the canvas immediately, no page reload needed, and becomes the current selection.

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

Nodes can be placed inside labeled group containers for visual organization. Select nodes and press **Ctrl+G** to group them (grouping a group with other nodes/groups nests it inside a new parent group), or **Ctrl+Shift+G** to ungroup. Groups can be nested and resized, move as a single unit when dragged or aligned/distributed, and automatically dissolve when only one member remains. Group operations sync live to all collaborators.

### Relabeling

When one or more nodes are selected, a toolbar appears with three relabeling actions:

- **Auto-label** — relabels the selected node(s) as if they had just been created. Siblings of the same type sharing the same parent are renumbered together in their existing relative order, dodging whatever numbers are already in use by their non-selected siblings — so it correctly drops into the lowest free gap (e.g. with `L-1, L-2, L-4, L-5`, auto-labeling just `L-5` gives `L-3`, not `L-4`) rather than naively appending after however many other siblings there are.
- **+1 / −1** — increments or decrements the selected node(s)' own label number directly, independent of siblings. This is a manual override with no collision checking, so it can create a duplicate label if the target number is already taken.

Both actions cascade to any descendants whose labels are derived from the relabeled node (e.g. relabeling a Hazard also updates its System Constraint and sub-hazards), and fully support undo/redo. If a group is selected, the toolbar (and these actions) apply to its contents rather than the group itself — the toolbar hides these three buttons when only group(s) with no labelable contents are selected.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Click a node | Select only that node, replacing any existing selection |
| Drag on empty canvas | Select (multiple nodes) |
| Shift+click | Add to / toggle a node in the selection |
| Space+drag | Pan |
| Del / Backspace | Delete |
| Ctrl+C / Ctrl+V | Copy / paste — supports multiple nodes and groups at once (a copied group is recreated with its members intact); the pasted result becomes the new selection |
| Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) | Undo / redo |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |

Whenever 2 or more nodes are selected — however the selection was built — a dashed bounding box is drawn around all of them as a visual aid; it's purely visual and never intercepts clicks.

A reference card for these is also available in-app via the shortcuts guide toggle on the canvas.

### Performance on Large Projects

The canvas is tuned to stay smooth into the 1,000–2,000 node range: only the node being dragged re-renders during a drag, off-screen nodes and edges aren't rendered at all, and the sidebar and detail panel ignore position-only changes.

Cross-reference (dashed) arrows are hidden by default; the dashed-arrow toggle in the bottom-right corner shows them all, and selecting a node always shows that node's own cross-references. Painting many dashed arrows is expensive, so on large projects (300 or more cross-reference edges) they are temporarily hidden while you drag a node or pan/zoom with the toggle on, reappearing the moment the interaction ends. Smaller projects keep them visible throughout.

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
│   ├── config.py            # App configuration (env-variable overrides with safe defaults)
│   ├── extensions.py        # db, socketio, login_manager instances
│   ├── models.py            # SQLAlchemy models (all node types incl. Controller Constraints + edges/groups)
│   ├── events.py            # SocketIO event handlers
│   ├── screenshot_worker.py # Headless Chromium PNG worker
│   ├── routes/
│   │   ├── auth.py          # Register, login, logout
│   │   ├── projects.py      # Project CRUD and sharing
│   │   ├── api.py           # Node CRUD for all 8 layers
│   │   ├── export.py        # SVG and PNG export
│   │   ├── backups.py       # Backup management
│   │   └── groups.py        # Node group CRUD
│   ├── instance/
│   │   └── stpa.db          # SQLite database (auto-created on first run)
│   ├── .secret_key          # Auto-generated session secret (gitignored)
│   ├── backups/             # Timestamped database snapshots
│   └── requirements.txt
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
