// React Flow (@xyflow/react) chosen for: first-class React component model for custom nodes,
// built-in drag-and-drop with programmatic positioning, native Bezier edge routing,
// built-in zoom/pan/fit controls, and active maintenance. Best fit for React-based UIs
// requiring rich per-node interactivity without low-level SVG management.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  useNodesInitialized,
  getNodesBounds,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import useCanvasStore from '../store/canvasStore.js'
import socket from '../socket.js'
import { updateNode, updateProject, deleteNode, createNode, createLink, createGroup, updateGroup, deleteGroup } from '../api.js'
import { makeRFEdge, nodeTypeToPrefix } from '../constants.js'

import RootNode from './nodes/RootNode.jsx'
import LossNode from './nodes/LossNode.jsx'
import HazardNode from './nodes/HazardNode.jsx'
import SCNode from './nodes/SCNode.jsx'
import CANode from './nodes/CANode.jsx'
import UCANode from './nodes/UCANode.jsx'
import LSNode from './nodes/LSNode.jsx'
import GroupNode from './nodes/GroupNode.jsx'
import AddNodeForm from './forms/AddNodeForm.jsx'
import FloatingEdge from './edges/FloatingEdge.jsx'
import RemoteOverlays from './RemoteOverlays.jsx'

const nodeTypes = {
  rootNode: RootNode,
  lossNode: LossNode,
  hazardNode: HazardNode,
  scNode: SCNode,
  caNode: CANode,
  ucaNode: UCANode,
  lsNode: LSNode,
  groupNode: GroupNode,
}

const edgeTypes = {
  floating: FloatingEdge,
}

const LAYER_BUTTONS = [
  { nodeType: 'loss', label: '+ Loss', colorClass: 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' },
  { nodeType: 'hazard', label: '+ Hazard', colorClass: 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100' },
  { nodeType: 'system_constraint', label: '+ Sys. Constraint', colorClass: 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100' },
  { nodeType: 'control_action', label: '+ Control Action', colorClass: 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100' },
  { nodeType: 'uca', label: '+ UCA', colorClass: 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100' },
  { nodeType: 'loss_scenario', label: '+ Loss Scenario', colorClass: 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100' },
]

function getNodeColor(type) {
  const colorMap = {
    rootNode: '#6366f1',
    lossNode: '#ef4444',
    hazardNode: '#f97316',
    scNode: '#eab308',
    caNode: '#22c55e',
    ucaNode: '#3b82f6',
    lsNode: '#8b5cf6',
  }
  return colorMap[type] || '#94a3b8'
}

// Stable reference so MiniMap's memoized node list doesn't break on every render.
// React Flow's MiniMapNodes is memo'd and only re-renders when the set of node IDs
// changes; an inline `n => getNodeColor(n.type)` arrow would create a new prop each
// render and force all node rects to repaint. Keeping this module-level is what lets
// the minimap stay cheap even at 1k+ nodes.
const minimapNodeColor = (n) => getNodeColor(n.type)

const RF_PREFIX_TO_TYPE = {
  sc: 'system_constraint', ca: 'control_action', uca: 'uca',
  ls: 'loss_scenario', loss: 'loss', hazard: 'hazard', root: 'root',
  group: 'group',
}

function AlignLeftIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <line x1="2" y1="1.5" x2="2" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="3.5" y="3" width="5" height="3.5" rx="0.5" fill="currentColor"/>
      <rect x="3.5" y="9.5" width="9" height="3.5" rx="0.5" fill="currentColor"/>
    </svg>
  )
}
function AlignCenterHIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <line x1="8" y1="1.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4.5" y="3" width="7" height="3.5" rx="0.5" fill="currentColor"/>
      <rect x="3" y="9.5" width="10" height="3.5" rx="0.5" fill="currentColor"/>
    </svg>
  )
}
function AlignRightIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <line x1="14" y1="1.5" x2="14" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="8.5" y="3" width="5" height="3.5" rx="0.5" fill="currentColor"/>
      <rect x="3.5" y="9.5" width="9" height="3.5" rx="0.5" fill="currentColor"/>
    </svg>
  )
}
function AlignTopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <line x1="1.5" y1="2" x2="14.5" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="3" y="3.5" width="3.5" height="8" rx="0.5" fill="currentColor"/>
      <rect x="9.5" y="3.5" width="3.5" height="5" rx="0.5" fill="currentColor"/>
    </svg>
  )
}
function AlignMiddleVIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="3" y="4.5" width="3.5" height="7" rx="0.5" fill="currentColor"/>
      <rect x="9.5" y="5.5" width="3.5" height="5" rx="0.5" fill="currentColor"/>
    </svg>
  )
}
function AlignBottomIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <line x1="1.5" y1="14" x2="14.5" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="3" y="4.5" width="3.5" height="9" rx="0.5" fill="currentColor"/>
      <rect x="9.5" y="8.5" width="3.5" height="5" rx="0.5" fill="currentColor"/>
    </svg>
  )
}
function DistributeHIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <rect x="1" y="5.5" width="3" height="5" rx="0.5" fill="currentColor"/>
      <rect x="6.5" y="5.5" width="3" height="5" rx="0.5" fill="currentColor"/>
      <rect x="12" y="5.5" width="3" height="5" rx="0.5" fill="currentColor"/>
      <line x1="2.5" y1="3.5" x2="2.5" y2="4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="8" y1="3.5" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="13.5" y1="3.5" x2="13.5" y2="4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}
function DistributeVIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15">
      <rect x="5.5" y="1" width="5" height="3" rx="0.5" fill="currentColor"/>
      <rect x="5.5" y="6.5" width="5" height="3" rx="0.5" fill="currentColor"/>
      <rect x="5.5" y="12" width="5" height="3" rx="0.5" fill="currentColor"/>
      <line x1="3.5" y1="2.5" x2="4.5" y2="2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="3.5" y1="8" x2="4.5" y2="8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <line x1="3.5" y1="13.5" x2="4.5" y2="13.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

const ORPHAN_NULL_FIELD = {
  hazard: 'parent_hazard_id',
  system_constraint: 'linked_hazard_id',
  uca: 'control_action_id',
  loss_scenario: 'uca_id',
}
// Maps each FK field to the node type it references (used to skip cascaded relabels)
const FK_PARENT_TYPE = {
  parent_hazard_id: 'hazard',
  linked_hazard_id: 'hazard',
  control_action_id: 'control_action',
  uca_id: 'uca',
}

// Walk the parentId chain to the top-most ancestor group (the one with no parentId).
// Returns null if the node is not inside any group.
function findRootAncestor(nodeId, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  let current = nodeMap.get(nodeId)
  if (!current?.parentId) return null
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId)
    if (!parent) break
    current = parent
  }
  return current
}

async function recreateNode(entry) {
  const { snapshot, projectId } = entry
  const { nodeData, position, rfNodeType } = snapshot
  const nodeType = nodeData.nodeType

  const payload = { x: position.x, y: position.y }
  if (nodeData.description) payload.description = nodeData.description
  if (nodeData.name) payload.name = nodeData.name
  if (nodeData.uca_type) payload.uca_type = nodeData.uca_type
  if (nodeData.control_action_id) payload.control_action_id = parseInt(nodeData.control_action_id)
  if (nodeData.uca_id) payload.uca_id = parseInt(nodeData.uca_id)
  if (nodeData.parent_hazard_id) payload.parent_hazard_id = parseInt(nodeData.parent_hazard_id)
  if (nodeData.linked_hazard_id) payload.linked_hazard_id = parseInt(nodeData.linked_hazard_id)

  const result = await createNode(projectId, nodeType, payload)
  const newNodeData = result[nodeType] || result.node || result
  const newNodeId = newNodeData.id
  const prefix = nodeTypeToPrefix(nodeType)
  const newRfId = `${prefix}-${newNodeId}`

  const store = useCanvasStore.getState()
  store.addRFNode({
    id: newRfId,
    type: rfNodeType,
    position: { ...position },
    data: { ...nodeData, ...newNodeData, nodeType },
  })

  if (nodeType === 'loss') {
    const project = store.currentProject
    if (project) store.addRFEdge(makeRFEdge(`root-${project.id}`, newRfId, false))
  } else if (nodeType === 'hazard' && payload.parent_hazard_id) {
    store.addRFEdge(makeRFEdge(`hazard-${payload.parent_hazard_id}`, newRfId, false))
  } else if (nodeType === 'uca' && payload.control_action_id) {
    store.addRFEdge(makeRFEdge(`ca-${payload.control_action_id}`, newRfId, false))
  } else if (nodeType === 'loss_scenario' && payload.uca_id) {
    store.addRFEdge(makeRFEdge(`uca-${payload.uca_id}`, newRfId, false))
  }

  for (const lid of (nodeData.loss_ids || [])) {
    try {
      await createLink(projectId, 'hazard', newNodeId, 'loss', lid)
      store.addRFEdge(makeRFEdge(newRfId, `loss-${lid}`, true))
    } catch (_) {}
  }
  // LS hazard links are auto-inherited from UCA on creation — use server response.
  // Other node types (UCA, SC) use snapshot hazard_ids to recreate explicit links.
  const hazardIdsForLinks = nodeType === 'loss_scenario'
    ? (newNodeData.hazard_ids || [])
    : (nodeData.hazard_ids || [])
  for (const hid of hazardIdsForLinks) {
    const fromType = nodeType === 'uca' ? 'uca' : nodeType
    try {
      if (nodeType !== 'loss_scenario') {
        await createLink(projectId, fromType, newNodeId, 'hazard', hid)
      }
      store.addRFEdge(makeRFEdge(newRfId, `hazard-${hid}`, true))
    } catch (_) {}
  }
  if (nodeType === 'system_constraint' && payload.linked_hazard_id) {
    store.addRFEdge(makeRFEdge(newRfId, `hazard-${payload.linked_hazard_id}`, true))
  }

  // newNodeData from the server has empty reference arrays (links didn't exist yet when it
  // was created), so the spread in addRFNode wiped out the snapshot's hazard_ids/loss_ids.
  // Patch them back now that all createLink calls are done.
  const restoredRefs = {}
  if (nodeData.loss_ids?.length) restoredRefs.loss_ids = nodeData.loss_ids
  if (nodeType !== 'loss_scenario' && hazardIdsForLinks.length) restoredRefs.hazard_ids = hazardIdsForLinks
  if (Object.keys(restoredRefs).length) store.updateRFNode(newRfId, restoredRefs)

  // Restore parent→child connections for nodes that were orphaned when this node was deleted.
  // Only process direct orphans (FK_PARENT_TYPE[fkField] === nodeType); skip cascaded
  // relabeled descendants whose FK was never nulled.
  for (const { nodeType: childType, id: childId } of (snapshot.orphaned || [])) {
    const fkField = ORPHAN_NULL_FIELD[childType]
    if (!fkField || FK_PARENT_TYPE[fkField] !== nodeType) continue
    const childRfId = `${nodeTypeToPrefix(childType)}-${childId}`
    try {
      const res = await updateNode(projectId, childType, childId, { [fkField]: newNodeId })
      const updatedChild = res[childType] || res.node || res
      store.updateRFNode(childRfId, { [fkField]: newNodeId, ...(updatedChild.label ? { label: updatedChild.label } : {}) })
      store.addRFEdge(makeRFEdge(newRfId, childRfId, false))
      // Propagate any label cascade to descendants
      ;(updatedChild.relabeled || []).forEach(({ nodeType: rnt, id: rid, label: rlabel }) => {
        store.updateRFNode(`${nodeTypeToPrefix(rnt)}-${rid}`, { label: rlabel })
      })
    } catch (_) {}
  }

  return { newRfId, newNodeId, newNodeData }
}

function CanvasInner({ projectId, renderMode = false, initialCrossRefs = false }) {
  const reactFlow = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const nodes = useCanvasStore(s => s.nodes)
  const edges = useCanvasStore(s => s.edges)
  const setSelectedNode = useCanvasStore(s => s.setSelectedNode)
  const selectedNode = useCanvasStore(s => s.selectedNode)
  const viewOnly = useCanvasStore(s => s.viewOnly)
  const darkMode = useCanvasStore(s => s.darkMode)
  const focusNodeId = useCanvasStore(s => s.focusNodeId)
  const clearFocusNode = useCanvasStore(s => s.clearFocusNode)
  const [addFormType, setAddFormType] = useState(null)
  const [viewportCenter, setViewportCenter] = useState(null)
  const [fitDone, setFitDone] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [selectionCount, setSelectionCount] = useState(0)
  const [singleGroupSelected, setSingleGroupSelected] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [showCrossRefs, setShowCrossRefs] = useState(initialCrossRefs)
  // { [userId]: { rfNodeId, username, avatarColor } }
  const [remoteSelections, setRemoteSelections] = useState({})
  // { [userId]: { x, y, username, avatarColor } }
  const [remoteCursors, setRemoteCursors] = useState({})
  const dragStartPos = useRef({})
  const pendingChildRestore = useRef(new Map())
  const containerRef = useRef(null)
  const cursorThrottleRef = useRef(null)

  // Fit view on initial load
  useEffect(() => {
    if (!fitDone && nodes.length > 0) {
      setTimeout(() => {
        reactFlow.fitView({ padding: 0.1, duration: 500 })
        setFitDone(true)
      }, 100)
    }
  }, [nodes.length, fitDone, reactFlow])

  // Handle focus node from sidebar
  useEffect(() => {
    if (focusNodeId) {
      const node = nodes.find(n => n.id === focusNodeId)
      if (node) {
        reactFlow.setCenter(node.position.x + 90, node.position.y + 50, { zoom: 1.2, duration: 400 })
      }
      clearFocusNode()
    }
  }, [focusNodeId, nodes, reactFlow, clearFocusNode])

  // Remote presence: selections + cursors
  useEffect(() => {
    function onUserSelect({ user_id, username, avatar_color, rf_node_id }) {
      setRemoteSelections(prev => {
        if (!rf_node_id) {
          const next = { ...prev }
          delete next[user_id]
          return next
        }
        return { ...prev, [user_id]: { rfNodeId: rf_node_id, username, avatarColor: avatar_color } }
      })
    }
    function onCursorMove({ user_id, username, avatar_color, x, y }) {
      setRemoteCursors(prev => ({ ...prev, [user_id]: { x, y, username, avatarColor: avatar_color } }))
    }
    function onPresenceUpdate({ active_users = [] }) {
      const live = new Set(active_users.map(u => u.user_id))
      setRemoteSelections(prev => {
        const next = {}
        for (const [id, v] of Object.entries(prev)) if (live.has(Number(id))) next[id] = v
        return next
      })
      setRemoteCursors(prev => {
        const next = {}
        for (const [id, v] of Object.entries(prev)) if (live.has(Number(id))) next[id] = v
        return next
      })
    }
    function onProjectUpdated({ title, icon_color, purpose_statement }) {
      const update = {}
      if (title !== undefined) update.title = title
      if (icon_color !== undefined) update.icon_color = icon_color
      if (purpose_statement !== undefined) update.purpose_statement = purpose_statement
      const state = useCanvasStore.getState()
      state.patchCurrentProject(update)
      // Also patch the root RF node so RootNode re-renders with the new values
      const rootNode = state.nodes.find(n => n.type === 'rootNode')
      if (rootNode) state.updateRFNode(rootNode.id, update)
    }
    socket.on('user:select', onUserSelect)
    socket.on('cursor:move', onCursorMove)
    socket.on('presence:update', onPresenceUpdate)
    socket.on('project:updated', onProjectUpdated)
    return () => {
      socket.off('user:select', onUserSelect)
      socket.off('cursor:move', onCursorMove)
      socket.off('presence:update', onPresenceUpdate)
      socket.off('project:updated', onProjectUpdated)
    }
  }, [])

  // Stable unless darkMode flips, so the MiniMap doesn't re-render on unrelated
  // CanvasInner renders (and never on pan, since CanvasInner no longer tracks viewport).
  const minimapStyle = useMemo(() => ({
    background: darkMode ? '#262626' : '#f8fafc',
    border: `1px solid ${darkMode ? '#404040' : '#e2e8f0'}`,
    borderRadius: 8,
    overflow: 'hidden',
  }), [darkMode])

  const visibleNodes = useMemo(() => nodes.filter(n => !n.data?.hidden), [nodes])
  const visibleEdges = useMemo(() => edges.filter(e => !e.hidden), [edges])

  // Cross-reference edges (dashed) are hidden by default to reduce rendered edge count.
  // When a node is selected, its own cross-refs are always shown.
  // showCrossRefs toggle reveals all of them.
  // Selection highlight/dim is folded into each edge's `data.selKind` HERE (once per
  // selection change) rather than read via a per-edge Zustand subscription. With
  // thousands of cross-ref edges, a live subscription in every edge would re-run
  // thousands of selectors on every store write (including each drag frame). Computing
  // it in this memo means edges only reconcile when the selection actually changes.
  const displayEdges = useMemo(() => {
    const nodeId = selectedNode?.id
    const filtered = showCrossRefs
      ? visibleEdges
      : visibleEdges.filter(e => {
          if (!e.style?.strokeDasharray) return true
          return nodeId && (e.source === nodeId || e.target === nodeId)
        })
    if (!nodeId) return filtered
    return filtered.map(e => {
      const connected = e.source === nodeId || e.target === nodeId
      return {
        ...e,
        zIndex: connected ? 10 : e.zIndex,
        data: { ...e.data, selKind: connected ? 'connected' : 'dimmed' },
      }
    })
  }, [visibleEdges, selectedNode, showCrossRefs])

  // ── Render mode (headless-Chromium screenshot target) ─────────────────────────
  // Hide all on-canvas chrome via CSS (panels, minimap, controls), fit the graph once
  // node dimensions are known, then flip window.__EXPORT_READY__ so the worker knows
  // it's safe to capture. Kept as one isolated effect so the interactive path is untouched.
  useEffect(() => {
    if (!renderMode) return
    const styleId = 'rf-render-mode'
    if (!document.getElementById(styleId)) {
      const el = document.createElement('style')
      el.id = styleId
      el.textContent = `
        .react-flow__panel, .react-flow__minimap, .react-flow__controls,
        .react-flow__background { pointer-events: none; }
        .react-flow__panel, .react-flow__minimap, .react-flow__controls { display: none !important; }
      `
      document.head.appendChild(el)
    }
  }, [renderMode])

  useEffect(() => {
    if (!renderMode) return
    if (!nodesInitialized || visibleNodes.length === 0) return
    // Publish the graph's model-space bounding box and a direct viewport setter so the
    // screenshot worker can size the output canvas to the content and place it exactly,
    // instead of relying on fitView (whose result depends on container-size timing).
    const visibleRFNodes = reactFlow.getNodes().filter(n => !n.data?.hidden)
    const bounds = getNodesBounds(visibleRFNodes)
    window.__EXPORT_BOUNDS__ = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
    window.__rfSetViewport = (vp) => reactFlow.setViewport(vp, { duration: 0 })
    // Export exact absolute positions + measured sizes for every node so the
    // server-side cross-ref overlay can compute pixel-accurate edge paths.
    // getNodesBounds per node uses positionAbsolute internally, so grouped
    // nodes return correct absolute coords even when position is parent-relative.
    const exportNodes = {}
    visibleRFNodes.forEach(n => {
      const b = getNodesBounds([n])
      exportNodes[n.id] = { x: b.x, y: b.y, w: b.width, h: b.height }
    })
    window.__EXPORT_NODES__ = exportNodes
    // Default fit so the page isn't empty even if the worker never resizes.
    reactFlow.fitView({ padding: 0.1, duration: 0 })
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { window.__EXPORT_READY__ = true })
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [renderMode, nodesInitialized, visibleNodes.length, showCrossRefs, reactFlow])

  // Expose cross-ref toggle for the screenshot worker so it can enable cross-refs
  // AFTER the initial page load (avoids crashing the browser with thousands of edges
  // all mounting simultaneously during first render).
  useEffect(() => {
    if (!renderMode) return
    window.__setShowCrossRefs = (val) => setShowCrossRefs(val)
    return () => { delete window.__setShowCrossRefs }
  }, [renderMode])

  // Empty dep arrays: read current state via getState() so these callbacks are created
  // once and never recreated. Stable references prevent React Flow from re-reconciling
  // on every state change, which is critical during fast drag events.
  const onNodesChange = useCallback((changes) => {
    // Intercept the final position update RF fires after drag-end for children whose drag
    // was redirected to move the root ancestor — restore them to their original relative pos.
    const restore = pendingChildRestore.current
    const mapped = restore.size > 0
      ? changes.map(c => {
          if (c.type === 'position' && restore.has(c.id)) {
            const orig = restore.get(c.id)
            restore.delete(c.id)
            return { ...c, position: orig }
          }
          return c
        })
      : changes
    const newNodes = applyNodeChanges(mapped, useCanvasStore.getState().nodes)
    useCanvasStore.setState({ nodes: newNodes })
  }, [])

  const onEdgesChange = useCallback((changes) => {
    const newEdges = applyEdgeChanges(changes, useCanvasStore.getState().edges)
    useCanvasStore.setState({ edges: newEdges })
  }, [])

  const onNodeClick = useCallback((e, node) => {
    setSelectedNode(node)
    socket.emit('user:select', { project_id: projectId, rf_node_id: node.id })
  }, [setSelectedNode, projectId])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
    socket.emit('user:select', { project_id: projectId, rf_node_id: null })
  }, [setSelectedNode, projectId])

  const onMouseMove = useCallback((e) => {
    if (cursorThrottleRef.current) return
    cursorThrottleRef.current = setTimeout(() => { cursorThrottleRef.current = null }, 50)
    if (!containerRef.current) return
    const flowPos = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    socket.emit('cursor:move', { project_id: projectId, x: flowPos.x, y: flowPos.y })
  }, [projectId, reactFlow])

  const onSelectionChange = useCallback(({ nodes }) => {
    const visible = nodes.filter(n => !n.data?.hidden)
    const selectedGroupIds = new Set(visible.filter(n => n.type === 'groupNode').map(n => n.id))
    // Exclude nodes that are children of a selected group (they're auto-selected on drag)
    const effective = visible.filter(n => !selectedGroupIds.has(n.parentId))
    setSelectionCount(effective.length)
    setSingleGroupSelected(effective.length === 1 && effective[0].type === 'groupNode')
  }, [])

  const onNodeDragStart = useCallback((e, node, draggedNodes) => {
    const all = draggedNodes?.length > 1 ? draggedNodes : [node]
    const allNodes = useCanvasStore.getState().nodes
    all.forEach(n => {
      dragStartPos.current[n.id] = { ...n.position }
      // Also capture the root ancestor's position so onNodeDrag can move it in real-time
      if (n.parentId) {
        const root = findRootAncestor(n.id, allNodes)
        if (root && !dragStartPos.current[root.id]) {
          dragStartPos.current[root.id] = { ...root.position }
        }
      }
    })
  }, [])

  // Called every frame during drag. For children of groups, move the root ancestor in
  // real-time and snap the child back via reactFlow.setNodes so the whole group moves
  // as a unit instead of the child drifting within its parent.
  const onNodeDrag = useCallback((e, node, draggedNodes) => {
    const all = draggedNodes?.length > 1 ? draggedNodes : [node]
    const draggedIds = new Set(all.map(n => n.id))
    const childrenMovingRoot = all.filter(n => n.parentId && !draggedIds.has(n.parentId))
    if (childrenMovingRoot.length === 0) return

    const allNodes = useCanvasStore.getState().nodes
    const rootMoves = new Map() // rootId → newPos
    const childrenToSnap = []

    for (const child of childrenMovingRoot) {
      const startPos = dragStartPos.current[child.id]
      if (!startPos) continue
      // RF always reports position as startPos + totalMouseDelta regardless of setNodes calls
      const delta = { x: child.position.x - startPos.x, y: child.position.y - startPos.y }

      const root = findRootAncestor(child.id, allNodes)
      if (!root) continue
      const rootStartPos = dragStartPos.current[root.id]
      if (!rootStartPos || rootMoves.has(root.id)) continue

      rootMoves.set(root.id, { x: rootStartPos.x + delta.x, y: rootStartPos.y + delta.y })
      childrenToSnap.push({ id: child.id, pos: startPos })
    }

    if (rootMoves.size === 0) return

    // Snap children in RF's internal store (bypasses onNodesChange, prevents double-movement)
    reactFlow.setNodes(nodes => nodes.map(n => {
      const snap = childrenToSnap.find(c => c.id === n.id)
      return snap ? { ...n, position: snap.pos } : n
    }))

    // Move root ancestors in Zustand (triggers re-render → group frame slides in real-time)
    useCanvasStore.setState(state => ({
      nodes: state.nodes.map(n => {
        const newPos = rootMoves.get(n.id)
        return newPos ? { ...n, position: newPos } : n
      }),
    }))
  }, [reactFlow])

  const onNodeDragStop = useCallback(async (e, node, draggedNodes) => {
    const all = draggedNodes?.length > 1 ? draggedNodes : [node]
    const allNodes = useCanvasStore.getState().nodes

    // Snapshot and clear start positions before any async work (including root ancestors)
    const startPositions = {}
    all.forEach(n => {
      startPositions[n.id] = dragStartPos.current[n.id]
      delete dragStartPos.current[n.id]
      if (n.parentId) {
        const root = findRootAncestor(n.id, allNodes)
        if (root && !startPositions[root.id]) {
          startPositions[root.id] = dragStartPos.current[root.id]
          delete dragStartPos.current[root.id]
        }
      }
    })

    const historyMoves = []
    const draggedIds = new Set(all.map(n => n.id))

    // Children whose root ancestor is NOT also being dragged → onNodeDrag already moved the root
    const childrenMovingRoot = all.filter(n => n.parentId && !draggedIds.has(n.parentId))
    const normalNodes = all.filter(n => !childrenMovingRoot.includes(n))

    // Mark children so the final RF onNodesChange (dragging:false) restores their relative positions
    childrenMovingRoot.forEach(child => {
      const startPos = startPositions[child.id]
      if (startPos) pendingChildRestore.current.set(child.id, startPos)
    })

    // Persist each unique root ancestor's position (already updated in real-time by onNodeDrag)
    const processedRoots = new Set()
    for (const child of childrenMovingRoot) {
      const root = findRootAncestor(child.id, allNodes)
      if (!root || processedRoots.has(root.id)) continue
      processedRoots.add(root.id)

      const rootCurrentPos = { x: root.position.x, y: root.position.y }
      const rootStartPos = startPositions[root.id]
      if (!rootStartPos) continue
      if (Math.abs(rootCurrentPos.x - rootStartPos.x) < 0.5 && Math.abs(rootCurrentPos.y - rootStartPos.y) < 0.5) continue

      historyMoves.push({ rfId: root.id, nodeType: 'group', nodeId: root.data.groupId, projectId, oldPos: rootStartPos, newPos: rootCurrentPos })
      try {
        await updateGroup(projectId, root.data.groupId, { x: rootCurrentPos.x, y: rootCurrentPos.y })
        socket.emit('group:moved', { project_id: projectId, group_rf_id: root.id, x: rootCurrentPos.x, y: rootCurrentPos.y })
      } catch (err) {
        console.error('Failed to persist group position after child drag:', err)
      }
    }

    // Process groups and standalone nodes normally
    await Promise.all(normalNodes.map(async n => {
      const parts = n.id.split('-')
      const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
      const nodeId = parseInt(parts[parts.length - 1])
      if (!nodeType) return
      const oldPos = startPositions[n.id]
      const newPos = { x: n.position.x, y: n.position.y }
      try {
        if (nodeType === 'root') {
          await updateProject(projectId, { root_x: newPos.x, root_y: newPos.y })
        } else if (nodeType === 'group') {
          await updateGroup(projectId, nodeId, newPos)
          socket.emit('group:moved', { project_id: projectId, group_rf_id: n.id, x: newPos.x, y: newPos.y })
          if (oldPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
            historyMoves.push({ rfId: n.id, nodeType, nodeId, projectId, oldPos, newPos })
          }
        } else {
          await updateNode(projectId, nodeType, nodeId, newPos)
          socket.emit('node:moved', { project_id: projectId, node_type: nodeType, node_id: nodeId, ...newPos })
          if (oldPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
            historyMoves.push({ rfId: n.id, nodeType, nodeId, projectId, oldPos, newPos })
          }
        }
      } catch (err) {
        console.error('Failed to persist node position:', err)
      }
    }))

    if (historyMoves.length === 1) {
      useCanvasStore.getState().pushHistory({ action: 'move', ...historyMoves[0] })
    } else if (historyMoves.length > 1) {
      useCanvasStore.getState().pushHistory({ action: 'batchMove', moves: historyMoves })
    }
  }, [projectId])

  // Keyboard shortcuts: Delete, Ctrl+C/V, Ctrl+Z/Y
  useEffect(() => {
    const RF_TYPE_MAP = {
      loss: 'lossNode', hazard: 'hazardNode', system_constraint: 'scNode',
      control_action: 'caNode', uca: 'ucaNode', loss_scenario: 'lsNode',
    }

    async function onKeyDown(e) {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (useCanvasStore.getState().viewOnly) return

      const ctrl = e.ctrlKey || e.metaKey
      const store = useCanvasStore.getState()

      // ── Delete selected node(s) ───────────────────────────────────────
      if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
        const allSelected = reactFlow.getNodes().filter(n => n.selected && n.data.nodeType !== 'root')
        const selectedGroups = allSelected.filter(n => n.type === 'groupNode')
        const selectedGroupIds = new Set(selectedGroups.map(n => n.id))
        // Exclude children of selected groups from individual deletion
        const selectedNodes = allSelected.filter(n => n.type !== 'groupNode' && !selectedGroupIds.has(n.parentId))
        if (allSelected.length === 0) return
        e.preventDefault()
        // Groups: ungroup (non-destructive — releases members, removes frame only)
        for (const groupNode of selectedGroups) {
          try {
            const result = await deleteGroup(projectId, groupNode.data.groupId)
            const memberUpdates = result.released_members.map(({ node_type, node_id, abs_x, abs_y }) => ({
              rfNodeId: node_type === 'group' ? `group-${node_id}` : `${nodeTypeToPrefix(node_type)}-${node_id}`,
              absX: abs_x,
              absY: abs_y,
            }))
            useCanvasStore.getState().ungroupRFNodes(`group-${groupNode.data.groupId}`, memberUpdates)
            socket.emit('group:deleted', { project_id: projectId, group_rf_id: `group-${groupNode.data.groupId}`, group_id: groupNode.data.groupId, released_members: result.released_members })
            useCanvasStore.getState().pushHistory({
              action: 'ungroup',
              groupRfId: `group-${groupNode.data.groupId}`,
              groupId: groupNode.data.groupId,
              projectId,
              groupRFNode: groupNode,
              memberUpdates: result.released_members.map(({ node_type, node_id, abs_x, abs_y }) => {
                const rfNodeId = node_type === 'group' ? `group-${node_id}` : `${nodeTypeToPrefix(node_type)}-${node_id}`
                const relX = abs_x - groupNode.position.x
                const relY = abs_y - groupNode.position.y
                return { rfNodeId, relX, relY }
              }),
            })
          } catch (err) { console.error('Ungroup failed:', err) }
        }
        // Regular nodes: confirm then delete
        if (selectedNodes.length > 0) {
          const confirmMsg = selectedNodes.length === 1 ? 'Delete this node?' : `Delete ${selectedNodes.length} nodes?`
          if (!window.confirm(confirmMsg)) { store.setSelectedNode(null); return }
          // Track which groups need resizing after all deletions
          const groupsToResize = new Map()
          for (const node of selectedNodes) {
            if (node.parentId?.startsWith('group-')) {
              if (!groupsToResize.has(node.parentId)) {
                const currentChildren = reactFlow.getNodes().filter(n => n.parentId === node.parentId && !n.data?.hidden)
                groupsToResize.set(node.parentId, new Map(currentChildren.map(n => [n.id, n])))
              }
              groupsToResize.get(node.parentId).delete(node.id)
            }
          }
          for (const node of selectedNodes) {
            const { nodeType, id: nodeId } = node.data
            const snapshot = {
              nodeData: { ...node.data },
              position: { ...node.position },
              rfNodeType: node.type,
            }
            try {
              const result = await deleteNode(projectId, nodeType, nodeId)
              snapshot.orphaned = result?.orphaned || []
              socket.emit('node:deleted', { project_id: projectId, node_type: nodeType, node_id: nodeId })
              store.removeRFNode(node.id)
              store.pushHistory({ action: 'delete', rfId: node.id, nodeType, nodeId, projectId, snapshot })
              ;(result?.orphaned || []).forEach(({ nodeType: nt, id, label }) => {
                const nullField = ORPHAN_NULL_FIELD[nt]
                const prefix = nodeTypeToPrefix(nt)
                store.updateRFNode(`${prefix}-${id}`, { label, ...(nullField ? { [nullField]: null } : {}) })
              })
            } catch (err) { console.error('Delete failed:', err) }
          }
          // Resize (or auto-delete) any groups that lost members
          for (const [groupRfId, childrenMap] of groupsToResize) {
            await resizeGroupAfterDelete(groupRfId, Array.from(childrenMap.values()))
          }
        }
        store.setSelectedNode(null)
        return
      }

      // ── Undo (Ctrl+Z) ─────────────────────────────────────────────────
      if (ctrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const { moveHistory, moveHistoryIndex } = store
        if (moveHistoryIndex < 0) return
        const entry = moveHistory[moveHistoryIndex]
        try {
          if (entry.action === 'move') {
            if (entry.nodeType === 'group') {
              await updateGroup(entry.projectId, entry.nodeId, { x: entry.oldPos.x, y: entry.oldPos.y })
            } else {
              await updateNode(entry.projectId, entry.nodeType, entry.nodeId, { x: entry.oldPos.x, y: entry.oldPos.y })
              socket.emit('node:moved', { project_id: entry.projectId, node_type: entry.nodeType, node_id: entry.nodeId, x: entry.oldPos.x, y: entry.oldPos.y })
            }
            store.moveRFNode(entry.rfId, entry.oldPos.x, entry.oldPos.y)
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'batchMove') {
            store.moveMultipleRFNodes(entry.moves.map(m => ({ rfId: m.rfId, x: m.oldPos.x, y: m.oldPos.y })))
            await Promise.all(entry.moves.map(m =>
              (m.nodeType === 'group'
                ? updateGroup(m.projectId, m.nodeId, { x: m.oldPos.x, y: m.oldPos.y })
                : updateNode(m.projectId, m.nodeType, m.nodeId, { x: m.oldPos.x, y: m.oldPos.y })
                    .then(() => socket.emit('node:moved', { project_id: m.projectId, node_type: m.nodeType, node_id: m.nodeId, x: m.oldPos.x, y: m.oldPos.y }))
              ).catch(() => {})
            ))
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'create') {
            await deleteNode(entry.projectId, entry.nodeType, entry.nodeId)
            store.removeRFNode(entry.rfId)
            socket.emit('node:deleted', { project_id: entry.projectId, node_type: entry.nodeType, node_id: entry.nodeId })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'delete') {
            const { newRfId, newNodeId, newNodeData } = await recreateNode(entry)
            store.updateHistoryEntry(moveHistoryIndex, { rfId: newRfId, nodeId: newNodeId })
            socket.emit('node:added', { project_id: entry.projectId, node_type: entry.snapshot.nodeData.nodeType, node_data: newNodeData, position: entry.snapshot.position })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'group') {
            // Undo group creation: delete the group (ungroup its members)
            const result = await deleteGroup(entry.projectId, entry.groupId)
            const memberUpdates = result.released_members.map(({ node_type, node_id, abs_x, abs_y }) => ({
              rfNodeId: node_type === 'group' ? `group-${node_id}` : `${nodeTypeToPrefix(node_type)}-${node_id}`,
              absX: abs_x, absY: abs_y,
            }))
            store.ungroupRFNodes(entry.groupRfId, memberUpdates)
            socket.emit('group:deleted', { project_id: entry.projectId, group_rf_id: entry.groupRfId, group_id: entry.groupId, released_members: result.released_members })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'ungroup') {
            // Undo ungroup: recreate the group
            const members = entry.memberUpdates.map(u => {
              const parts = u.rfNodeId.split('-')
              return { node_type: RF_PREFIX_TO_TYPE[parts[0]], node_id: parseInt(parts[parts.length - 1]), rel_x: u.relX, rel_y: u.relY }
            })
            const { x: gx, y: gy } = entry.groupRFNode.position
            const { width: gw, height: gh } = entry.groupRFNode.style
            const result = await createGroup(entry.projectId, { label: entry.groupRFNode.data.label || '', x: gx, y: gy, width: gw, height: gh, members })
            const newGroup = result.group
            const newRfId = `group-${newGroup.id}`
            const newGroupRFNode = { ...entry.groupRFNode, id: newRfId, data: { ...entry.groupRFNode.data, groupId: newGroup.id } }
            store.groupRFNodes(newGroupRFNode, entry.memberUpdates)
            store.updateHistoryEntry(moveHistoryIndex, { groupRfId: newRfId, groupId: newGroup.id, groupRFNode: newGroupRFNode })
            socket.emit('group:created', { project_id: entry.projectId, group: newGroup, group_rf_node: newGroupRFNode, member_updates: entry.memberUpdates })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          }
        } catch (err) { console.error('Undo failed:', err) }
        return
      }

      // ── Redo (Ctrl+Y or Ctrl+Shift+Z) ─────────────────────────────────
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        const { moveHistory, moveHistoryIndex } = store
        if (moveHistoryIndex >= moveHistory.length - 1) return
        const entry = moveHistory[moveHistoryIndex + 1]
        try {
          if (entry.action === 'move') {
            if (entry.nodeType === 'group') {
              await updateGroup(entry.projectId, entry.nodeId, { x: entry.newPos.x, y: entry.newPos.y })
            } else {
              await updateNode(entry.projectId, entry.nodeType, entry.nodeId, { x: entry.newPos.x, y: entry.newPos.y })
              socket.emit('node:moved', { project_id: entry.projectId, node_type: entry.nodeType, node_id: entry.nodeId, x: entry.newPos.x, y: entry.newPos.y })
            }
            store.moveRFNode(entry.rfId, entry.newPos.x, entry.newPos.y)
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'batchMove') {
            store.moveMultipleRFNodes(entry.moves.map(m => ({ rfId: m.rfId, x: m.newPos.x, y: m.newPos.y })))
            await Promise.all(entry.moves.map(m =>
              (m.nodeType === 'group'
                ? updateGroup(m.projectId, m.nodeId, { x: m.newPos.x, y: m.newPos.y })
                : updateNode(m.projectId, m.nodeType, m.nodeId, { x: m.newPos.x, y: m.newPos.y })
                    .then(() => socket.emit('node:moved', { project_id: m.projectId, node_type: m.nodeType, node_id: m.nodeId, x: m.newPos.x, y: m.newPos.y }))
              ).catch(() => {})
            ))
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'create') {
            const { newRfId, newNodeId, newNodeData } = await recreateNode(entry)
            store.updateHistoryEntry(moveHistoryIndex + 1, { rfId: newRfId, nodeId: newNodeId })
            socket.emit('node:added', { project_id: entry.projectId, node_type: entry.snapshot.nodeData.nodeType, node_data: newNodeData, position: entry.snapshot.position })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'delete') {
            await deleteNode(entry.projectId, entry.nodeType, entry.nodeId)
            store.removeRFNode(entry.rfId)
            socket.emit('node:deleted', { project_id: entry.projectId, node_type: entry.nodeType, node_id: entry.nodeId })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'group') {
            // Redo group creation: recreate the group
            const members = entry.memberUpdates.map(u => {
              const parts = u.rfNodeId.split('-')
              return { node_type: RF_PREFIX_TO_TYPE[parts[0]], node_id: parseInt(parts[parts.length - 1]), rel_x: u.relX, rel_y: u.relY }
            })
            const { x: gx, y: gy } = entry.groupRFNode.position
            const { width: gw, height: gh } = entry.groupRFNode.style
            const result = await createGroup(entry.projectId, { label: entry.groupRFNode.data.label || '', x: gx, y: gy, width: gw, height: gh, members })
            const newGroup = result.group
            const newRfId = `group-${newGroup.id}`
            const newGroupRFNode = { ...entry.groupRFNode, id: newRfId, data: { ...entry.groupRFNode.data, groupId: newGroup.id } }
            store.groupRFNodes(newGroupRFNode, entry.memberUpdates)
            store.updateHistoryEntry(moveHistoryIndex + 1, { groupRfId: newRfId, groupId: newGroup.id, groupRFNode: newGroupRFNode })
            socket.emit('group:created', { project_id: entry.projectId, group: newGroup, group_rf_node: newGroupRFNode, member_updates: entry.memberUpdates })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'ungroup') {
            // Redo ungroup: delete the group
            const result = await deleteGroup(entry.projectId, entry.groupId)
            const memberUpdates = result.released_members.map(({ node_type, node_id, abs_x, abs_y }) => ({
              rfNodeId: node_type === 'group' ? `group-${node_id}` : `${nodeTypeToPrefix(node_type)}-${node_id}`,
              absX: abs_x, absY: abs_y,
            }))
            store.ungroupRFNodes(entry.groupRfId, memberUpdates)
            socket.emit('group:deleted', { project_id: entry.projectId, group_rf_id: entry.groupRfId, group_id: entry.groupId, released_members: result.released_members })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          }
        } catch (err) { console.error('Redo failed:', err) }
        return
      }

      // ── Arrow keys: move selected nodes ───────────────────────────────
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !ctrl) {
        const selected = reactFlow.getNodes().filter(n => n.selected && n.data?.nodeType !== 'root' && !n.data?.hidden)
        if (selected.length === 0) return
        e.preventDefault()
        const step = e.shiftKey ? 20 : 2
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        const updates = selected.map(n => ({ rfId: n.id, x: n.position.x + dx, y: n.position.y + dy }))
        const historyMoves = updates.map(({ rfId, x, y }) => {
          const n = selected.find(s => s.id === rfId)
          const parts = rfId.split('-')
          const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
          const nodeId = parseInt(parts[parts.length - 1])
          return { rfId, nodeType, nodeId, projectId, oldPos: { x: n.position.x, y: n.position.y }, newPos: { x, y } }
        })
        store.moveMultipleRFNodes(updates)
        store.pushHistory(historyMoves.length === 1
          ? { action: 'move', ...historyMoves[0] }
          : { action: 'batchMove', moves: historyMoves }
        )
        await Promise.all(historyMoves.map(m =>
          (m.nodeType === 'group'
            ? updateGroup(m.projectId, m.nodeId, { x: m.newPos.x, y: m.newPos.y })
            : updateNode(m.projectId, m.nodeType, m.nodeId, { x: m.newPos.x, y: m.newPos.y })
                .then(() => socket.emit('node:moved', { project_id: m.projectId, node_type: m.nodeType, node_id: m.nodeId, x: m.newPos.x, y: m.newPos.y }))
          ).catch(err => console.error('Arrow move failed:', err))
        ))
        return
      }

      // ── Copy selected node (Ctrl+C) ────────────────────────────────────
      if (ctrl && e.key === 'c') {
        const { selectedNode } = store
        if (!selectedNode || selectedNode.data.nodeType === 'root' || selectedNode.type === 'groupNode') return
        store.setCopiedNode(selectedNode)
        return
      }

      // ── Paste node (Ctrl+V) ────────────────────────────────────────────
      if (ctrl && e.key === 'v') {
        const { copiedNode, currentProject } = store
        if (!copiedNode) return
        e.preventDefault()
        const nodeType = copiedNode.data.nodeType
        const nodeData = copiedNode.data
        const position = { x: copiedNode.position.x + 40, y: copiedNode.position.y + 40 }

        const payload = {}
        if (nodeData.description) payload.description = nodeData.description
        if (nodeData.name) payload.name = nodeData.name
        if (nodeData.uca_type) payload.uca_type = nodeData.uca_type
        if (nodeData.control_action_id) payload.control_action_id = parseInt(nodeData.control_action_id)
        if (nodeData.uca_id) payload.uca_id = parseInt(nodeData.uca_id)
        if (nodeData.parent_hazard_id) payload.parent_hazard_id = parseInt(nodeData.parent_hazard_id)
        if (nodeData.linked_hazard_id) payload.linked_hazard_id = parseInt(nodeData.linked_hazard_id)

        try {
          const result = await createNode(projectId, nodeType, payload)
          const newData = result[nodeType] || result.node || result
          const prefix = nodeTypeToPrefix(nodeType)
          const rfNode = {
            id: `${prefix}-${newData.id}`,
            type: RF_TYPE_MAP[nodeType] || 'lossNode',
            position,
            data: { ...newData, nodeType },
          }
          store.addRFNode(rfNode)
          if (nodeType === 'loss' && currentProject?.id)
            store.addRFEdge(makeRFEdge(`root-${currentProject.id}`, `loss-${newData.id}`, false))
          else if (nodeType === 'hazard' && payload.parent_hazard_id)
            store.addRFEdge(makeRFEdge(`hazard-${payload.parent_hazard_id}`, `hazard-${newData.id}`, false))
          else if (nodeType === 'uca' && payload.control_action_id)
            store.addRFEdge(makeRFEdge(`ca-${payload.control_action_id}`, `uca-${newData.id}`, false))
          else if (nodeType === 'loss_scenario' && payload.uca_id)
            store.addRFEdge(makeRFEdge(`uca-${payload.uca_id}`, `ls-${newData.id}`, false))
          store.setCopiedNode({ ...copiedNode, position })
          store.pushHistory({
            action: 'create',
            rfId: rfNode.id,
            nodeType,
            nodeId: newData.id,
            projectId,
            snapshot: { nodeData: { ...newData, nodeType }, position, rfNodeType: rfNode.type },
          })
        } catch (err) { console.error('Paste failed:', err) }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [projectId])

  function openAddForm(nodeType) {
    let center = null
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      center = reactFlow.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
    }
    setViewportCenter(center)
    setAddFormType(nodeType)
  }

  async function applyAlignPositions(updates) {
    const store = useCanvasStore.getState()
    // Capture old positions for undo before moving
    const currentNodes = reactFlow.getNodes()
    const nodeMap = new Map(currentNodes.map(n => [n.id, n]))
    const historyMoves = updates
      .map(({ rfId, x, y }) => {
        const n = nodeMap.get(rfId)
        const parts = rfId.split('-')
        const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
        const nodeId = parseInt(parts[parts.length - 1])
        if (!n || !nodeType || nodeType === 'root') return null
        return { rfId, nodeType, nodeId, projectId, oldPos: { x: n.position.x, y: n.position.y }, newPos: { x, y } }
      })
      .filter(Boolean)
    // Single state update for all positions (one re-render instead of N)
    store.moveMultipleRFNodes(updates)
    if (historyMoves.length > 0) {
      store.pushHistory({ action: 'batchMove', moves: historyMoves })
    }
    // Refocus canvas so arrow keys work immediately after align
    containerRef.current?.focus()
    // Persist to DB in parallel
    await Promise.all(historyMoves.map(async ({ rfId, nodeType, nodeId, newPos: { x, y } }) => {
      try {
        if (nodeType === 'group') {
          await updateGroup(projectId, nodeId, { x, y })
        } else {
          await updateNode(projectId, nodeType, nodeId, { x, y })
          socket.emit('node:moved', { project_id: projectId, node_type: nodeType, node_id: nodeId, x, y })
        }
      } catch (err) {
        console.error('Align failed:', err)
      }
    }))
  }

  async function alignNodes(type) {
    const selected = reactFlow.getNodes().filter(n => n.selected && !n.data?.hidden)
    if (selected.length < 2) return
    const nodeW = n => n.type === 'groupNode' ? (n.style?.width ?? 200) : (n.measured?.width ?? 180)
    const nodeH = n => n.type === 'groupNode' ? (n.style?.height ?? 200) : (n.measured?.height ?? 40)
    const minLeft   = Math.min(...selected.map(n => n.position.x))
    const maxRight  = Math.max(...selected.map(n => n.position.x + nodeW(n)))
    const minTop    = Math.min(...selected.map(n => n.position.y))
    const maxBottom = Math.max(...selected.map(n => n.position.y + nodeH(n)))
    const bbCX = (minLeft + maxRight)  / 2
    const bbCY = (minTop  + maxBottom) / 2
    let updates
    if      (type === 'left')    updates = selected.map(n => ({ rfId: n.id, x: minLeft,              y: n.position.y }))
    else if (type === 'right')   updates = selected.map(n => ({ rfId: n.id, x: maxRight - nodeW(n),  y: n.position.y }))
    else if (type === 'centerH') updates = selected.map(n => ({ rfId: n.id, x: bbCX - nodeW(n) / 2, y: n.position.y }))
    else if (type === 'top')     updates = selected.map(n => ({ rfId: n.id, x: n.position.x, y: minTop               }))
    else if (type === 'bottom')  updates = selected.map(n => ({ rfId: n.id, x: n.position.x, y: maxBottom - nodeH(n) }))
    else if (type === 'centerV') updates = selected.map(n => ({ rfId: n.id, x: n.position.x, y: bbCY - nodeH(n) / 2 }))
    else return
    await applyAlignPositions(updates)
  }

  async function distributeNodes(axis) {
    const selected = reactFlow.getNodes().filter(n => n.selected && !n.data?.hidden)
    if (selected.length < 3) return
    let updates
    if (axis === 'h') {
      const sorted = [...selected].sort((a, b) => a.position.x - b.position.x)
      const nodeW = n => n.type === 'groupNode' ? (n.style?.width ?? 200) : (n.measured?.width ?? 180)
      // Keep the outer edges of the first and last nodes fixed; equal gaps between them
      const spanStart = sorted[0].position.x
      const spanEnd   = sorted[sorted.length - 1].position.x + nodeW(sorted[sorted.length - 1])
      const totalNodeW = sorted.reduce((s, n) => s + nodeW(n), 0)
      const gap = (spanEnd - spanStart - totalNodeW) / (sorted.length - 1)
      let x = spanStart
      updates = sorted.map(n => {
        const result = { rfId: n.id, x: Math.round(x), y: n.position.y }
        x += nodeW(n) + gap
        return result
      })
    } else {
      const sorted = [...selected].sort((a, b) => a.position.y - b.position.y)
      const nodeH = n => n.type === 'groupNode' ? (n.style?.height ?? 200) : (n.measured?.height ?? 40)
      const spanStart = sorted[0].position.y
      const spanEnd   = sorted[sorted.length - 1].position.y + nodeH(sorted[sorted.length - 1])
      const totalNodeH = sorted.reduce((s, n) => s + nodeH(n), 0)
      const gap = (spanEnd - spanStart - totalNodeH) / (sorted.length - 1)
      let y = spanStart
      updates = sorted.map(n => {
        const result = { rfId: n.id, x: n.position.x, y: Math.round(y) }
        y += nodeH(n) + gap
        return result
      })
    }
    await applyAlignPositions(updates)
  }

  async function handleGroup() {
    if (isExporting) return
    const GROUP_PAD = 24
    const getNodeW = n => n.type === 'groupNode' ? (n.style?.width ?? 200) : (n.measured?.width ?? 180)
    const getNodeH = n => n.type === 'groupNode' ? (n.style?.height ?? 200) : (n.measured?.height ?? 40)
    const getAbsPos = n => ({
      x: n.internals?.positionAbsolute?.x ?? n.position.x,
      y: n.internals?.positionAbsolute?.y ?? n.position.y,
    })

    const allSelected = reactFlow.getNodes().filter(n => n.selected && n.type !== 'rootNode' && !n.data?.hidden)
    const selectedGroups = allSelected.filter(n => n.type === 'groupNode')
    const selectedGroupIds = new Set(selectedGroups.map(n => n.id))
    // Exclude children of selected groups — they're already contained in the group unit
    const standaloneNodes = allSelected.filter(n => n.type !== 'groupNode' && !selectedGroupIds.has(n.parentId))

    // Need at least 2 effective items to form a group
    const effective = [...standaloneNodes, ...selectedGroups]
    if (effective.length < 2) return

    const minX = Math.min(...effective.map(n => getAbsPos(n).x))
    const minY = Math.min(...effective.map(n => getAbsPos(n).y))
    const maxX = Math.max(...effective.map(n => getAbsPos(n).x + getNodeW(n)))
    const maxY = Math.max(...effective.map(n => getAbsPos(n).y + getNodeH(n)))
    const groupX = minX - GROUP_PAD
    const groupY = minY - GROUP_PAD
    const groupW = (maxX - minX) + 2 * GROUP_PAD
    const groupH = (maxY - minY) + 2 * GROUP_PAD

    const members = effective.map(n => {
      const abs = getAbsPos(n)
      const parts = n.id.split('-')
      const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
      const nodeId = parseInt(parts[parts.length - 1])
      return { node_type: nodeType, node_id: nodeId, rel_x: abs.x - groupX, rel_y: abs.y - groupY }
    })

    try {
      const result = await createGroup(projectId, { label: '', x: groupX, y: groupY, width: groupW, height: groupH, members })
      const group = result.group
      const rfGroupId = `group-${group.id}`
      const groupRFNode = {
        id: rfGroupId,
        type: 'groupNode',
        position: { x: groupX, y: groupY },
        style: { width: groupW, height: groupH },
        data: { label: '', nodeType: 'group', groupId: group.id },
        zIndex: -1,
      }
      const memberUpdates = effective.map(n => {
        const abs = getAbsPos(n)
        return { rfNodeId: n.id, relX: abs.x - groupX, relY: abs.y - groupY }
      })
      useCanvasStore.getState().groupRFNodes(groupRFNode, memberUpdates)
      useCanvasStore.getState().pushHistory({ action: 'group', groupRfId: rfGroupId, groupId: group.id, projectId, groupRFNode, memberUpdates })
      socket.emit('group:created', { project_id: projectId, group: result.group, group_rf_node: groupRFNode, member_updates: memberUpdates })
    } catch (err) {
      console.error('Group failed:', err)
      // eslint-disable-next-line no-alert
      window.alert('Failed to create group: ' + err.message)
    }
  }

  async function resizeGroupAfterDelete(groupRfId, remainingChildren) {
    const GROUP_PAD = 24
    const getNodeW = n => n.type === 'groupNode' ? (n.style?.width ?? 200) : (n.measured?.width ?? 180)
    const getNodeH = n => n.type === 'groupNode' ? (n.style?.height ?? 200) : (n.measured?.height ?? 40)
    // Find group in current RF state (group node is not deleted)
    const groupNode = reactFlow.getNodes().find(n => n.id === groupRfId)
    if (!groupNode) return
    const groupId = groupNode.data.groupId

    if (remainingChildren.length === 0) {
      try {
        await deleteGroup(projectId, groupId)
        useCanvasStore.getState().removeRFNode(groupRfId)
        socket.emit('group:deleted', { project_id: projectId, group_rf_id: groupRfId, group_id: groupId, released_members: [] })
      } catch (err) {
        console.error('Failed to auto-delete empty group:', err)
      }
      return
    }

    // Compute tight bounding box from remaining children (positions are relative to group)
    const relMinX = Math.min(...remainingChildren.map(n => n.position.x))
    const relMinY = Math.min(...remainingChildren.map(n => n.position.y))
    const relMaxX = Math.max(...remainingChildren.map(n => n.position.x + getNodeW(n)))
    const relMaxY = Math.max(...remainingChildren.map(n => n.position.y + getNodeH(n)))

    const offsetX = relMinX - GROUP_PAD
    const offsetY = relMinY - GROUP_PAD
    const newGroupW = (relMaxX - relMinX) + 2 * GROUP_PAD
    const newGroupH = (relMaxY - relMinY) + 2 * GROUP_PAD
    const newGroupX = groupNode.position.x + offsetX
    const newGroupY = groupNode.position.y + offsetY

    const childUpdates = remainingChildren.map(n => ({
      rfNodeId: n.id,
      relX: n.position.x - offsetX,
      relY: n.position.y - offsetY,
    }))

    useCanvasStore.getState().resizeGroupRF(groupRfId, newGroupX, newGroupY, newGroupW, newGroupH, childUpdates)
    socket.emit('group:resized', { project_id: projectId, group_rf_id: groupRfId, group_id: groupId, x: newGroupX, y: newGroupY, width: newGroupW, height: newGroupH, child_updates: childUpdates })

    try {
      await updateGroup(projectId, groupId, { x: newGroupX, y: newGroupY, width: newGroupW, height: newGroupH })
      if (offsetX !== 0 || offsetY !== 0) {
        await Promise.all(childUpdates.map(async cu => {
          const parts = cu.rfNodeId.split('-')
          const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
          const nodeId = parseInt(parts[parts.length - 1])
          if (!nodeType) return
          if (nodeType === 'group') {
            await updateGroup(projectId, nodeId, { x: cu.relX, y: cu.relY })
          } else {
            await updateNode(projectId, nodeType, nodeId, { x: cu.relX, y: cu.relY })
          }
        }))
      }
    } catch (err) {
      console.error('Failed to resize group after delete:', err)
    }
  }

  async function handleUngroup() {
    const selected = reactFlow.getNodes().filter(n => n.selected && n.type === 'groupNode')
    if (selected.length !== 1) return
    const groupNode = selected[0]
    const groupId = groupNode.data.groupId
    try {
      const result = await deleteGroup(projectId, groupId)
      const memberUpdates = result.released_members.map(({ node_type, node_id, abs_x, abs_y }) => ({
        rfNodeId: node_type === 'group' ? `group-${node_id}` : `${nodeTypeToPrefix(node_type)}-${node_id}`,
        absX: abs_x,
        absY: abs_y,
      }))
      useCanvasStore.getState().ungroupRFNodes(`group-${groupId}`, memberUpdates)
      socket.emit('group:deleted', { project_id: projectId, group_rf_id: `group-${groupId}`, group_id: groupId, released_members: result.released_members })
    } catch (err) {
      console.error('Ungroup failed:', err)
      // eslint-disable-next-line no-alert
      window.alert('Failed to ungroup: ' + err.message)
    }
  }

  function _exportUrl(format) {
    const { darkMode, nodes: storeNodes } = useCanvasStore.getState()
    const theme = darkMode ? 'dark' : 'light'
    const hiddenIds = storeNodes
      .filter(n => n.data?.hidden)
      .map(n => n.id)
      .join(',')
    const params = new URLSearchParams({ format, theme, cross_refs: showCrossRefs ? '1' : '0' })
    if (hiddenIds) params.set('hidden', hiddenIds)
    return `/api/projects/${projectId}/export?${params}`
  }

  async function exportScreenshot() {
    if (isExporting) return
    setIsExporting(true)
    try {
      const res = await fetch(_exportUrl('png'))
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const slug = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'export.png'
      a.download = slug
      a.href = url
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PNG export failed:', err)
      // eslint-disable-next-line no-alert
      window.alert(`PNG export failed: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  function handleNodeCreated(newNode) {
    setAddFormType(null)
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-neutral-900" onMouseMove={onMouseMove}>
      <ReactFlow
        nodes={visibleNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={viewOnly ? undefined : onNodeDragStart}
        onNodeDrag={viewOnly ? undefined : onNodeDrag}
        onNodeDragStop={viewOnly ? undefined : onNodeDragStop}
        onSelectionChange={onSelectionChange}
        nodesDraggable={!viewOnly}
        nodesFocusable={false}
        edgesFocusable={false}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'floating' }}
        deleteKeyCode={null}
        minZoom={renderMode ? 0.001 : 0.05}
        onlyRenderVisibleElements={!isExporting && !renderMode}
        selectionOnDrag
        panOnDrag={[1, 2]}
        multiSelectionKeyCode="Shift"
        panActivationKeyCode="Space"
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={20} size={1} color={darkMode ? '#404040' : '#e2e8f0'} />
        <MiniMap
          position="bottom-left"
          nodeColor={minimapNodeColor}
          style={minimapStyle}
          zoomable
          pannable
        />
        <Panel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 12 }}>
          <button
            onClick={() => reactFlow.zoomIn({ duration: 200 })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-700 shadow-sm transition-colors text-lg font-medium"
            title="Zoom In"
          >+</button>
          <button
            onClick={() => reactFlow.zoomOut({ duration: 200 })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-700 shadow-sm transition-colors text-lg font-medium"
            title="Zoom Out"
          >&minus;</button>
          <button
            onClick={() => reactFlow.fitView({ duration: 400, padding: 0.1 })}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-700 shadow-sm transition-colors"
            title="Fit View"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0 0l-5-5m-7 11l-5 5m5-5v4m0-4H4m16 0v4m0-4h-4m0 0l5 5" />
            </svg>
          </button>
        </Panel>

        {/* Add node buttons — hidden in view-only mode */}
        {!viewOnly && (
          <Panel position="top-left" style={{ top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LAYER_BUTTONS.map(btn => (
              <button
                key={btn.nodeType}
                onClick={() => openAddForm(btn.nodeType)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shadow-sm whitespace-nowrap bg-white/90 dark:bg-neutral-800/90 ${btn.colorClass}`}
              >
                {btn.label}
              </button>
            ))}
          </Panel>
        )}

        {/* Align + Distribute + Group toolbar */}
        {!viewOnly && (selectionCount >= 2 || singleGroupSelected) && (
          <Panel position="top-center" style={{ top: 12, pointerEvents: 'auto' }}>
            <div className="flex items-center gap-0.5 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-xl shadow-md px-2 py-1.5">
              <span className="text-[10px] font-medium text-gray-400 dark:text-neutral-500 pr-1.5 select-none border-r border-gray-200 dark:border-neutral-600 mr-1">
                {selectionCount} selected
              </span>
              {selectionCount >= 2 && (
                <>
                  {[
                    { type: 'left',    title: 'Align Left',              Icon: AlignLeftIcon },
                    { type: 'centerH', title: 'Align Center (horiz.)',   Icon: AlignCenterHIcon },
                    { type: 'right',   title: 'Align Right',             Icon: AlignRightIcon },
                    { type: 'top',     title: 'Align Top',               Icon: AlignTopIcon },
                    { type: 'centerV', title: 'Align Middle (vert.)',    Icon: AlignMiddleVIcon },
                    { type: 'bottom',  title: 'Align Bottom',            Icon: AlignBottomIcon },
                  ].map(({ type, title, Icon }) => (
                    <button key={type} onClick={() => alignNodes(type)} title={title}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-streepa-50 dark:hover:bg-streepa-900/40 hover:text-streepa-600 dark:hover:text-streepa-400 transition-colors">
                      <Icon />
                    </button>
                  ))}
                  {selectionCount >= 3 && (
                    <>
                      <div className="w-px h-5 bg-gray-200 dark:bg-neutral-600 mx-1" />
                      {[
                        { axis: 'h', title: 'Distribute Horizontally', Icon: DistributeHIcon },
                        { axis: 'v', title: 'Distribute Vertically',   Icon: DistributeVIcon },
                      ].map(({ axis, title, Icon }) => (
                        <button key={axis} onClick={() => distributeNodes(axis)} title={title}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-streepa-50 dark:hover:bg-streepa-900/40 hover:text-streepa-600 dark:hover:text-streepa-400 transition-colors">
                          <Icon />
                        </button>
                      ))}
                    </>
                  )}
                  <div className="w-px h-5 bg-gray-200 dark:bg-neutral-600 mx-1" />
                  <button
                    onClick={handleGroup}
                    title="Group selected nodes"
                    className="px-2 h-7 text-[11px] font-medium rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-streepa-50 dark:hover:bg-streepa-900/40 hover:text-streepa-600 dark:hover:text-streepa-400 transition-colors"
                  >
                    Group
                  </button>
                </>
              )}
              {singleGroupSelected && (
                <button
                  onClick={handleUngroup}
                  title="Ungroup"
                  className="px-2 h-7 text-[11px] font-medium rounded-lg text-gray-500 dark:text-neutral-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  Ungroup
                </button>
              )}
            </div>
          </Panel>
        )}

        {/* Legend + Shortcuts */}
        <Panel position="bottom-right" style={{ bottom: 24, right: 12 }}>
          <div className="flex flex-col items-end gap-2">
            {/* Export PNG — single-click, no menu */}
            <button
              onClick={exportScreenshot}
              disabled={isExporting}
              className={`w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition-colors ${
                isExporting
                  ? 'bg-gray-100 dark:bg-neutral-700 border-gray-200 dark:border-neutral-600 text-gray-300 cursor-wait'
                  : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 text-gray-500 dark:text-neutral-400 hover:border-streepa-300 hover:text-streepa-600'
              }`}
              title="Export PNG"
            >
              {isExporting ? (
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="15 50" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="14" height="10" rx="1.5" />
                  <circle cx="8" cy="9" r="2.5" />
                  <path d="M5.5 4L6.5 2h3l1 2" />
                </svg>
              )}
            </button>

            {/* Cross-reference edges toggle */}
            <button
              onClick={() => setShowCrossRefs(s => !s)}
              className={`w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition-colors ${
                showCrossRefs
                  ? 'bg-streepa-600 border-streepa-600 text-white'
                  : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 text-gray-500 dark:text-neutral-400 hover:border-streepa-300 hover:text-streepa-600'
              }`}
              title={showCrossRefs ? 'Hide cross-reference arrows' : 'Show cross-reference arrows'}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="8" x2="12" y2="8" strokeDasharray="3,2.5" />
                <polyline points="9,5 13,8 9,11" />
              </svg>
            </button>

            {/* Keyboard shortcuts toggle */}
            <div className="relative">
              <button
                onClick={() => setShowShortcuts(s => !s)}
                className={`w-7 h-7 rounded-full border shadow-sm flex items-center justify-center text-xs font-semibold transition-colors ${showShortcuts ? 'bg-streepa-600 border-streepa-600 text-white' : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 text-gray-500 dark:text-neutral-400 hover:border-streepa-300 hover:text-streepa-600'}`}
                title="Keyboard shortcuts"
              >
                ?
              </button>
              {showShortcuts && (
                <div className="absolute bottom-9 right-0 bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-600 shadow-lg p-3 w-52 z-10">
                  <div className="text-[10px] font-semibold text-gray-400 dark:text-neutral-500 uppercase tracking-wide mb-2">Keyboard Shortcuts</div>
                  <div className="space-y-1.5">
                    {[
                      { keys: 'Drag canvas', desc: 'Select box' },
                      { keys: 'Shift+click', desc: 'Add to selection' },
                      { keys: 'Space+drag', desc: 'Pan canvas' },
                      { keys: 'Del / Backspace', desc: 'Delete node(s)' },
                      { keys: 'Ctrl+C', desc: 'Copy node' },
                      { keys: 'Ctrl+V', desc: 'Paste / duplicate' },
                      { keys: 'Ctrl+Z', desc: 'Undo last move' },
                      { keys: 'Ctrl+Y / Ctrl+Shift+Z', desc: 'Redo last move' },
                    ].map(({ keys, desc }) => (
                      <div key={keys} className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-neutral-300 px-1.5 py-0.5 rounded whitespace-nowrap">{keys}</span>
                        <span className="text-xs text-gray-500 dark:text-neutral-400 text-right">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-600 shadow-sm px-3 py-2 text-xs text-gray-500 dark:text-neutral-400 space-y-1">
              <div className="flex items-center gap-2">
                <svg width="32" height="10">
                  <line x1="0" y1="5" x2="32" y2="5" stroke="#64748b" strokeWidth="2" />
                  <polygon points="28,2 32,5 28,8" fill="#64748b" />
                </svg>
                <span>Parent-child relationship</span>
              </div>
              <div className="flex items-center gap-2">
                <svg width="32" height="10">
                  <line x1="0" y1="5" x2="32" y2="5" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" />
                  <polygon points="28,2 32,5 28,8" fill="#94a3b8" />
                </svg>
                <span>Cross-reference / link</span>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      {/* Add node form overlay */}
      {addFormType && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-20">
          <AddNodeForm
            nodeType={addFormType}
            projectId={projectId}
            preferredCenter={viewportCenter}
            onClose={() => setAddFormType(null)}
            onCreated={handleNodeCreated}
          />
        </div>
      )}

      {/* Remote collaborator cursors + selection rings.
          Isolated component owns the useViewport() subscription so pan/zoom
          frames don't re-render the whole canvas. */}
      <RemoteOverlays remoteSelections={remoteSelections} remoteCursors={remoteCursors} />
    </div>
  )
}

export default function Canvas({ projectId, renderMode = false, initialCrossRefs = false }) {
  return <CanvasInner projectId={projectId} renderMode={renderMode} initialCrossRefs={initialCrossRefs} />
}
