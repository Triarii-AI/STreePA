# Claude Handoff — STPA Tree Graph

This document captures full project context for a new Claude session.
Paste this at the start of a new conversation to restore context instantly.

---

## What this project is

Full-stack collaborative STPA (System-Theoretic Process Analysis) diagram tool.
Users build tree graphs of safety analysis entities (Losses → Hazards → UCAs → Loss Scenarios etc.)
in a live, multi-user canvas. Think Miro but domain-specific and structured.

**Stack**
- Backend: Python / Flask + Flask-SocketIO + SQLAlchemy + MySQL
- Frontend: React (Vite) + @xyflow/react v12 (React Flow) + Zustand

**Repo root:** `/home/igoins/Projects/STPA-Tree-Graph`
**Current branch:** `headless-chromium-export` (ahead of `main`)
**Git user:** Isaac Goins

---

## Directory layout

```
backend/
  app.py              — Flask factory
  config.py           — env-based config (DB URI, secret key, etc.)
  models.py           — SQLAlchemy models (Project, Loss, Hazard, SC, CA, UCA, LossScenario, CanvasEdge, Group)
  events.py           — Flask-SocketIO event handlers (node:*, presence:*)
  extensions.py       — db, socketio, login_manager singletons
  routes/
    api.py            — REST CRUD for all node types + canvas positions
    auth.py           — login / register / logout
    projects.py       — project CRUD + sharing
    export.py         — PNG/SVG export (headless Chromium primary, Python SVG fallback)
    groups.py         — node grouping API
    backups.py        — .stpa.json import/export
    utils.py          — check_project_access helper
  screenshot_worker.py — standalone Playwright script; called as subprocess by export.py

frontend/src/
  store/canvasStore.js     — Zustand store (nodes, edges, selectedNode, darkMode, etc.)
  components/Canvas.jsx    — main React Flow canvas (~1300 lines)
  components/RemoteOverlays.jsx — isolated useViewport() subscriber (perf)
  components/edges/FloatingEdge.jsx — custom floating bezier edge
  components/nodes/         — LossNode, HazardNode, SCNode, CANode, UCANode, LSNode, RootNode, GroupNode
  components/Toolbar.jsx
  components/Sidebar.jsx
  components/NodePanel.jsx  — right-side edit panel for selected node
  pages/ProjectCanvas.jsx   — canvas page + RenderModeCanvas (for headless export)
  pages/Dashboard.jsx
  api.js                    — fetch wrappers for all backend endpoints
  constants.js              — makeRFEdge, node type maps
  socket.js                 — socket.io-client singleton
```

---

## STPA node types and RF ID prefixes

| Type             | RF prefix | DB model          |
|------------------|-----------|-------------------|
| root             | `root-`   | Project (root_x/y)|
| loss             | `loss-`   | Loss              |
| hazard           | `hazard-` | Hazard            |
| system_constraint| `sc-`     | SystemConstraint  |
| control_action   | `ca-`     | ControlAction     |
| uca              | `uca-`    | UCA               |
| loss_scenario    | `ls-`     | LossScenario      |

Edges: solid = structural (parent→child), dashed = cross-reference link.

---

## Key architectural decisions & non-obvious invariants

### React Flow node ordering
React Flow **requires parent nodes to appear BEFORE their children** in the `nodes` array.
The `groupRFNodes` Zustand action inserts the group node at `firstMemberIdx` (not the end)
to satisfy this constraint. Getting this wrong causes children to not move with the group.

### Atomic Zustand updates
All multi-node mutations (group, ungroup, delete) use a single `set(state => ...)` call
to avoid N+1 re-renders with inconsistent intermediate states that cause visual jumps.

### useViewport() isolation
`useViewport()` fires on every pan/zoom frame (60fps). It was removed from the main
`CanvasInner` component and isolated to `RemoteOverlays.jsx` so the 1000+ node tree
doesn't re-render on every frame.

### Per-edge store subscription removed
`FloatingEdge` no longer subscribes to the Zustand store. Selection status is passed
as `data.selKind` prop (computed once in Canvas's `displayEdges` memo), so edges don't
trigger store evaluations during drag/pan.

### MiniMap prop stabilization
`nodeColor` is a module-level function reference (not inline lambda) and `style` is a
`useMemo`. Without this, MiniMap re-renders on every store write.

---

## Headless Chromium export system

### How it works
1. Frontend button click → `fetch(/api/projects/<id>/export?format=png)` or `format=svg`
2. `backend/routes/export.py` `export_project()`:
   - Constructs `local_base = http://127.0.0.1:{SERVER_PORT}` (NOT `request.host_url` — that goes through Cloudflare/proxy and causes 530 errors)
   - Calls `_chromium_png()` which runs `screenshot_worker.py` as a subprocess via `eventlet.tpool.execute()` to avoid deadlocking Flask's eventlet event loop
3. `screenshot_worker.py` (standalone Playwright script):
   - Launches `/usr/bin/chromium` in headless mode
   - Navigates to `/projects/<id>?render=1&theme=...&cross_refs=...&hidden=...`
   - Waits for `window.__EXPORT_READY__ === true`
   - Reads `window.__EXPORT_BOUNDS__` (set by React) to get graph dimensions
   - Computes zoom from `min(node_zoom, max_dim/W, max_dim/H, max_output/(W*scale), max_output/(H*scale))`
   - Sizes viewport, calls `window.__rfSetViewport(vp)` to set exact transform
   - Takes screenshot → PNG bytes → back to Flask → HTTP response
4. For `format=svg`: same pipeline but PNG is base64-embedded in an SVG `<image>` wrapper

### Render mode canvas
`ProjectCanvas.jsx` detects `?render=1` in the URL and renders `<RenderModeCanvas>` instead
of the normal canvas. This is a bare full-screen canvas with no toolbar/sidebar/sockets.

**Critical:** The wrapper must be `flex flex-col` so Canvas's `flex-1` root has a flex
parent — otherwise the canvas collapses to zero height and everything renders white.

### Key signals (window globals set by React, read by Playwright)
- `window.__EXPORT_READY__` — set to `true` after nodes initialized + fitView complete
- `window.__EXPORT_BOUNDS__` — `{x, y, width, height}` of visible graph in model coords
- `window.__rfSetViewport` — function to set React Flow viewport: `{x, y, zoom}`

### Current export parameters (export.py)
```python
cmd = [
    sys.executable, _WORKER,
    '--url', url,            # http://127.0.0.1:5000/projects/<id>?render=1&...
    '--out', tmp,
    '--base-url', local_base,  # http://127.0.0.1:5000
    '--node-zoom', '1.0',
    '--max-dim', '10000',    # CSS viewport cap (browser layout memory)
    '--max-output', '20000', # physical pixel cap (PNG file size)
    '--scale', '2',          # deviceScaleFactor=2 → Retina quality, crisp text at any zoom
]
```

### Quality math
With scale=2, max-dim=10000, max-output=20000:
- Graph ≤ 10k px wide: zoom=1.0, density=2.0× (extra crisp)
- Graph ≤ 20k px wide: zoom≥0.5, density≥1.0× (guaranteed ≥1 px per model px)
- Graph > 20k px wide: density < 1.0× but still 2× better than scale=1

---

## Grouping feature

- `handleGroup` in Canvas.jsx computes group bounding box, calls `store.groupRFNodes(groupRFNode, memberUpdates)`
- `groupRFNodes` (canvasStore.js): inserts group node at `firstMemberIdx`, sets `parentId` + relative positions atomically
- `ungroupRFNodes` (canvasStore.js): removes group node, restores absolute positions, clears `parentId`
- `GroupNode.jsx`: renders the group container (dashed border etc.)
- Backend: `backend/routes/groups.py`

---

## Performance optimizations (all on `headless-chromium-export` branch / merged to main)

1. **Viewport subscription isolation** — `RemoteOverlays.jsx` owns `useViewport()`, not `CanvasInner`
2. **Edge selection via props** — `FloatingEdge` reads `data.selKind` prop, not store subscription
3. **MiniMap stabilization** — module-level `minimapNodeColor` fn + `useMemo` for `minimapStyle`
4. **`onlyRenderVisibleElements`** — always on except during export (`isExporting` or `renderMode`)

---

## Export UI (Canvas.jsx)

Two buttons in the bottom-right export menu:
- **Export PNG** → calls `exportScreenshot()` → `fetch(format=png)` → downloads blob directly
- **Export SVG** → calls `exportSvg()` → `fetch(format=svg)` → downloads blob (SVG wrapper with embedded PNG)

Both go through headless Chromium. The old client-side canvas-based PNG conversion was removed.

---

## SocketIO events

Emitted by backend (`events.py`), handled in `ProjectCanvas.jsx`:
- `node:added`, `node:updated`, `node:moved`, `node:deleted`
- `edge:added`, `edge:deleted`
- `presence:update` — active users list
- `share:role_changed` — viewer/editor role change

Room join: `socket.emit('project:join', {project_id: id})`

---

## Things NOT to do (learned from this session)

- **Don't use `request.host_url` for the Chromium worker base URL** — it routes through Cloudflare/reverse proxy, causing 530 errors. Always use `http://127.0.0.1:{SERVER_PORT}`.
- **Don't append group node to end of nodes array** — React Flow requires parent before children. Insert at `firstMemberIdx`.
- **Don't call multiple `setState` for a multi-node mutation** — use one `set(state => ...)` or nodes jump.
- **Don't add `useViewport()` to the main canvas component** — isolate to `RemoteOverlays`.
- **Don't put `flex-1` on a child without a flex parent** — the canvas collapses to zero height (silent white-screen bug).
- **Don't use `minZoom=0.05` in render mode** — fitView can't zoom out far enough for large graphs. Use `0.001`.

---

## Setup notes

- Python venv: `backend/venv/` — activate with `source backend/venv/bin/activate`
- Frontend: `cd frontend && npm install && npm run dev`
- Backend: `cd backend && python app.py`
- Chromium: system install at `/usr/bin/chromium`
- Playwright: `pip install playwright` in the venv (no `playwright install` needed — uses system Chromium via `executable_path`)
- DB: MySQL, config in `backend/config.py` / env vars

---

## Current branch status

Branch `headless-chromium-export` is ahead of `main`. Key files changed vs main:
- `backend/routes/export.py` — complete rewrite of export route (Chromium primary, Python SVG fallback)
- `backend/screenshot_worker.py` — new file
- `frontend/src/pages/ProjectCanvas.jsx` — added `RenderModeCanvas`, render-mode URL detection
- `frontend/src/components/Canvas.jsx` — render mode props, `__EXPORT_READY__` signal, export functions rewritten
- `frontend/src/components/RemoteOverlays.jsx` — new file (viewport isolation)
- `frontend/src/components/edges/FloatingEdge.jsx` — removed store subscription
- `frontend/src/store/canvasStore.js` — `groupRFNodes`, `ungroupRFNodes` atomic actions
