import React, { useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getProject } from '../api.js'
import useCanvasStore from '../store/canvasStore.js'
import socket from '../socket.js'
import Toolbar from '../components/Toolbar.jsx'
import Sidebar from '../components/Sidebar.jsx'
import Canvas from '../components/Canvas.jsx'
import NodePanel from '../components/NodePanel.jsx'
import { ReactFlowProvider } from '@xyflow/react'
import { makeRFEdge } from '../constants.js'

function nodeTypePrefix(nodeType) {
  const prefixMap = {
    loss: 'loss',
    hazard: 'hazard',
    system_constraint: 'sc',
    control_action: 'ca',
    uca: 'uca',
    loss_scenario: 'ls',
    root: 'root',
  }
  return prefixMap[nodeType] || nodeType
}

function nodeTypeId(data) {
  if (data.node_type && data.node_id) {
    return `${nodeTypePrefix(data.node_type)}-${data.node_id}`
  }
  if (data.node_data && data.node_type) {
    return `${nodeTypePrefix(data.node_type)}-${data.node_data.id}`
  }
  return null
}

function convertToRFNode(data) {
  const { node_type, node_data, position } = data
  const typeMap = {
    loss: 'lossNode',
    hazard: 'hazardNode',
    system_constraint: 'scNode',
    control_action: 'caNode',
    uca: 'ucaNode',
    loss_scenario: 'lsNode',
  }
  return {
    id: `${nodeTypePrefix(node_type)}-${node_data.id}`,
    type: typeMap[node_type] || 'lossNode',
    position: position || { x: 400, y: 400 },
    data: { ...node_data, nodeType: node_type },
  }
}

function convertToRFEdge(data) {
  return {
    id: data.edge_id || `e-${data.source}-${data.target}`,
    source: data.source,
    target: data.target,
    type: 'smoothstep',
    style: data.style || { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5,5' },
    markerEnd: { type: 'arrow', width: 16, height: 16, color: '#94a3b8' },
  }
}

export default function ProjectCanvas() {
  const { id } = useParams()
  const currentProject = useCanvasStore(s => s.currentProject)
  const loadProject = useCanvasStore(s => s.loadProject)
  const addRFNode = useCanvasStore(s => s.addRFNode)
  const updateRFNode = useCanvasStore(s => s.updateRFNode)
  const moveRFNode = useCanvasStore(s => s.moveRFNode)
  const removeRFNode = useCanvasStore(s => s.removeRFNode)
  const addRFEdge = useCanvasStore(s => s.addRFEdge)
  const removeRFEdge = useCanvasStore(s => s.removeRFEdge)
  const setActiveUsers = useCanvasStore(s => s.setActiveUsers)
  const selectedNode = useCanvasStore(s => s.selectedNode)
  const viewOnly = useCanvasStore(s => s.viewOnly)

  const handleNodeAdded = useCallback((data) => {
    addRFNode(convertToRFNode(data))
    const { node_type, node_data, project_id } = data
    const id = node_data.id
    const prefix = nodeTypePrefix(node_type)
    // Solid structural edges
    if (node_type === 'loss') {
      addRFEdge(makeRFEdge(`root-${project_id}`, `loss-${id}`, false))
    } else if (node_type === 'hazard' && node_data.parent_hazard_id) {
      addRFEdge(makeRFEdge(`hazard-${node_data.parent_hazard_id}`, `hazard-${id}`, false))
    } else if (node_type === 'uca' && node_data.control_action_id) {
      addRFEdge(makeRFEdge(`ca-${node_data.control_action_id}`, `uca-${id}`, false))
    } else if (node_type === 'loss_scenario' && node_data.uca_id) {
      addRFEdge(makeRFEdge(`uca-${node_data.uca_id}`, `ls-${id}`, false))
    } else if (node_type === 'system_constraint' && node_data.linked_hazard_id) {
      addRFEdge(makeRFEdge(`hazard-${node_data.linked_hazard_id}`, `sc-${id}`, false))
    }
    // Dashed link edges
    ;(node_data.loss_ids || []).forEach(lid => {
      addRFEdge(makeRFEdge(`hazard-${id}`, `loss-${lid}`, true))
    })
    ;(node_data.hazard_ids || []).forEach(hid => {
      addRFEdge(makeRFEdge(`${prefix}-${id}`, `hazard-${hid}`, true))
    })
  }, [addRFNode, addRFEdge])

  const handleNodeUpdated = useCallback((data) => {
    const rfId = nodeTypeId(data)
    if (rfId) updateRFNode(rfId, data.changed_fields || data.node_data || {})
  }, [updateRFNode])

  const handleNodeMoved = useCallback((data) => {
    const rfId = nodeTypeId(data)
    if (rfId) moveRFNode(rfId, data.x, data.y)
  }, [moveRFNode])

  const handleNodeDeleted = useCallback((data) => {
    const rfId = nodeTypeId(data)
    if (rfId) removeRFNode(rfId)
  }, [removeRFNode])

  const handleEdgeAdded = useCallback((data) => {
    addRFEdge(convertToRFEdge(data))
  }, [addRFEdge])

  const handleEdgeDeleted = useCallback((data) => {
    removeRFEdge(data.edge_id)
  }, [removeRFEdge])

  const handlePresenceUpdate = useCallback((data) => {
    setActiveUsers(data.active_users || [])
  }, [setActiveUsers])

  useEffect(() => {
    if (!id) return

    getProject(id)
      .then(data => loadProject(data))
      .catch(err => console.error('Failed to load project:', err))

    function rejoinRoom() {
      socket.emit('project:join', { project_id: id })
    }

    socket.connect()
    socket.on('connect', rejoinRoom)
    rejoinRoom()

    socket.on('node:added', handleNodeAdded)
    socket.on('node:updated', handleNodeUpdated)
    socket.on('node:moved', handleNodeMoved)
    socket.on('node:deleted', handleNodeDeleted)
    socket.on('edge:added', handleEdgeAdded)
    socket.on('edge:deleted', handleEdgeDeleted)
    socket.on('presence:update', handlePresenceUpdate)

    return () => {
      socket.off('connect', rejoinRoom)
      socket.off('node:added', handleNodeAdded)
      socket.off('node:updated', handleNodeUpdated)
      socket.off('node:moved', handleNodeMoved)
      socket.off('node:deleted', handleNodeDeleted)
      socket.off('edge:added', handleEdgeAdded)
      socket.off('edge:deleted', handleEdgeDeleted)
      socket.off('presence:update', handlePresenceUpdate)
      socket.disconnect()
    }
  }, [id])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <ReactFlowProvider>
        <Toolbar project={currentProject} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <Canvas projectId={id} />
          {selectedNode && !viewOnly && <NodePanel projectId={id} />}
        </div>
      </ReactFlowProvider>
    </div>
  )
}
