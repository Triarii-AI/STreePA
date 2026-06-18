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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import useCanvasStore from '../store/canvasStore.js'
import socket from '../socket.js'
import { updateNode, createCanvasEdge, deleteNode, createNode, createLink } from '../api.js'
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

function rfIdParts(rfId) {
  const parts = rfId.split('-')
  const prefix = parts[0]
  const nodeType = RF_PREFIX_TO_TYPE[prefix] || prefix
  const nodeId = parseInt(parts[parts.length - 1])
  return { nodeType, nodeId }
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
  const focusNodeId = useCanvasStore(s => s.focusNodeId)
  const clearFocusNode = useCanvasStore(s => s.clearFocusNode)
  const addRFEdge = useCanvasStore(s => s.addRFEdge)

  const [addFormType, setAddFormType] = useState(null)
  const [fitDone, setFitDone] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const dragStartPos = useRef({})

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

  const onNodesChange = useCallback((changes) => {
    const newNodes = applyNodeChanges(changes, nodes)
    useCanvasStore.setState({ nodes: newNodes })
  }, [nodes])

  const onEdgesChange = useCallback((changes) => {
    const newEdges = applyEdgeChanges(changes, edges)
    useCanvasStore.setState({ edges: newEdges })
  }, [edges])

  const onNodeClick = useCallback((e, node) => {
    setSelectedNode(node)
  }, [setSelectedNode])

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
      if (!nodeType || nodeType === 'root') continue
      const oldPos = dragStartPos.current[n.id]
      const newPos = { x: n.position.x, y: n.position.y }
      delete dragStartPos.current[n.id]
      try {
        await updateNode(projectId, nodeType, nodeId, newPos)
        socket.emit('node:moved', { project_id: projectId, node_type: nodeType, node_id: nodeId, ...newPos })
        if (oldPos && (oldPos.x !== newPos.x || oldPos.y !== newPos.y)) {
          useCanvasStore.getState().pushHistory({ action: 'move', rfId: n.id, nodeType, nodeId, projectId, oldPos, newPos })
        }
      } catch (err) {
        console.error('Failed to persist node position:', err)
      }
    }
  }, [projectId])

  const onConnect = useCallback(async (connection) => {
    const { nodeType: fromType, nodeId: fromId } = rfIdParts(connection.source)
    const { nodeType: toType, nodeId: toId } = rfIdParts(connection.target)
    try {
      const result = await createCanvasEdge(projectId, {
        from_node_type: fromType,
        from_node_id: fromId,
        to_node_type: toType,
        to_node_id: toId,
        style: 'dashed',
      })
      const rfEdge = {
        id: `e-canvas-${result?.id || Date.now()}`,
        source: connection.source,
        target: connection.target,
        type: 'floating',
        style: { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5,5' },
        markerEnd: { type: 'arrow', width: 16, height: 16, color: '#94a3b8' },
      }
      addRFEdge(rfEdge)
      socket.emit('edge:added', { ...rfEdge, project_id: projectId })
    } catch (err) {
      console.error('Failed to create edge:', err)
    }
  }, [projectId, addRFEdge])

  // Keyboard shortcuts: Delete, Ctrl+C/V, Ctrl+Z/Y
  useEffect(() => {
    const RF_TYPE_MAP = {
      loss: 'lossNode', hazard: 'hazardNode', system_constraint: 'scNode',
      control_action: 'caNode', uca: 'ucaNode', loss_scenario: 'lsNode',
    }

    async function onKeyDown(e) {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

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

  function handleNodeCreated(newNode) {
    setAddFormType(null)
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'floating' }}
        deleteKeyCode={null}
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

        {/* Add node buttons */}
        <Panel position="top-left" style={{ top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {LAYER_BUTTONS.map(btn => (
            <button
              key={btn.nodeType}
              onClick={() => setAddFormType(btn.nodeType)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shadow-sm whitespace-nowrap ${btn.colorClass}`}
            >
              {btn.label}
            </button>
          ))}
        </Panel>

        {/* Legend + Shortcuts */}
        <Panel position="bottom-right" style={{ bottom: 24, right: 12 }}>
          <div className="flex flex-col items-end gap-2">
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
