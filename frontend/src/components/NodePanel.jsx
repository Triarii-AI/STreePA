import React, { useState, useEffect } from 'react'
import useCanvasStore from '../store/canvasStore.js'
import { updateNode, deleteNode, createLink, deleteLink, updateProject } from '../api.js'
import socket from '../socket.js'
import { LAYER_COLORS, UCA_TYPE_COLORS, UCA_TYPE_LABELS, makeRFEdge, nodeTypeToPrefix } from '../constants.js'
import { SearchableSelect, SearchableCheckboxList } from './forms/shared.jsx'

function isMainHazard(h) {
  return h.label && !h.label.includes('.')
}

function isMainLoss(l) {
  return l.label && !l.label.includes('.')
}

const LAYER_LABELS = {
  root: 'Root',
  loss: 'Loss',
  hazard: 'Hazard',
  system_constraint: 'System Constraint',
  control_action: 'Control Action',
  uca: 'UCA',
  controller_constraint: 'Controller Constraint',
  loss_scenario: 'Loss Scenario',
}

const LAYER_BADGE_COLORS = {
  root: 'bg-streepa-100 text-streepa-700',
  loss: 'bg-red-100 text-red-700',
  hazard: 'bg-orange-100 text-orange-700',
  system_constraint: 'bg-yellow-100 text-yellow-700',
  control_action: 'bg-green-100 text-green-700',
  uca: 'bg-blue-100 text-blue-700',
  controller_constraint: 'bg-teal-100 text-teal-700',
  loss_scenario: 'bg-purple-100 text-purple-700',
}

function LinkChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-neutral-700 text-gray-700 dark:text-neutral-300 text-xs px-2 py-1 rounded-full">
      {label}
      {onRemove && (
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 ml-0.5 leading-none">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
}

export default function NodePanel({ projectId }) {
  const selectedNode = useCanvasStore(s => s.selectedNode)
  const setSelectedNode = useCanvasStore(s => s.setSelectedNode)
  const removeRFNode = useCanvasStore(s => s.removeRFNode)
  const updateRFNode = useCanvasStore(s => s.updateRFNode)
  const nodes = useCanvasStore(s => s.nodes)
  const edges = useCanvasStore(s => s.edges)
  const addRFEdge = useCanvasStore(s => s.addRFEdge)
  const removeRFEdge = useCanvasStore(s => s.removeRFEdge)
  const loadProject = useCanvasStore(s => s.loadProject)

  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [linkError, setLinkError] = useState('')

  const nodeData = selectedNode?.data || {}
  const nodeType = nodeData.nodeType
  const nodeId = nodeData.id
  const rfNodeId = selectedNode?.id

  useEffect(() => {
    if (!nodeData) return
    setFormData({ ...nodeData })
    setLinkError('')
  }, [selectedNode])

  if (!selectedNode || !nodeType) return null

  const colors = LAYER_COLORS[nodeType] || LAYER_COLORS.loss
  const badgeClass = LAYER_BADGE_COLORS[nodeType] || 'bg-gray-100 text-gray-700'

  // Get project data from all nodes in store
  function getNodesByType(nt) {
    return nodes.filter(n => n.data?.nodeType === nt).map(n => n.data)
  }

  const allLosses = getNodesByType('loss')
  const allHazards = getNodesByType('hazard').sort((a, b) => {
    const pa = (a.label || '').replace(/^H-/, '').split('.').map(n => parseInt(n) || 0)
    const pb = (b.label || '').replace(/^H-/, '').split('.').map(n => parseInt(n) || 0)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0)
      if (d !== 0) return d
    }
    return 0
  })
  const allUCAs = getNodesByType('uca').sort((a, b) => {
    const nums = s => (s || '').replace(/[^\d.]/g, '').split('.').map(n => parseInt(n) || 0)
    const pa = nums(a.label), pb = nums(b.label)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0)
      if (d !== 0) return d
    }
    return 0
  })
  const allCAs = getNodesByType('control_action')

  // Check if node has children (for collapse toggle)
  function handleFieldChange(field, value) {
    const numericParentFields = ['parent_loss_id', 'parent_hazard_id', 'control_action_id', 'uca_id', 'linked_hazard_id', 'linked_uca_id']
    const parsed = numericParentFields.includes(field)
      ? (value === '' ? null : parseInt(value, 10))
      : value
    setFormData(prev => ({ ...prev, [field]: parsed }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (nodeType === 'root') {
        const changedFields = {}
        Object.keys(formData).forEach(k => {
          if (formData[k] !== nodeData[k] && k !== 'nodeType' && k !== 'hidden') {
            changedFields[k] = formData[k]
          }
        })
        if (Object.keys(changedFields).length === 0) { setSaving(false); return }
        const prevProjectFields = Object.fromEntries(Object.keys(changedFields).map(k => [k, nodeData[k] ?? null]))
        await updateProject(projectId, changedFields)
        updateRFNode(rfNodeId, changedFields)
        useCanvasStore.getState().pushHistory({
          action: 'fieldEdit',
          rfId: rfNodeId,
          nodeType: 'root',
          nodeId: null,
          projectId,
          isProject: true,
          changedFields: { ...changedFields },
          previousFields: prevProjectFields,
        })
        setSaving(false)
        return
      }

      const changedFields = {}
      Object.keys(formData).forEach(k => {
        if (formData[k] !== nodeData[k] && k !== 'nodeType' && k !== 'hidden') {
          changedFields[k] = formData[k]
        }
      })
      if (Object.keys(changedFields).length === 0) { setSaving(false); return }

      const result = await updateNode(projectId, nodeType, nodeId, changedFields)
      const mergedUpdate = { ...changedFields }
      if (result && result.label && result.label !== nodeData.label) {
        mergedUpdate.label = result.label
      }
      // When LS is re-parented to a new UCA, swap hazard links and edges
      if (nodeType === 'loss_scenario' && 'uca_id' in changedFields && result?.hazard_ids !== undefined) {
        const oldHazardIds = nodeData.hazard_ids || []
        const newHazardIds = result.hazard_ids || []
        mergedUpdate.hazard_ids = newHazardIds
        for (const hid of oldHazardIds) removeRFEdge(`e-ls-${nodeId}-hazard-${hid}`)
        for (const hid of newHazardIds) addRFEdge(makeRFEdge(rfNodeId, `hazard-${hid}`, true))
      }
      // Re-parenting onto a new ancestor changes the inherited Controller value
      if (
        ((nodeType === 'uca' && 'control_action_id' in changedFields) ||
         (nodeType === 'loss_scenario' && 'uca_id' in changedFields) ||
         (nodeType === 'controller_constraint' && 'linked_uca_id' in changedFields)) &&
        result?.controller !== undefined
      ) {
        mergedUpdate.controller = result.controller
      }
      updateRFNode(rfNodeId, mergedUpdate)
      ;(result?.relabeled || []).forEach(({ nodeType: nt, id, label }) => {
        updateRFNode(`${nodeTypeToPrefix(nt)}-${id}`, { label })
      })
      // Propagate Controller changes live to descendant UCAs, Controller Constraints, and Loss Scenarios
      if (nodeType === 'control_action' && 'controller' in changedFields) {
        const newController = changedFields.controller
        nodes.filter(n => n.data?.nodeType === 'uca' && n.data.control_action_id === nodeId).forEach(u => {
          updateRFNode(u.id, { controller: newController })
          socket.emit('node:updated', { project_id: projectId, node_type: 'uca', node_id: u.data.id, changed_fields: { controller: newController } })
          nodes.filter(n => n.data?.nodeType === 'loss_scenario' && n.data.uca_id === u.data.id).forEach(ls => {
            updateRFNode(ls.id, { controller: newController })
            socket.emit('node:updated', { project_id: projectId, node_type: 'loss_scenario', node_id: ls.data.id, changed_fields: { controller: newController } })
          })
          nodes.filter(n => n.data?.nodeType === 'controller_constraint' && n.data.linked_uca_id === u.data.id).forEach(cc => {
            updateRFNode(cc.id, { controller: newController })
            socket.emit('node:updated', { project_id: projectId, node_type: 'controller_constraint', node_id: cc.data.id, changed_fields: { controller: newController } })
          })
        })
      }
      // When a UCA is re-parented onto a different Control Action, cascade its new Controller to its own children
      if (nodeType === 'uca' && 'control_action_id' in changedFields && result?.controller !== undefined) {
        const newController = result.controller
        nodes.filter(n => n.data?.nodeType === 'loss_scenario' && n.data.uca_id === nodeId).forEach(ls => {
          updateRFNode(ls.id, { controller: newController })
          socket.emit('node:updated', { project_id: projectId, node_type: 'loss_scenario', node_id: ls.data.id, changed_fields: { controller: newController } })
        })
        nodes.filter(n => n.data?.nodeType === 'controller_constraint' && n.data.linked_uca_id === nodeId).forEach(cc => {
          updateRFNode(cc.id, { controller: newController })
          socket.emit('node:updated', { project_id: projectId, node_type: 'controller_constraint', node_id: cc.data.id, changed_fields: { controller: newController } })
        })
      }
      // Update parent edges when structural parent fields change; compute old/new RF IDs for remote sync
      let oldParentRfId, newParentRfId
      if ('parent_loss_id' in changedFields) {
        const oldPid = nodeData.parent_loss_id
        const newPid = changedFields.parent_loss_id
        oldParentRfId = oldPid ? `loss-${oldPid}` : `root-${projectId}`
        newParentRfId = newPid ? `loss-${newPid}` : `root-${projectId}`
        removeRFEdge(`e-${oldParentRfId}-loss-${nodeId}`)
        addRFEdge(makeRFEdge(newParentRfId, rfNodeId, false))
      }
      if ('parent_hazard_id' in changedFields) {
        const oldPid = nodeData.parent_hazard_id
        const newPid = changedFields.parent_hazard_id
        oldParentRfId = oldPid ? `hazard-${oldPid}` : null
        newParentRfId = newPid ? `hazard-${newPid}` : null
        if (oldPid) removeRFEdge(`e-hazard-${oldPid}-hazard-${nodeId}`)
        if (newPid) addRFEdge(makeRFEdge(`hazard-${newPid}`, rfNodeId, false))
      }
      if ('control_action_id' in changedFields) {
        const oldCid = nodeData.control_action_id
        const newCid = changedFields.control_action_id
        oldParentRfId = oldCid ? `ca-${oldCid}` : null
        newParentRfId = newCid ? `ca-${newCid}` : null
        if (oldCid) removeRFEdge(`e-ca-${oldCid}-uca-${nodeId}`)
        if (newCid) addRFEdge(makeRFEdge(`ca-${newCid}`, rfNodeId, false))
      }
      if ('uca_id' in changedFields) {
        const oldUid = nodeData.uca_id
        const newUid = changedFields.uca_id
        oldParentRfId = oldUid ? `uca-${oldUid}` : null
        newParentRfId = newUid ? `uca-${newUid}` : null
        if (oldUid) removeRFEdge(`e-uca-${oldUid}-ls-${nodeId}`)
        if (newUid) addRFEdge(makeRFEdge(`uca-${newUid}`, rfNodeId, false))
      }
      if ('linked_hazard_id' in changedFields) {
        const oldHid = nodeData.linked_hazard_id
        const newHid = changedFields.linked_hazard_id
        oldParentRfId = oldHid ? `hazard-${oldHid}` : null
        newParentRfId = newHid ? `hazard-${newHid}` : null
        if (oldHid) removeRFEdge(`e-hazard-${oldHid}-sc-${nodeId}`)
        if (newHid) addRFEdge(makeRFEdge(`hazard-${newHid}`, `sc-${nodeId}`, false))
      }
      if ('linked_uca_id' in changedFields) {
        const oldUid = nodeData.linked_uca_id
        const newUid = changedFields.linked_uca_id
        oldParentRfId = oldUid ? `uca-${oldUid}` : null
        newParentRfId = newUid ? `uca-${newUid}` : null
        if (oldUid) removeRFEdge(`e-uca-${oldUid}-cc-${nodeId}`)
        if (newUid) addRFEdge(makeRFEdge(`uca-${newUid}`, `cc-${nodeId}`, false))
      }
      socket.emit('node:updated', {
        project_id: projectId,
        node_type: nodeType,
        node_id: nodeId,
        changed_fields: mergedUpdate,
        ...(oldParentRfId !== undefined ? { old_parent_rf_id: oldParentRfId } : {}),
        ...(newParentRfId !== undefined ? { new_parent_rf_id: newParentRfId } : {}),
      })
      ;(result?.relabeled || []).forEach(({ nodeType: nt, id, label }) => {
        socket.emit('node:updated', { project_id: projectId, node_type: nt, node_id: id, changed_fields: { label } })
      })
      const STRUCT_PARENT_FIELDS = ['parent_loss_id', 'parent_hazard_id', 'control_action_id', 'uca_id', 'linked_hazard_id', 'linked_uca_id']
      const reparentField = STRUCT_PARENT_FIELDS.find(f => f in changedFields)
      if (reparentField) {
        useCanvasStore.getState().pushHistory({
          action: 'reparent',
          rfId: rfNodeId,
          nodeType,
          nodeId,
          projectId,
          fkField: reparentField,
          oldValue: nodeData[reparentField] ?? null,
          newValue: changedFields[reparentField] ?? null,
          oldLabel: nodeData.label,
          newLabel: mergedUpdate.label || nodeData.label,
          oldParentRfId,
          newParentRfId,
        })
      }
      const nonReparentChanged = Object.fromEntries(
        Object.entries(changedFields).filter(([k]) => !STRUCT_PARENT_FIELDS.includes(k))
      )
      if (Object.keys(nonReparentChanged).length > 0) {
        useCanvasStore.getState().pushHistory({
          action: 'fieldEdit',
          rfId: rfNodeId,
          nodeType,
          nodeId,
          projectId,
          changedFields: nonReparentChanged,
          previousFields: Object.fromEntries(Object.keys(nonReparentChanged).map(k => [k, nodeData[k] ?? null])),
        })
      }
    } catch (err) {
      alert(err.message || 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this node? This may affect dependent nodes.')) return
    setDeleting(true)
    try {
      const result = await deleteNode(projectId, nodeType, nodeId)
      socket.emit('node:deleted', { project_id: projectId, node_type: nodeType, node_id: nodeId })
      removeRFNode(rfNodeId)
      setSelectedNode(null)
      useCanvasStore.getState().pushHistory({
        action: 'delete',
        rfId: rfNodeId,
        nodeType,
        nodeId,
        projectId,
        snapshot: {
          nodeData: { ...nodeData },
          position: { ...(selectedNode?.position || {}) },
          rfNodeType: selectedNode?.type,
        },
      })
      const ORPHAN_NULL_FIELD = {
        loss: 'parent_loss_id',
        hazard: 'parent_hazard_id',
        system_constraint: 'linked_hazard_id',
        uca: 'control_action_id',
        controller_constraint: 'linked_uca_id',
        loss_scenario: 'uca_id',
      }
      ;(result?.orphaned || []).forEach(({ nodeType: nt, id, label }) => {
        const nullField = ORPHAN_NULL_FIELD[nt]
        const prefix = nodeTypeToPrefix(nt)
        const changed = { label, ...(nullField ? { [nullField]: null } : {}) }
        useCanvasStore.getState().updateRFNode(`${prefix}-${id}`, changed)
        socket.emit('node:updated', { project_id: projectId, node_type: nt, node_id: id, changed_fields: changed })
      })
    } catch (err) {
      alert(err.message || 'Failed to delete node.')
      setDeleting(false)
    }
  }

  async function handleAddLink(fromType, fromId, toType, toId) {
    setLinkError('')
    try {
      const result = await createLink(projectId, fromType, fromId, toType, toId)
      const idList = nodeData[`${toType}_ids`] || []
      const newIds = [...idList, toId]
      updateRFNode(rfNodeId, { [`${toType}_ids`]: newIds })
      setFormData(prev => ({ ...prev, [`${toType}_ids`]: newIds }))
      if (fromType === 'hazard' && toType === 'loss') {
        addRFEdge(makeRFEdge(`hazard-${fromId}`, `loss-${toId}`, true))
      } else {
        addRFEdge(makeRFEdge(`${nodeTypeToPrefix(fromType)}-${fromId}`, `${nodeTypeToPrefix(toType)}-${toId}`, true))
      }
      // Propagate UCA→hazard link down to child LS nodes
      if (fromType === 'uca' && toType === 'hazard') {
        for (const lsId of (result?.propagated_ls_ids || [])) {
          const lsRfId = `ls-${lsId}`
          const lsNode = nodes.find(n => n.id === lsRfId)
          if (lsNode && !(lsNode.data.hazard_ids || []).includes(toId)) {
            updateRFNode(lsRfId, { hazard_ids: [...(lsNode.data.hazard_ids || []), toId] })
            addRFEdge(makeRFEdge(lsRfId, `hazard-${toId}`, true))
          }
        }
      }
    } catch (err) {
      setLinkError(err.message || 'Failed to add link.')
    }
  }

  async function handleRemoveLink(fromType, fromId, toType, toId) {
    setLinkError('')
    try {
      const result = await deleteLink(projectId, fromType, fromId, toType, toId)
      const idList = nodeData[`${toType}_ids`] || []
      const newIds = idList.filter(id => id !== toId)
      updateRFNode(rfNodeId, { [`${toType}_ids`]: newIds })
      setFormData(prev => ({ ...prev, [`${toType}_ids`]: newIds }))
      const edgeId = (fromType === 'hazard' && toType === 'loss')
        ? `e-hazard-${fromId}-loss-${toId}`
        : `e-${nodeTypeToPrefix(fromType)}-${fromId}-${nodeTypeToPrefix(toType)}-${toId}`
      removeRFEdge(edgeId)
      // Propagate UCA→hazard removal down to child LS nodes
      if (fromType === 'uca' && toType === 'hazard') {
        for (const lsId of (result?.propagated_ls_ids || [])) {
          const lsRfId = `ls-${lsId}`
          const lsNode = nodes.find(n => n.id === lsRfId)
          if (lsNode) {
            updateRFNode(lsRfId, { hazard_ids: (lsNode.data.hazard_ids || []).filter(id => id !== toId) })
            removeRFEdge(`e-ls-${lsId}-hazard-${toId}`)
          }
        }
      }
    } catch (err) {
      setLinkError(err.message || 'Failed to remove link.')
    }
  }

  async function handleSetSingleLink(fromType, fromId, toType, toId, oldToId) {
    setLinkError('')
    try {
      if (oldToId) {
        await deleteLink(projectId, fromType, fromId, toType, oldToId)
      }
      if (toId) {
        await createLink(projectId, fromType, fromId, toType, toId)
      }
      updateRFNode(rfNodeId, { [`linked_${toType}_id`]: toId || null })
      setFormData(prev => ({ ...prev, [`linked_${toType}_id`]: toId || null }))
    } catch (err) {
      setLinkError(err.message || 'Failed to update link.')
    }
  }

  const currentLossIds = formData.loss_ids || nodeData.loss_ids || []
  const currentHazardIds = formData.hazard_ids || nodeData.hazard_ids || []
  const currentUcaIds = formData.uca_ids || nodeData.uca_ids || []
  const linkedHazardId = formData.linked_hazard_id || nodeData.linked_hazard_id

  return (
    <div className="w-80 bg-white dark:bg-neutral-800 border-l border-gray-200 dark:border-neutral-700 flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-neutral-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {LAYER_LABELS[nodeType] || nodeType.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-neutral-300 p-1 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        {nodeType !== 'root' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Label</label>
            <input
              type="text"
              value={formData.label || ''}
              onChange={e => handleFieldChange('label', e.target.value)}
              className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-streepa-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
            />
          </div>
        )}

        {/* Fields by type */}
        {nodeType === 'root' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Title</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={e => handleFieldChange('title', e.target.value)}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-streepa-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Purpose Statement</label>
              <textarea
                value={formData.purpose_statement || ''}
                onChange={e => handleFieldChange('purpose_statement', e.target.value)}
                rows={4}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-streepa-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
          </>
        )}

        {nodeType === 'loss' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-red-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Parent Loss</label>
              <SearchableSelect
                value={formData.parent_loss_id || ''}
                onChange={v => handleFieldChange('parent_loss_id', v)}
                options={[...allLosses].sort((a, b) => {
                  const pa = (a.label || '').replace(/^L-/, '').split('.').map(n => parseInt(n) || 0)
                  const pb = (b.label || '').replace(/^L-/, '').split('.').map(n => parseInt(n) || 0)
                  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const d = (pa[i] || 0) - (pb[i] || 0)
                    if (d !== 0) return d
                  }
                  return 0
                }).filter(l => l.id !== nodeId)}
                placeholder="None (top-level)"
                focusRingClass="focus:ring-red-400"
                isMainFn={isMainLoss}
              />
            </div>
          </>
        )}

        {nodeType === 'hazard' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Parent Hazard</label>
              <SearchableSelect
                value={formData.parent_hazard_id || ''}
                onChange={v => handleFieldChange('parent_hazard_id', v)}
                options={allHazards.filter(h => h.id !== nodeId)}
                placeholder="None (top-level)"
                focusRingClass="focus:ring-orange-400"
                isMainFn={isMainHazard}
              />
            </div>
          </>
        )}

        {nodeType === 'system_constraint' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Parent Hazard</label>
              <SearchableSelect
                value={formData.linked_hazard_id || ''}
                onChange={v => handleFieldChange('linked_hazard_id', v)}
                options={allHazards}
                placeholder="None"
                focusRingClass="focus:ring-yellow-400"
                isMainFn={isMainHazard}
              />
            </div>
          </>
        )}

        {nodeType === 'control_action' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Controller</label>
              <input
                type="text"
                value={formData.controller || ''}
                onChange={e => handleFieldChange('controller', e.target.value)}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={e => handleFieldChange('name', e.target.value)}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
          </>
        )}

        {nodeType === 'uca' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">UCA Type</label>
              <select
                value={formData.uca_type || ''}
                onChange={e => handleFieldChange('uca_type', e.target.value)}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              >
                <option value="">Select type...</option>
                {Object.entries(UCA_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k} style={{ color: UCA_TYPE_COLORS[k] }}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Control Action</label>
              <SearchableSelect
                value={formData.control_action_id || ''}
                onChange={v => handleFieldChange('control_action_id', v)}
                options={allCAs.map(ca => ({ ...ca, label: ca.label || ca.name, description: ca.label ? ca.name : undefined }))}
                placeholder="None"
                focusRingClass="focus:ring-blue-400"
              />
            </div>
            {nodeData.controller && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-neutral-400 mb-1">Controller</label>
                <p className="text-xs text-gray-400 dark:text-neutral-500 italic mb-1">Automatically inherited from parent Control Action</p>
                <p className="text-xs text-gray-600 dark:text-neutral-300">{nodeData.controller}</p>
              </div>
            )}
          </>
        )}

        {nodeType === 'controller_constraint' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Parent UCA</label>
              <SearchableSelect
                value={formData.linked_uca_id || ''}
                onChange={v => handleFieldChange('linked_uca_id', v)}
                options={allUCAs}
                placeholder="None"
                focusRingClass="focus:ring-teal-400"
              />
            </div>
            {nodeData.controller && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-neutral-400 mb-1">Controller</label>
                <p className="text-xs text-gray-400 dark:text-neutral-500 italic mb-1">Automatically inherited from parent Control Action</p>
                <p className="text-xs text-gray-600 dark:text-neutral-300">{nodeData.controller}</p>
              </div>
            )}
          </>
        )}

        {nodeType === 'loss_scenario' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white dark:bg-neutral-700 text-gray-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-neutral-300 mb-1">UCA</label>
              <SearchableSelect
                value={formData.uca_id || ''}
                onChange={v => handleFieldChange('uca_id', v)}
                options={allUCAs}
                placeholder="None"
                focusRingClass="focus:ring-purple-400"
              />
            </div>
            {nodeData.controller && (
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-neutral-400 mb-1">Controller</label>
                <p className="text-xs text-gray-400 dark:text-neutral-500 italic mb-1">Automatically inherited from parent Control Action</p>
                <p className="text-xs text-gray-600 dark:text-neutral-300">{nodeData.controller}</p>
              </div>
            )}
          </>
        )}

        {/* Save / Delete buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-streepa-600 hover:bg-streepa-700 disabled:bg-streepa-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {nodeType !== 'root' && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-sm font-medium rounded-lg transition-colors border border-red-200 dark:border-red-800"
            >
              {deleting ? '...' : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Link management */}
        {linkError && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400">{linkError}</div>
        )}

        {/* Hazard → Losses */}
        {nodeType === 'hazard' && (
          <div className="border-t border-gray-100 dark:border-neutral-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-neutral-400 mb-2">Linked Losses</p>
            {allLosses.length === 0
              ? <p className="text-xs text-gray-400 dark:text-neutral-500">No losses exist yet.</p>
              : (
                <SearchableCheckboxList
                  items={allLosses}
                  selectedIds={currentLossIds}
                  onToggle={(id, checked) => {
                    if (checked) handleAddLink('hazard', nodeId, 'loss', id)
                    else handleRemoveLink('hazard', nodeId, 'loss', id)
                  }}
                  accentClass="accent-orange-500"
                />
              )
            }
          </div>
        )}

        {/* UCA → Hazards */}
        {nodeType === 'uca' && (
          <div className="border-t border-gray-100 dark:border-neutral-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-neutral-400 mb-2">Linked Hazards</p>
            {allHazards.length === 0
              ? <p className="text-xs text-gray-400 dark:text-neutral-500">No hazards exist yet.</p>
              : (
                <SearchableCheckboxList
                  items={allHazards}
                  selectedIds={currentHazardIds}
                  onToggle={(id, checked) => {
                    if (checked) handleAddLink('uca', nodeId, 'hazard', id)
                    else handleRemoveLink('uca', nodeId, 'hazard', id)
                  }}
                  accentClass="accent-blue-500"
                  isMainFn={isMainHazard}
                />
              )
            }
          </div>
        )}

        {/* Loss Scenario → Hazards (inherited from parent UCA, read-only) */}
        {nodeType === 'loss_scenario' && (
          <div className="border-t border-gray-100 dark:border-neutral-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-neutral-400 mb-1">Inherited Hazards</p>
            <p className="text-xs text-gray-400 dark:text-neutral-500 mb-2">Automatically inherited from parent UCA</p>
            {(() => {
              const parentUCA = allUCAs.find(u => u.id === nodeData.uca_id)
              const hazardIds = parentUCA ? (parentUCA.hazard_ids || []) : (nodeData.hazard_ids || [])
              const inherited = allHazards.filter(h => hazardIds.includes(h.id))
              if (inherited.length === 0) return <p className="text-xs text-gray-400 dark:text-neutral-500 italic">None — parent UCA has no linked hazards</p>
              return (
                <div className="flex flex-wrap gap-1">
                  {inherited.map(h => (
                    <span key={h.id} className="inline-flex items-center text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                      {h.label}
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {/* System Constraint → Hazards (multi-select checkboxes) */}
        {nodeType === 'system_constraint' && (
          <div className="border-t border-gray-100 dark:border-neutral-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-neutral-400 mb-2">Linked Hazards</p>
            {allHazards.length === 0
              ? <p className="text-xs text-gray-400 dark:text-neutral-500">No hazards exist yet.</p>
              : (
                <SearchableCheckboxList
                  items={allHazards}
                  selectedIds={currentHazardIds}
                  onToggle={(id, checked) => {
                    if (checked) handleAddLink('system_constraint', nodeId, 'hazard', id)
                    else handleRemoveLink('system_constraint', nodeId, 'hazard', id)
                  }}
                  accentClass="accent-yellow-500"
                  isMainFn={isMainHazard}
                />
              )
            }
          </div>
        )}

        {/* Controller Constraint → UCAs (multi-select checkboxes) */}
        {nodeType === 'controller_constraint' && (
          <div className="border-t border-gray-100 dark:border-neutral-700 pt-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-neutral-400 mb-2">Linked UCAs</p>
            {allUCAs.length === 0
              ? <p className="text-xs text-gray-400 dark:text-neutral-500">No UCAs exist yet.</p>
              : (
                <SearchableCheckboxList
                  items={allUCAs}
                  selectedIds={currentUcaIds}
                  onToggle={(id, checked) => {
                    if (checked) handleAddLink('controller_constraint', nodeId, 'uca', id)
                    else handleRemoveLink('controller_constraint', nodeId, 'uca', id)
                  }}
                  accentClass="accent-teal-500"
                />
              )
            }
          </div>
        )}

      </div>
    </div>
  )
}
