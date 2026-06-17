// React Flow (@xyflow/react) chosen for: first-class React component model for custom nodes,
// built-in drag-and-drop with programmatic positioning, native Bezier edge routing,
// built-in zoom/pan/fit controls, and active maintenance. Best fit for React-based UIs
// requiring rich per-node interactivity without low-level SVG management.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { updateNode, createCanvasEdge } from '../api.js'

import RootNode from './nodes/RootNode.jsx'
import LossNode from './nodes/LossNode.jsx'
import HazardNode from './nodes/HazardNode.jsx'
import SCNode from './nodes/SCNode.jsx'
import CANode from './nodes/CANode.jsx'
import UCANode from './nodes/UCANode.jsx'
import LSNode from './nodes/LSNode.jsx'
import AddNodeForm from './forms/AddNodeForm.jsx'

const nodeTypes = {
  rootNode: RootNode,
  lossNode: LossNode,
  hazardNode: HazardNode,
  scNode: SCNode,
  caNode: CANode,
  ucaNode: UCANode,
  lsNode: LSNode,
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

  const onNodeDragStop = useCallback(async (e, node) => {
    const rfId = node.id
    const parts = rfId.split('-')
    // Handle prefixes like 'sc', 'ca', 'uca', 'ls', 'loss', 'hazard', 'root'
    const prefixToType = {
      sc: 'system_constraint',
      ca: 'control_action',
      uca: 'uca',
      ls: 'loss_scenario',
      loss: 'loss',
      hazard: 'hazard',
      root: 'root',
    }
    const prefix = parts[0]
    const nodeType = prefixToType[prefix]
    const nodeId = parts[parts.length - 1]

    if (!nodeType || nodeType === 'root') return

    try {
      await updateNode(projectId, nodeType, nodeId, {
        x: node.position.x,
        y: node.position.y,
      })
      socket.emit('node:moved', {
        project_id: projectId,
        node_type: nodeType,
        node_id: nodeId,
        x: node.position.x,
        y: node.position.y,
      })
    } catch (err) {
      console.error('Failed to persist node position:', err)
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
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'default',
        style: { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5,5' },
        markerEnd: { type: 'arrow', width: 16, height: 16, color: '#94a3b8' },
      }
      addRFEdge(rfEdge)
      socket.emit('edge:added', { ...rfEdge, project_id: projectId })
    } catch (err) {
      console.error('Failed to create edge:', err)
    }
  }, [projectId, addRFEdge])

  function handleNodeCreated(newNode) {
    // Node is already added to store in AddNodeForm
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
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: 'default' }}
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

        {/* Legend */}
        <Panel position="bottom-right" style={{ bottom: 24, right: 12 }}>
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
