import React, { useEffect, useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
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

// Render mode: a bare, full-screen canvas used by the headless-Chromium screenshot
// worker. No toolbar/sidebar/sockets — just the real React Flow rendering, themed and
// fit to view, which the worker captures for pixel-accurate PNG export.
// URL: /projects/:id?render=1&theme=dark&cross_refs=1&hidden=loss-3,hazard-7
function RenderModeCanvas({ id, themeDark, crossRefs, hiddenIds }) {
  const loadProject = useCanvasStore(s => s.loadProject)

  // Apply theme before/while loading so the first paint is already correct.
  useEffect(() => {
    useCanvasStore.setState({ darkMode: themeDark, viewOnly: true })
    document.documentElement.classList.toggle('dark', themeDark)
  }, [themeDark])

  useEffect(() => {
    if (!id) return
    getProject(id)
      .then(data => {
        loadProject(data)
        if (hiddenIds.length > 0) {
          const hide = new Set(hiddenIds)
          useCanvasStore.setState(state => ({
            nodes: state.nodes.map(n => hide.has(n.id) ? { ...n, data: { ...n.data, hidden: true } } : n),
            edges: state.edges.map(e =>
              hide.has(e.source) || hide.has(e.target) ? { ...e, hidden: true } : e
            ),
          }))
        }
      })
      .catch(err => console.error('Render-mode load failed:', err))
  }, [id, loadProject, hiddenIds])

  // NOTE: flex flex-col is required — Canvas's root uses `flex-1` for its height, which
  // collapses to 0 (clipping the whole graph) unless the parent is a flex container.
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-neutral-900" data-export-canvas>
      <ReactFlowProvider>
        <Canvas projectId={id} renderMode initialCrossRefs={crossRefs} />
      </ReactFlowProvider>
    </div>
  )
}

export default function ProjectCanvas() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const renderMode = searchParams.get('render') === '1'
  const themeDark = searchParams.get('theme') === 'dark'
  const crossRefs = searchParams.get('cross_refs') === '1'
  const hiddenIds = useMemo(() => {
    const raw = searchParams.get('hidden') || ''
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }, [searchParams])

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
  const groupRFNodes = useCanvasStore(s => s.groupRFNodes)
  const ungroupRFNodes = useCanvasStore(s => s.ungroupRFNodes)
  const resizeGroupRF = useCanvasStore(s => s.resizeGroupRF)
  const addNodesToGroupRF = useCanvasStore(s => s.addNodesToGroupRF)

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

  const handleGroupCreated = useCallback((data) => {
    const { group, group_rf_node, member_updates } = data
    const groupRFNode = group_rf_node || {
      id: `group-${group.id}`,
      type: 'groupNode',
      position: { x: group.x, y: group.y },
      style: { width: group.width, height: group.height },
      data: { label: group.label || '', nodeType: 'group', groupId: group.id },
      zIndex: -1,
    }
    groupRFNodes(groupRFNode, member_updates || [])
  }, [groupRFNodes])

  const handleGroupDeleted = useCallback((data) => {
    const { group_rf_id, released_members } = data
    const memberUpdates = (released_members || []).map(({ node_type, node_id, abs_x, abs_y }) => ({
      rfNodeId: `${nodeTypePrefix(node_type)}-${node_id}`,
      absX: abs_x,
      absY: abs_y,
    }))
    ungroupRFNodes(group_rf_id, memberUpdates)
  }, [ungroupRFNodes])

  const handleGroupMoved = useCallback((data) => {
    const { group_rf_id, x, y } = data
    moveRFNode(group_rf_id, x, y)
  }, [moveRFNode])

  const handleGroupResized = useCallback((data) => {
    const { group_rf_id, x, y, width, height, child_updates } = data
    resizeGroupRF(group_rf_id, x, y, width, height, child_updates || [])
  }, [resizeGroupRF])

  const handleGroupMembersUpdated = useCallback((data) => {
    const { group_rf_id, x, y, width, height, new_member_updates, existing_member_updates } = data
    addNodesToGroupRF(group_rf_id, new_member_updates || [], existing_member_updates || [], x, y, width, height)
  }, [addNodesToGroupRF])

  const handlePresenceUpdate = useCallback((data) => {
    setActiveUsers(data.active_users || [])
  }, [setActiveUsers])

  useEffect(() => {
    if (!id || renderMode) return

    getProject(id)
      .then(data => loadProject(data))
      .catch(err => console.error('Failed to load project:', err))

    function rejoinRoom() {
      socket.emit('project:join', { project_id: id })
    }

    socket.connect()
    socket.on('connect', rejoinRoom)
    rejoinRoom()

    function onRoleChanged(data) {
      const { user, patchCurrentProject, setViewOnly } = useCanvasStore.getState()
      if (user && data.user_id === user.id) {
        patchCurrentProject({ user_role: data.new_role })
        setViewOnly(data.new_role === 'viewer')
      }
    }

    socket.on('node:added', handleNodeAdded)
    socket.on('node:updated', handleNodeUpdated)
    socket.on('node:moved', handleNodeMoved)
    socket.on('node:deleted', handleNodeDeleted)
    socket.on('edge:added', handleEdgeAdded)
    socket.on('edge:deleted', handleEdgeDeleted)
    socket.on('group:created', handleGroupCreated)
    socket.on('group:deleted', handleGroupDeleted)
    socket.on('group:moved', handleGroupMoved)
    socket.on('group:resized', handleGroupResized)
    socket.on('group:members_updated', handleGroupMembersUpdated)
    socket.on('presence:update', handlePresenceUpdate)
    socket.on('share:role_changed', onRoleChanged)

    return () => {
      socket.off('connect', rejoinRoom)
      socket.off('node:added', handleNodeAdded)
      socket.off('node:updated', handleNodeUpdated)
      socket.off('node:moved', handleNodeMoved)
      socket.off('node:deleted', handleNodeDeleted)
      socket.off('edge:added', handleEdgeAdded)
      socket.off('edge:deleted', handleEdgeDeleted)
      socket.off('group:created', handleGroupCreated)
      socket.off('group:deleted', handleGroupDeleted)
      socket.off('group:moved', handleGroupMoved)
      socket.off('group:resized', handleGroupResized)
      socket.off('group:members_updated', handleGroupMembersUpdated)
      socket.off('presence:update', handlePresenceUpdate)
      socket.off('share:role_changed', onRoleChanged)
      socket.disconnect()
    }
  }, [id, renderMode])

  if (renderMode) {
    return <RenderModeCanvas id={id} themeDark={themeDark} crossRefs={crossRefs} hiddenIds={hiddenIds} />
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-neutral-900">
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
