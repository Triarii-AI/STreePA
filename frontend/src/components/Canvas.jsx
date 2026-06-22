// React Flow (@xyflow/react) chosen for: first-class React component model for custom nodes,
// built-in drag-and-drop with programmatic positioning, native Bezier edge routing,
// built-in zoom/pan/fit controls, and active maintenance. Best fit for React-based UIs
// requiring rich per-node interactivity without low-level SVG management.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  getNodesBounds,
  getViewportForBounds,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import useCanvasStore from '../store/canvasStore.js'
import socket from '../socket.js'
import { updateNode, updateProject, deleteNode, createNode, createLink } from '../api.js'
import { makeRFEdge, nodeTypeToPrefix } from '../constants.js'

import RootNode from './nodes/RootNode.jsx'
import LossNode from './nodes/LossNode.jsx'
import HazardNode from './nodes/HazardNode.jsx'
import SCNode from './nodes/SCNode.jsx'
import CANode from './nodes/CANode.jsx'
import UCANode from './nodes/UCANode.jsx'
import LSNode from './nodes/LSNode.jsx'
import AddNodeForm from './forms/AddNodeForm.jsx'
import FloatingEdge from './edges/FloatingEdge.jsx'
import { toPng } from 'html-to-image'

const nodeTypes = {
  rootNode: RootNode,
  lossNode: LossNode,
  hazardNode: HazardNode,
  scNode: SCNode,
  caNode: CANode,
  ucaNode: UCANode,
  lsNode: LSNode,
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

const RF_PREFIX_TO_TYPE = {
  sc: 'system_constraint', ca: 'control_action', uca: 'uca',
  ls: 'loss_scenario', loss: 'loss', hazard: 'hazard', root: 'root',
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

async function recreateNode(entry) {
  const { snapshot, projectId } = entry
  const { nodeData, position, rfNodeType } = snapshot
  const nodeType = nodeData.nodeType

  const payload = {}
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
  for (const hid of (nodeData.hazard_ids || [])) {
    const fromType = nodeType === 'uca' ? 'uca' : 'loss_scenario'
    try {
      await createLink(projectId, fromType, newNodeId, 'hazard', hid)
      store.addRFEdge(makeRFEdge(newRfId, `hazard-${hid}`, true))
    } catch (_) {}
  }
  if (nodeType === 'system_constraint' && payload.linked_hazard_id) {
    store.addRFEdge(makeRFEdge(newRfId, `hazard-${payload.linked_hazard_id}`, true))
  }

  return { newRfId, newNodeId }
}

function CanvasInner({ projectId }) {
  const reactFlow = useReactFlow()
  const nodes = useCanvasStore(s => s.nodes)
  const edges = useCanvasStore(s => s.edges)
  const setSelectedNode = useCanvasStore(s => s.setSelectedNode)
  const selectedNode = useCanvasStore(s => s.selectedNode)
  const viewOnly = useCanvasStore(s => s.viewOnly)
  const focusNodeId = useCanvasStore(s => s.focusNodeId)
  const clearFocusNode = useCanvasStore(s => s.clearFocusNode)
  const [addFormType, setAddFormType] = useState(null)
  const [viewportCenter, setViewportCenter] = useState(null)
  const [fitDone, setFitDone] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [selectionCount, setSelectionCount] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const [showCrossRefs, setShowCrossRefs] = useState(false)
  const dragStartPos = useRef({})
  const containerRef = useRef(null)

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

  const visibleNodes = useMemo(() => nodes.filter(n => !n.data?.hidden), [nodes])
  const visibleEdges = useMemo(() => edges.filter(e => !e.hidden), [edges])

  // Cross-reference edges (dashed) are hidden by default to reduce rendered edge count.
  // When a node is selected, its own cross-refs are always shown.
  // showCrossRefs toggle reveals all of them.
  const displayEdges = useMemo(() => {
    const nodeId = selectedNode?.id
    const filtered = showCrossRefs
      ? visibleEdges
      : visibleEdges.filter(e => {
          if (!e.style?.strokeDasharray) return true
          return nodeId && (e.source === nodeId || e.target === nodeId)
        })
    if (!nodeId) return filtered
    return filtered.map(e =>
      (e.source === nodeId || e.target === nodeId) ? { ...e, zIndex: 10 } : e
    )
  }, [visibleEdges, selectedNode, showCrossRefs])

  // Empty dep arrays: read current state via getState() so these callbacks are created
  // once and never recreated. Stable references prevent React Flow from re-reconciling
  // on every state change, which is critical during fast drag events.
  const onNodesChange = useCallback((changes) => {
    const newNodes = applyNodeChanges(changes, useCanvasStore.getState().nodes)
    useCanvasStore.setState({ nodes: newNodes })
  }, [])

  const onEdgesChange = useCallback((changes) => {
    const newEdges = applyEdgeChanges(changes, useCanvasStore.getState().edges)
    useCanvasStore.setState({ edges: newEdges })
  }, [])

  const onNodeClick = useCallback((e, node) => {
    setSelectedNode(node)
  }, [setSelectedNode])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  const onSelectionChange = useCallback(({ nodes }) => {
    setSelectionCount(nodes.filter(n => !n.data?.hidden).length)
  }, [])

  const onNodeDragStart = useCallback((e, node, draggedNodes) => {
    const all = draggedNodes?.length > 1 ? draggedNodes : [node]
    all.forEach(n => { dragStartPos.current[n.id] = { ...n.position } })
  }, [])

  const onNodeDragStop = useCallback(async (e, node, draggedNodes) => {
    const all = draggedNodes?.length > 1 ? draggedNodes : [node]
    for (const n of all) {
      const parts = n.id.split('-')
      const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
      const nodeId = parseInt(parts[parts.length - 1])
      if (!nodeType) continue
      const oldPos = dragStartPos.current[n.id]
      const newPos = { x: n.position.x, y: n.position.y }
      delete dragStartPos.current[n.id]
      try {
        if (nodeType === 'root') {
          await updateProject(projectId, { root_x: newPos.x, root_y: newPos.y })
        } else {
          await updateNode(projectId, nodeType, nodeId, newPos)
          socket.emit('node:moved', { project_id: projectId, node_type: nodeType, node_id: nodeId, ...newPos })
          if (oldPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
            useCanvasStore.getState().pushHistory({ action: 'move', rfId: n.id, nodeType, nodeId, projectId, oldPos, newPos })
          }
        }
      } catch (err) {
        console.error('Failed to persist node position:', err)
      }
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
        const selectedNodes = reactFlow.getNodes().filter(n => n.selected && n.data.nodeType !== 'root')
        if (selectedNodes.length === 0) return
        e.preventDefault()
        const confirmMsg = selectedNodes.length === 1 ? 'Delete this node?' : `Delete ${selectedNodes.length} nodes?`
        if (!window.confirm(confirmMsg)) return
        const ORPHAN_NULL_FIELD = {
          hazard: 'parent_hazard_id',
          system_constraint: 'linked_hazard_id',
          uca: 'control_action_id',
          loss_scenario: 'uca_id',
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
            await updateNode(entry.projectId, entry.nodeType, entry.nodeId, { x: entry.oldPos.x, y: entry.oldPos.y })
            store.moveRFNode(entry.rfId, entry.oldPos.x, entry.oldPos.y)
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'create') {
            await deleteNode(entry.projectId, entry.nodeType, entry.nodeId)
            store.removeRFNode(entry.rfId)
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex - 1 })
          } else if (entry.action === 'delete') {
            const { newRfId, newNodeId } = await recreateNode(entry)
            store.updateHistoryEntry(moveHistoryIndex, { rfId: newRfId, nodeId: newNodeId })
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
            await updateNode(entry.projectId, entry.nodeType, entry.nodeId, { x: entry.newPos.x, y: entry.newPos.y })
            store.moveRFNode(entry.rfId, entry.newPos.x, entry.newPos.y)
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'create') {
            const { newRfId, newNodeId } = await recreateNode(entry)
            store.updateHistoryEntry(moveHistoryIndex + 1, { rfId: newRfId, nodeId: newNodeId })
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          } else if (entry.action === 'delete') {
            await deleteNode(entry.projectId, entry.nodeType, entry.nodeId)
            store.removeRFNode(entry.rfId)
            useCanvasStore.setState({ moveHistoryIndex: moveHistoryIndex + 1 })
          }
        } catch (err) { console.error('Redo failed:', err) }
        return
      }

      // ── Copy selected node (Ctrl+C) ────────────────────────────────────
      if (ctrl && e.key === 'c') {
        const { selectedNode } = store
        if (!selectedNode || selectedNode.data.nodeType === 'root') return
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
    // Single state update for all positions (one re-render instead of N)
    store.moveMultipleRFNodes(updates)
    // Persist to DB in parallel
    await Promise.all(updates.map(async ({ rfId, x, y }) => {
      const parts = rfId.split('-')
      const nodeType = RF_PREFIX_TO_TYPE[parts[0]]
      const nodeId = parseInt(parts[parts.length - 1])
      if (!nodeType || nodeType === 'root') return
      try {
        await updateNode(projectId, nodeType, nodeId, { x, y })
        socket.emit('node:moved', { project_id: projectId, node_type: nodeType, node_id: nodeId, x, y })
      } catch (err) {
        console.error('Align failed:', err)
      }
    }))
  }

  async function alignNodes(type) {
    const selected = reactFlow.getNodes().filter(n => n.selected && !n.data?.hidden)
    if (selected.length < 2) return
    const xs = selected.map(n => n.position.x)
    const ys = selected.map(n => n.position.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    let updates
    if (type === 'left')    updates = selected.map(n => ({ rfId: n.id, x: minX,               y: n.position.y }))
    else if (type === 'centerH') updates = selected.map(n => ({ rfId: n.id, x: (minX + maxX) / 2, y: n.position.y }))
    else if (type === 'right')   updates = selected.map(n => ({ rfId: n.id, x: maxX,               y: n.position.y }))
    else if (type === 'top')     updates = selected.map(n => ({ rfId: n.id, x: n.position.x, y: minY               }))
    else if (type === 'centerV') updates = selected.map(n => ({ rfId: n.id, x: n.position.x, y: (minY + maxY) / 2 }))
    else if (type === 'bottom')  updates = selected.map(n => ({ rfId: n.id, x: n.position.x, y: maxY               }))
    else return
    await applyAlignPositions(updates)
  }

  async function distributeNodes(axis) {
    const selected = reactFlow.getNodes().filter(n => n.selected && !n.data?.hidden)
    if (selected.length < 3) return
    let updates
    if (axis === 'h') {
      const sorted = [...selected].sort((a, b) => a.position.x - b.position.x)
      const minX = sorted[0].position.x, maxX = sorted[sorted.length - 1].position.x
      const step = (maxX - minX) / (sorted.length - 1)
      updates = sorted.map((n, i) => ({ rfId: n.id, x: Math.round(minX + i * step), y: n.position.y }))
    } else {
      const sorted = [...selected].sort((a, b) => a.position.y - b.position.y)
      const minY = sorted[0].position.y, maxY = sorted[sorted.length - 1].position.y
      const step = (maxY - minY) / (sorted.length - 1)
      updates = sorted.map((n, i) => ({ rfId: n.id, x: n.position.x, y: Math.round(minY + i * step) }))
    }
    await applyAlignPositions(updates)
  }

  async function exportScreenshot() {
    if (isExporting) return
    setIsExporting(true)
    // onlyRenderVisibleElements is disabled while isExporting is true,
    // so React Flow will render every node into the DOM.
    try {
      const { currentProject } = useCanvasStore.getState()
      const projectName = currentProject?.name || 'stpa-diagram'
      const savedViewport = reactFlow.getViewport()

      // Wait until all nodes are rendered and measured (up to ~1s).
      for (let i = 0; i < 60; i++) {
        await new Promise(r => requestAnimationFrame(r))
        const rfNodes = reactFlow.getNodes().filter(n => !n.hidden && !n.data?.hidden)
        if (rfNodes.length > 0 && rfNodes.every(n => n.measured?.width && n.measured?.height)) break
      }

      const rfNodes = reactFlow.getNodes().filter(n => !n.hidden && !n.data?.hidden)
      if (!rfNodes.length) return

      // Compute the bounding box of all nodes and size the image to fit them at 2× resolution.
      const bounds = getNodesBounds(rfNodes)
      const SCALE = 2
      const PADDING = 0.08
      const imageWidth  = Math.max(400, Math.round(bounds.width  * SCALE * (1 + PADDING * 2)))
      const imageHeight = Math.max(300, Math.round(bounds.height * SCALE * (1 + PADDING * 2)))

      // getViewportForBounds returns the x/y/zoom transform that maps the full diagram into the image.
      const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.1, 10, PADDING)

      const viewportEl = containerRef.current?.querySelector('.react-flow__viewport')
      if (!viewportEl) return

      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#f8fafc',
        width: imageWidth,
        height: imageHeight,
        style: {
          width:     `${imageWidth}px`,
          height:    `${imageHeight}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      })

      reactFlow.setViewport(savedViewport, { duration: 300 })

      const slug = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const date = new Date().toISOString().slice(0, 10)
      const a = document.createElement('a')
      a.download = `${slug}-${date}.png`
      a.href = dataUrl
      a.click()
    } catch (err) {
      console.error('Screenshot export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }

  function handleNodeCreated(newNode) {
    setAddFormType(null)
  }

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <ReactFlow
        nodes={visibleNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeDragStart={viewOnly ? undefined : onNodeDragStart}
        onNodeDragStop={viewOnly ? undefined : onNodeDragStop}
        onSelectionChange={onSelectionChange}
        nodesDraggable={!viewOnly}
        nodesFocusable={false}
        edgesFocusable={false}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'floating' }}
        deleteKeyCode={null}
        minZoom={0.05}
        onlyRenderVisibleElements={!isExporting}
        selectionOnDrag
        panOnDrag={[1, 2]}
        multiSelectionKeyCode="Shift"
        panActivationKeyCode="Space"
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={20} size={1} color="#e2e8f0" />
        <MiniMap
          position="bottom-left"
          nodeColor={n => getNodeColor(n.type)}
          style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}
          zoomable
          pannable
        />
        <Controls position="top-right" />

        {/* Add node buttons — hidden in view-only mode */}
        {!viewOnly && (
          <Panel position="top-left" style={{ top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {LAYER_BUTTONS.map(btn => (
              <button
                key={btn.nodeType}
                onClick={() => openAddForm(btn.nodeType)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shadow-sm whitespace-nowrap ${btn.colorClass}`}
              >
                {btn.label}
              </button>
            ))}
          </Panel>
        )}

        {/* Align + Distribute toolbar — visible when 2+ nodes selected and not in view-only */}
        {!viewOnly && selectionCount >= 2 && (
          <Panel position="top-center" style={{ top: 12, pointerEvents: 'auto' }}>
            <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-xl shadow-md px-2 py-1.5">
              <span className="text-[10px] font-medium text-gray-400 pr-1.5 select-none border-r border-gray-200 mr-1">
                {selectionCount} selected
              </span>
              {[
                { type: 'left',    title: 'Align Left',              Icon: AlignLeftIcon },
                { type: 'centerH', title: 'Align Center (horiz.)',   Icon: AlignCenterHIcon },
                { type: 'right',   title: 'Align Right',             Icon: AlignRightIcon },
                { type: 'top',     title: 'Align Top',               Icon: AlignTopIcon },
                { type: 'centerV', title: 'Align Middle (vert.)',    Icon: AlignMiddleVIcon },
                { type: 'bottom',  title: 'Align Bottom',            Icon: AlignBottomIcon },
              ].map(({ type, title, Icon }) => (
                <button key={type} onClick={() => alignNodes(type)} title={title}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                  <Icon />
                </button>
              ))}
              {selectionCount >= 3 && (
                <>
                  <div className="w-px h-5 bg-gray-200 mx-1" />
                  {[
                    { axis: 'h', title: 'Distribute Horizontally', Icon: DistributeHIcon },
                    { axis: 'v', title: 'Distribute Vertically',   Icon: DistributeVIcon },
                  ].map(({ axis, title, Icon }) => (
                    <button key={axis} onClick={() => distributeNodes(axis)} title={title}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                      <Icon />
                    </button>
                  ))}
                </>
              )}
            </div>
          </Panel>
        )}

        {/* Legend + Shortcuts */}
        <Panel position="bottom-right" style={{ bottom: 24, right: 12 }}>
          <div className="flex flex-col items-end gap-2">
            {/* Export screenshot */}
            <button
              onClick={exportScreenshot}
              disabled={isExporting}
              className={`w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition-colors ${
                isExporting
                  ? 'bg-gray-100 border-gray-200 text-gray-300 cursor-wait'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
              title="Export screenshot"
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
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
              title={showCrossRefs ? 'Hide cross-reference arrows' : 'Show all cross-reference arrows'}
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
                className={`w-7 h-7 rounded-full border shadow-sm flex items-center justify-center text-xs font-semibold transition-colors ${showShortcuts ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'}`}
                title="Keyboard shortcuts"
              >
                ?
              </button>
              {showShortcuts && (
                <div className="absolute bottom-9 right-0 bg-white rounded-lg border border-gray-200 shadow-lg p-3 w-52 z-10">
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Keyboard Shortcuts</div>
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
                        <span className="font-mono text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded whitespace-nowrap">{keys}</span>
                        <span className="text-xs text-gray-500 text-right">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2 text-xs text-gray-500 space-y-1">
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
    </div>
  )
}

export default function Canvas({ projectId }) {
  return <CanvasInner projectId={projectId} />
}
