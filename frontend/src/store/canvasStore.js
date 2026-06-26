import { create } from 'zustand'
import { NODE_HORIZONTAL_SPACING, LAYER_Y_POSITIONS } from '../constants.js'

const SOLID_EDGE_STYLE = { stroke: '#64748b', strokeWidth: 2 }
const DASHED_EDGE_STYLE = { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5,5' }
const SOLID_MARKER = { type: 'arrowclosed', width: 16, height: 16, color: '#64748b' }
const DASHED_MARKER = { type: 'arrow', width: 16, height: 16, color: '#94a3b8' }

function makeEdge(source, target, dashed = false) {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'floating',
    style: dashed ? DASHED_EDGE_STYLE : SOLID_EDGE_STYLE,
    markerEnd: dashed ? DASHED_MARKER : SOLID_MARKER,
  }
}

function nodeTypeToPrefix(nodeType) {
  const map = {
    loss: 'loss', hazard: 'hazard', system_constraint: 'sc',
    control_action: 'ca', uca: 'uca', loss_scenario: 'ls', root: 'root',
  }
  return map[nodeType] || nodeType
}

function buildNodesAndEdges(data) {
  const { project, losses = [], hazards = [], system_constraints = [], control_actions = [], ucas = [], loss_scenarios = [], canvas_edges = [], groups = [] } = data

  const nodes = []
  const edges = []

  // Group nodes — must come BEFORE their children so React Flow resolves parentId correctly.
  // Sort: top-level groups first, then nested groups.
  const sortedGroups = [...groups].sort((a, b) => {
    if (!a.parent_group_id && b.parent_group_id) return -1
    if (a.parent_group_id && !b.parent_group_id) return 1
    return 0
  })
  sortedGroups.forEach(g => {
    const rfGroup = {
      id: `group-${g.id}`,
      type: 'groupNode',
      position: { x: g.x ?? 0, y: g.y ?? 0 },
      style: { width: g.width ?? 200, height: g.height ?? 200 },
      data: { label: g.label || '', nodeType: 'group', groupId: g.id },
      zIndex: -1,
    }
    if (g.parent_group_id) rfGroup.parentId = `group-${g.parent_group_id}`
    nodes.push(rfGroup)
  })

  // Root node
  nodes.push({
    id: `root-${project.id}`,
    type: 'rootNode',
    position: { x: project.root_x ?? 500, y: project.root_y ?? LAYER_Y_POSITIONS.root },
    data: { ...project, nodeType: 'root', label: 'ROOT' },
  })

  // Loss nodes
  losses.forEach((l, idx) => {
    const rfNode = {
      id: `loss-${l.id}`,
      type: 'lossNode',
      position: { x: (l.x && l.x !== 0) ? l.x : idx * NODE_HORIZONTAL_SPACING + 100, y: (l.y && l.y !== 0) ? l.y : LAYER_Y_POSITIONS.loss },
      data: { ...l, nodeType: 'loss' },
    }
    if (l.group_id) rfNode.parentId = `group-${l.group_id}`
    nodes.push(rfNode)
    edges.push(makeEdge(`root-${project.id}`, `loss-${l.id}`, false))
  })

  // Hazard nodes
  const topHazards = hazards.filter(h => !h.parent_hazard_id)
  const subHazards = hazards.filter(h => h.parent_hazard_id)

  topHazards.forEach((h, idx) => {
    const rfNode = {
      id: `hazard-${h.id}`,
      type: 'hazardNode',
      position: { x: (h.x && h.x !== 0) ? h.x : idx * NODE_HORIZONTAL_SPACING + 100, y: (h.y && h.y !== 0) ? h.y : LAYER_Y_POSITIONS.hazard },
      data: { ...h, nodeType: 'hazard' },
    }
    if (h.group_id) rfNode.parentId = `group-${h.group_id}`
    nodes.push(rfNode)
  })

  subHazards.forEach((h, idx) => {
    const parentNode = nodes.find(n => n.id === `hazard-${h.parent_hazard_id}`)
    const parentX = parentNode ? parentNode.position.x : 100
    const parentY = parentNode ? parentNode.position.y : LAYER_Y_POSITIONS.hazard
    const rfNode = {
      id: `hazard-${h.id}`,
      type: 'hazardNode',
      position: { x: (h.x && h.x !== 0) ? h.x : parentX + (idx % 2 === 0 ? 0 : 100), y: (h.y && h.y !== 0) ? h.y : parentY + 100 },
      data: { ...h, nodeType: 'hazard' },
    }
    if (h.group_id) rfNode.parentId = `group-${h.group_id}`
    nodes.push(rfNode)
    edges.push(makeEdge(`hazard-${h.parent_hazard_id}`, `hazard-${h.id}`, false))
  })

  // Hazard → Loss dashed reference edges (hazard references its associated loss)
  hazards.forEach(h => {
    if (h.loss_ids && Array.isArray(h.loss_ids)) {
      h.loss_ids.forEach(lid => {
        edges.push(makeEdge(`hazard-${h.id}`, `loss-${lid}`, true))
      })
    }
  })

  // System constraint nodes
  system_constraints.forEach((sc, idx) => {
    const rfNode = {
      id: `sc-${sc.id}`,
      type: 'scNode',
      position: { x: (sc.x && sc.x !== 0) ? sc.x : idx * NODE_HORIZONTAL_SPACING + 100, y: (sc.y && sc.y !== 0) ? sc.y : LAYER_Y_POSITIONS.system_constraint },
      data: { ...sc, nodeType: 'system_constraint' },
    }
    if (sc.group_id) rfNode.parentId = `group-${sc.group_id}`
    nodes.push(rfNode)
    if (sc.linked_hazard_id) {
      edges.push(makeEdge(`hazard-${sc.linked_hazard_id}`, `sc-${sc.id}`, false))
    }
    const scHazardIds = sc.hazard_ids && Array.isArray(sc.hazard_ids) ? sc.hazard_ids : []
    scHazardIds.filter(hid => hid !== sc.linked_hazard_id).forEach(hid => {
      edges.push(makeEdge(`sc-${sc.id}`, `hazard-${hid}`, true))
    })
  })

  // Control action nodes
  control_actions.forEach((ca, idx) => {
    const rfNode = {
      id: `ca-${ca.id}`,
      type: 'caNode',
      position: { x: (ca.x && ca.x !== 0) ? ca.x : idx * NODE_HORIZONTAL_SPACING + 100, y: (ca.y && ca.y !== 0) ? ca.y : LAYER_Y_POSITIONS.control_action },
      data: { ...ca, nodeType: 'control_action' },
    }
    if (ca.group_id) rfNode.parentId = `group-${ca.group_id}`
    nodes.push(rfNode)
  })

  // UCA nodes
  ucas.forEach((u, idx) => {
    const rfNode = {
      id: `uca-${u.id}`,
      type: 'ucaNode',
      position: { x: (u.x && u.x !== 0) ? u.x : idx * NODE_HORIZONTAL_SPACING + 100, y: (u.y && u.y !== 0) ? u.y : LAYER_Y_POSITIONS.uca },
      data: { ...u, nodeType: 'uca' },
    }
    if (u.group_id) rfNode.parentId = `group-${u.group_id}`
    nodes.push(rfNode)
    if (u.control_action_id) {
      edges.push(makeEdge(`ca-${u.control_action_id}`, `uca-${u.id}`, false))
    }
    if (u.hazard_ids && Array.isArray(u.hazard_ids)) {
      u.hazard_ids.forEach(hid => {
        edges.push(makeEdge(`uca-${u.id}`, `hazard-${hid}`, true))
      })
    }
  })

  // Loss scenario nodes
  loss_scenarios.forEach((ls, idx) => {
    const rfNode = {
      id: `ls-${ls.id}`,
      type: 'lsNode',
      position: { x: (ls.x && ls.x !== 0) ? ls.x : idx * NODE_HORIZONTAL_SPACING + 100, y: (ls.y && ls.y !== 0) ? ls.y : LAYER_Y_POSITIONS.loss_scenario },
      data: { ...ls, nodeType: 'loss_scenario' },
    }
    if (ls.group_id) rfNode.parentId = `group-${ls.group_id}`
    nodes.push(rfNode)
    if (ls.uca_id) {
      edges.push(makeEdge(`uca-${ls.uca_id}`, `ls-${ls.id}`, false))
    }
    if (ls.hazard_ids && Array.isArray(ls.hazard_ids)) {
      ls.hazard_ids.forEach(hid => {
        edges.push(makeEdge(`ls-${ls.id}`, `hazard-${hid}`, true))
      })
    }
  })

  // Canvas edges
  canvas_edges.forEach(ce => {
    const src = `${nodeTypeToPrefix(ce.from_node_type)}-${ce.from_node_id}`
    const tgt = `${nodeTypeToPrefix(ce.to_node_type)}-${ce.to_node_id}`
    const isSolid = ce.style === 'solid'
    edges.push({
      id: `e-canvas-${ce.id}`,
      source: src,
      target: tgt,
      type: 'floating',
      style: isSolid ? SOLID_EDGE_STYLE : DASHED_EDGE_STYLE,
      markerEnd: isSolid ? SOLID_MARKER : DASHED_MARKER,
    })
  })

  return { nodes, edges }
}

function getDescendantIds(rfNodeId, allEdges) {
  const children = allEdges.filter(e => e.source === rfNodeId && !(e.style && e.style.strokeDasharray)).map(e => e.target)
  let descendants = [...children]
  children.forEach(childId => {
    descendants = [...descendants, ...getDescendantIds(childId, allEdges)]
  })
  return descendants
}

function _readDarkCookie() {
  const m = document.cookie.match(/(?:^|;\s*)stpa-dark=([^;]*)/)
  return m ? m[1] === 'true' : false
}
function _writeDarkCookie(val) {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1)
  document.cookie = `stpa-dark=${val}; expires=${d.toUTCString()}; path=/; SameSite=Lax`
}
const _initDark = _readDarkCookie()
if (_initDark) document.documentElement.classList.add('dark')

const useCanvasStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  projects: [],
  currentProject: null,
  nodes: [],
  edges: [],
  selectedNode: null,
  activeUsers: [],
  collapsedNodes: new Set(),
  // Undo/redo for node position moves
  moveHistory: [],
  moveHistoryIndex: -1,
  // Copy/paste
  copiedNode: null,
  // View-only mode
  viewOnly: false,
  // Dark mode
  darkMode: _initDark,

  setUser(user) {
    const updates = { user, isAuthenticated: user != null }
    if (user && typeof user.dark_mode === 'boolean') {
      updates.darkMode = user.dark_mode
      _writeDarkCookie(user.dark_mode)
      document.documentElement.classList.toggle('dark', user.dark_mode)
    }
    set(updates)
  },

  setProjects(projects) {
    set({ projects })
  },

  loadProject(projectData) {
    const { nodes, edges } = buildNodesAndEdges(projectData)
    const userRole = projectData.user_role || 'owner'
    set({
      currentProject: { ...projectData.project, user_role: userRole },
      nodes,
      edges,
      selectedNode: null,
      collapsedNodes: new Set(),
      viewOnly: userRole === 'viewer',
    })
  },

  patchCurrentProject(fields) {
    set(state => ({
      currentProject: state.currentProject ? { ...state.currentProject, ...fields } : state.currentProject,
    }))
  },

  addRFNode(rfNode) {
    set(state => ({ nodes: [...state.nodes, rfNode] }))
  },

  updateRFNode(nodeId, changes) {
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...changes } } : n
      ),
      selectedNode: state.selectedNode?.id === nodeId
        ? { ...state.selectedNode, data: { ...state.selectedNode.data, ...changes } }
        : state.selectedNode,
    }))
  },

  moveRFNode(rfNodeId, x, y) {
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === rfNodeId ? { ...n, position: { x, y } } : n
      ),
    }))
  },

  // Batch-move multiple nodes in a single state update (avoids N re-renders for align/distribute)
  moveMultipleRFNodes(updates) {
    const map = new Map(updates.map(({ rfId, x, y }) => [rfId, { x, y }]))
    set(state => ({
      nodes: state.nodes.map(n => {
        const pos = map.get(n.id)
        return pos ? { ...n, position: pos } : n
      }),
    }))
  },

  removeRFNode(rfNodeId) {
    set(state => ({
      nodes: state.nodes.filter(n => n.id !== rfNodeId),
      edges: state.edges.filter(e => e.source !== rfNodeId && e.target !== rfNodeId),
      selectedNode: state.selectedNode?.id === rfNodeId ? null : state.selectedNode,
    }))
  },

  setRFNodeParentAndPos(rfNodeId, parentId, position) {
    set(state => ({
      nodes: state.nodes.map(n => {
        if (n.id !== rfNodeId) return n
        const updated = { ...n, position: position || n.position }
        if (parentId) {
          updated.parentId = parentId
        } else {
          delete updated.parentId
        }
        return updated
      }),
    }))
  },

  addRFEdge(rfEdge) {
    set(state => ({ edges: [...state.edges, rfEdge] }))
  },

  removeRFEdge(edgeId) {
    set(state => ({ edges: state.edges.filter(e => e.id !== edgeId) }))
  },

  setSelectedNode(node) {
    set({ selectedNode: node })
  },

  setActiveUsers(users) {
    set({ activeUsers: users })
  },

  setCopiedNode(node) {
    set({ copiedNode: node })
  },

  setViewOnly(val) {
    set({ viewOnly: val })
  },

  toggleDarkMode() {
    set(state => {
      const next = !state.darkMode
      _writeDarkCookie(next)
      document.documentElement.classList.toggle('dark', next)
      if (state.isAuthenticated) {
        fetch('/auth/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ dark_mode: next }),
        }).catch(() => {})
      }
      return { darkMode: next }
    })
  },

  pushHistory(entry) {
    set(state => {
      const past = state.moveHistory.slice(0, state.moveHistoryIndex + 1)
      const next = [...past, entry].slice(-50)
      return { moveHistory: next, moveHistoryIndex: next.length - 1 }
    })
  },

  updateHistoryEntry(index, changes) {
    set(state => ({
      moveHistory: state.moveHistory.map((e, i) => i === index ? { ...e, ...changes } : e),
    }))
  },

  setFocusNode(rfNodeId) {
    set({ focusNodeId: rfNodeId })
  },

  clearFocusNode() {
    set({ focusNodeId: null })
  },

  focusNodeId: null,

  toggleNodeCollapse(rfNodeId) {
    const { collapsedNodes, edges } = get()
    const newCollapsed = new Set(collapsedNodes)

    if (newCollapsed.has(rfNodeId)) {
      // Expanding: unhide immediate children
      newCollapsed.delete(rfNodeId)
      const childIds = edges
        .filter(e => e.source === rfNodeId && !(e.style && e.style.strokeDasharray))
        .map(e => e.target)

      set(state => ({
        collapsedNodes: newCollapsed,
        nodes: state.nodes.map(n =>
          childIds.includes(n.id) ? { ...n, data: { ...n.data, hidden: false } } : n
        ),
        edges: state.edges.map(e =>
          childIds.includes(e.target) && e.source === rfNodeId
            ? { ...e, hidden: false }
            : e
        ),
      }))
    } else {
      // Collapsing: hide all descendants
      newCollapsed.add(rfNodeId)
      const descendantIds = getDescendantIds(rfNodeId, edges)

      set(state => ({
        collapsedNodes: newCollapsed,
        nodes: state.nodes.map(n =>
          descendantIds.includes(n.id) ? { ...n, data: { ...n.data, hidden: true } } : n
        ),
        edges: state.edges.map(e =>
          descendantIds.includes(e.target) || descendantIds.includes(e.source)
            ? { ...e, hidden: true }
            : e
        ),
      }))
    }
  },
}))

export default useCanvasStore
