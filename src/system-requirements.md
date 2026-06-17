# STPA Visualizer — Software Requirements Prompt

## Goal

Build a web-based collaborative tool that visualizes the STPA (System-Theoretic Process Analysis) methodology as an interactive, hierarchical tree. The tool should allow engineering teams to input, organize, and navigate STPA artifacts — from high-level losses down to loss scenarios — while clearly visualizing the relationships between nodes across layers. The primary goals are speed of input, visual clarity, and seamless multi-user collaboration.

---

## Tech Stack

- **Backend:** Python / Flask with **Flask-SocketIO** for real-time WebSocket communication
- **Database:** MySQL
- **Frontend:** JavaScript single-page canvas application. The developer should choose the most appropriate canvas library (e.g. React Flow, Cytoscape.js, or similar) based on what best supports draggable nodes, custom edges, and programmatic layout. The choice should be justified in a brief comment in the code.
- **Authentication:** Session-based username/password login (Flask-Login or equivalent)
- **Real-time sync:** WebSocket-based via Flask-SocketIO. All canvas mutations (add node, edit node, move node, draw edge, delete) must be broadcast to all other connected clients in the same project room instantly.

---

## Authentication & Access

- Users must log in with a username and password before accessing any part of the application.
- Each user belongs to a single shared team. All users have full permissions — any user can create, edit, move, link, and delete any node or project.
- There is no role distinction. The schema does not need to support roles.

---

## Database Schema

All tables should be scoped to a `project_id`. The following tables are required:

| Table                | Key Fields                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `projects`           | id, title, purpose_statement, created_at                                                              |
| `losses`             | id, project_id, label (L-1…), description                                                             |
| `hazards`            | id, project_id, label (H-1…), description, parent_hazard_id (nullable, for sub-hazards)               |
| `hazard_loss_links`  | hazard_id, loss_id (many-to-many)                                                                     |
| `system_constraints` | id, project_id, label (SC-1…), description, linked_hazard_id                                          |
| `control_actions`    | id, project_id, label (CA-1…), name                                                                   |
| `ucas`               | id, project_id, label (UCA-1.1…), description, control_action_id, uca_type                            |
| `uca_hazard_links`   | uca_id, hazard_id (many-to-many)                                                                      |
| `loss_scenarios`     | id, project_id, label (LS-1.2.1…), description, uca_id                                                |
| `ls_hazard_links`    | ls_id, hazard_id (many-to-many)                                                                       |
| `canvas_edges`       | id, project_id, from_node_type, from_node_id, to_node_type, to_node_id, style ENUM(`solid`, `dashed`) |

The `uca_type` field on UCAs must be an enum with four values:

1. `not_providing` — Not providing the control action
2. `providing_causes_hazard` — Providing causes a hazard
3. `wrong_timing_order` — Providing at wrong time or in wrong order
4. `duration_issue` — Control action lasts too long or stops too soon

---

## Tree Structure & Layers

The canvas renders nodes organized in seven vertical layers. Layers are auto-positioned top-to-bottom, but nodes can be repositioned by dragging. Cross-layer arrows are drawn by the user or auto-generated from the database relationships.

### Layer 1 — Purpose Statement (Root)

- Single node per project.
- Displays the project title and purpose statement.
- Visually distinct from other nodes (e.g. larger, bold border).

### Layer 2 — Losses

- Automatically connected to the root node with arrows.
- Label format: `L-1`, `L-2`, … `L-n`
- Each node shows the label as its title and the loss description as its body.
- New losses can be added with a single click ("+ Add Loss" button near the layer).

### Layer 3 — Hazards

- Each hazard can link to one or more Losses (many-to-many).
- Label format: `H-1`, `H-2`, … `H-n`
- Each node shows the label and a description.
- **Sub-hazards** (e.g. `H-2.1`, `H-2.3`) are child nodes of a parent hazard:
  - Rendered just below their parent hazard, offset slightly, not in a full new layer row.
  - Connected to their parent hazard with a short, visually distinct edge.
  - Can also link to Losses independently.
  - Sub-hazard nodes can be **collapsed** back into the parent hazard node to reduce visual clutter. A small expand/collapse toggle (e.g. a chevron icon) on the parent hazard node controls this.

### Layer 4 — System Constraints

- Each system constraint links to one or more Hazards or Sub-hazards.
- Label format: `SC-1`, `SC-1.1`, … (numbering reflects relationship to hazard)
- Each node shows the label and description.

### Layer 5 — Control Actions

- Control actions have no enforced parent in the tree but are displayed as their own layer for visual organization.
- Label format: `CA-1`, `CA-2`, … `CA-n`
- Each node shows the label and a name.

### Layer 6 — Unsafe Control Actions (UCAs)

- Each UCA has exactly one parent Control Action.
- UCAs also link back to one or more Hazards (many-to-many).
- Label format: `UCA-1.1`, `UCA-1.2` (first number = parent CA number, second = UCA index within that CA).
- Each UCA node displays its label, description, and **UCA type tag** (one of the four types listed in the schema above). The type tag should be color-coded for quick scanning.
- Clicking a UCA expands it to show the type detail inline.

### Layer 7 — Loss Scenarios

- Each Loss Scenario has exactly one parent UCA.
- Loss Scenarios also link back to one or more Hazards.
- Label format: `LS-1.2.1` (CA number . UCA number . LS index within that UCA).
- Each node shows the label and description.

---

## Canvas & Interaction

### Nodes

- All nodes are rendered as rounded rectangles on an infinite, pannable/zoomable canvas.
- Each node displays:
  - Its **label** (e.g. `H-2`) prominently at the top.
  - Its **name or description** as smaller text below.
  - A **type badge** indicating which layer it belongs to (color-coded per layer).
- Clicking a node opens an **inline detail panel** (side drawer or modal) showing all fields and allowing editing.
- Nodes can be dragged to reposition them on the canvas.
- Node positions are saved to the database per project.

### Adding Nodes Quickly

- Each layer should have a persistent **"+ Add [type]"** button visible near that layer on the canvas.
- Clicking it opens a minimal inline form with only the required fields (label is auto-generated, description is free text).
- Submitting the form instantly creates the node and places it on the canvas without a page reload.
- No deep menu navigation should be required to add a new node.

### Arrows & Edges

There are two arrow styles, each with a distinct visual meaning:

**Solid arrows — parent-child relationships**

- A solid line with a filled arrowhead pointing from parent to child.
- Used for all structural, hierarchical relationships: Root → Loss, Loss → Hazard, Hazard → Sub-hazard, Control Action → UCA, UCA → Loss Scenario.
- These are auto-generated from the database and **cannot be deleted** by the user.

**Dashed arrows — backlinks / cross-references**

- A dashed line with an open arrowhead pointing from the referencing node back to the referenced node.
- Used whenever a node references another node outside its direct parent chain: Hazard → Loss (many-to-many), UCA → Hazard, Loss Scenario → Hazard, System Constraint → Hazard, Sub-hazard → Loss.
- These are also auto-generated from the database relationships and **cannot be deleted** directly — they disappear when the underlying link is removed via the node's edit panel.
- Users can also manually draw dashed arrows between any two nodes to represent informal analytical relationships. These are stored in the `canvas_edges` table with a `style` of `dashed` and can be deleted by selecting the arrow and pressing Delete or via a right-click context menu.

**General edge behavior**

- Arrow endpoints snap to the nearest edge of each node.
- Both arrow types route using curved bezier paths to minimize overlap.
- A legend in the bottom corner of the canvas explains the two arrow types.

### Expand / Collapse

- Any node with children can be collapsed. When collapsed, all child nodes and edges are hidden and the parent node shows a count badge (e.g. "3 children hidden").
- Sub-hazards collapse into their parent hazard specifically.
- The canvas reflows smoothly when nodes are expanded or collapsed.

---

## Real-Time Collaboration (Flask-SocketIO)

The backend uses Flask-SocketIO. The frontend uses the Socket.IO client library. All canvas state changes go through the following event flow:

1. User performs an action (e.g. adds a node).
2. Frontend sends a SocketIO event to the server with the action payload.
3. Server writes the change to MySQL.
4. Server broadcasts the event to all other clients in the same project room.
5. Each receiving client applies the change to their local canvas state.

### Required SocketIO Events

| Event name        | Direction       | Payload                                                      |
| ----------------- | --------------- | ------------------------------------------------------------ |
| `project:join`    | Client → Server | `{ project_id }`                                             |
| `node:added`      | Both            | `{ node_type, node_data, position }`                         |
| `node:updated`    | Both            | `{ node_type, node_id, changed_fields }`                     |
| `node:moved`      | Both            | `{ node_type, node_id, x, y }`                               |
| `node:deleted`    | Both            | `{ node_type, node_id }`                                     |
| `edge:added`      | Both            | `{ from_node_type, from_node_id, to_node_type, to_node_id }` |
| `edge:deleted`    | Both            | `{ edge_id }`                                                |
| `presence:update` | Server → Client | `{ active_users: [{ user_id, name, avatar_color }] }`        |

The `presence:update` event should be emitted whenever a user joins or leaves a project room, so the toolbar avatar list stays current.

---

### Creating a Project

1. User clicks "New Project."
2. A form prompts for:
   - Project title
   - Purpose statement (multi-line text)
3. On submit, the project canvas is created with the root node pre-populated and Layer 2 scaffolded with an empty "Add Loss" prompt.

### Project Dashboard

- Lists all projects accessible to the team.
- Shows project title, last modified date, and member count.
- Allows opening, renaming, or archiving a project.

---

## UI / UX Guidelines

- The primary view is the **canvas**, taking up the full browser viewport.
- A collapsible **sidebar** on the left lists all nodes by layer for quick navigation and search.
- A **top toolbar** contains: project name, zoom controls, fit-to-screen button, and team member avatars (showing who is currently viewing).
- Color coding per layer should be consistent throughout (sidebar, canvas nodes, and edge colors).
- The UI should be clean and minimal — the tree itself is the focus, not chrome.
- All actions (add, edit, link, delete) should be achievable without leaving the canvas view.

---

## Non-Functional Requirements

- **Performance:** The canvas should remain responsive with up to 200 nodes. Use virtualization or lazy rendering if needed.
- **Real-time collaboration:** All canvas mutations must propagate to connected teammates instantly via Flask-SocketIO. Each project is a SocketIO "room." When a user joins a project canvas, they join that room. Every mutation event (node added, node edited, node moved, edge drawn, edge deleted) emits a typed SocketIO event (e.g. `node:added`, `node:moved`, `edge:deleted`) with the changed payload. Other clients receive the event and update their canvas state without a page reload. Conflict resolution is last-write-wins for v1.
- **Data integrity:** Deleting a node should warn the user if it has dependent children and offer cascade or re-link options.
- **Validation:** Labels should be auto-generated and unique within a project. Descriptions are required before saving.
