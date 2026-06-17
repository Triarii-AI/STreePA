import React, { useState, useEffect } from 'react'
import useCanvasStore from '../store/canvasStore.js'
import { updateNode, deleteNode, createLink, deleteLink } from '../api.js'
import socket from '../socket.js'
import { LAYER_COLORS, UCA_TYPE_COLORS, UCA_TYPE_LABELS, makeRFEdge, nodeTypeToPrefix } from '../constants.js'

const LAYER_LABELS = {
  root: 'Root',
  loss: 'Loss',
  hazard: 'Hazard',
  system_constraint: 'System Constraint',
  control_action: 'Control Action',
  uca: 'UCA',
  loss_scenario: 'Loss Scenario',
}

const LAYER_BADGE_COLORS = {
  root: 'bg-indigo-100 text-indigo-700',
  loss: 'bg-red-100 text-red-700',
  hazard: 'bg-orange-100 text-orange-700',
  system_constraint: 'bg-yellow-100 text-yellow-700',
  control_action: 'bg-green-100 text-green-700',
  uca: 'bg-blue-100 text-blue-700',
  loss_scenario: 'bg-purple-100 text-purple-700',
}

function LinkChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
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
  const toggleNodeCollapse = useCanvasStore(s => s.toggleNodeCollapse)
  const collapsedNodes = useCanvasStore(s => s.collapsedNodes)
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
  }, [selectedNode?.id])

  if (!selectedNode || !nodeType) return null

  const colors = LAYER_COLORS[nodeType] || LAYER_COLORS.loss
  const badgeClass = LAYER_BADGE_COLORS[nodeType] || 'bg-gray-100 text-gray-700'

  // Get project data from all nodes in store
  function getNodesByType(nt) {
    return nodes.filter(n => n.data?.nodeType === nt).map(n => n.data)
  }

  const allLosses = getNodesByType('loss')
  const allHazards = getNodesByType('hazard')
  const allUCAs = getNodesByType('uca')

  // Check if node has children (for collapse toggle)
  const hasChildren = edges.some(e => e.source === rfNodeId && !(e.style?.strokeDasharray))
  const isCollapsed = collapsedNodes.has(rfNodeId)

  function handleFieldChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const changedFields = {}
      Object.keys(formData).forEach(k => {
        if (formData[k] !== nodeData[k] && k !== 'nodeType' && k !== 'hidden') {
          changedFields[k] = formData[k]
        }
      })
      if (Object.keys(changedFields).length === 0) { setSaving(false); return }

      const result = await updateNode(projectId, nodeType, nodeId, changedFields)
      updateRFNode(rfNodeId, changedFields)
      socket.emit('node:updated', {
        project_id: projectId,
        node_type: nodeType,
        node_id: nodeId,
        changed_fields: changedFields,
      })
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
      await deleteNode(projectId, nodeType, nodeId)
      socket.emit('node:deleted', { project_id: projectId, node_type: nodeType, node_id: nodeId })
      removeRFNode(rfNodeId)
      setSelectedNode(null)
    } catch (err) {
      alert(err.message || 'Failed to delete node.')
      setDeleting(false)
    }
  }

  async function handleAddLink(fromType, fromId, toType, toId) {
    setLinkError('')
    try {
      await createLink(projectId, fromType, fromId, toType, toId)
      const idList = nodeData[`${toType}_ids`] || []
      const newIds = [...idList, toId]
      updateRFNode(rfNodeId, { [`${toType}_ids`]: newIds })
      setFormData(prev => ({ ...prev, [`${toType}_ids`]: newIds }))
      // Loss is parent of Hazard: edge runs loss→hazard (solid), not hazard→loss
      if (fromType === 'hazard' && toType === 'loss') {
        addRFEdge(makeRFEdge(`loss-${toId}`, `hazard-${fromId}`, false))
      } else {
        addRFEdge(makeRFEdge(`${nodeTypeToPrefix(fromType)}-${fromId}`, `${nodeTypeToPrefix(toType)}-${toId}`, true))
      }
    } catch (err) {
      setLinkError(err.message || 'Failed to add link.')
    }
  }

  async function handleRemoveLink(fromType, fromId, toType, toId) {
    setLinkError('')
    try {
      await deleteLink(projectId, fromType, fromId, toType, toId)
      const idList = nodeData[`${toType}_ids`] || []
      const newIds = idList.filter(id => id !== toId)
      updateRFNode(rfNodeId, { [`${toType}_ids`]: newIds })
      setFormData(prev => ({ ...prev, [`${toType}_ids`]: newIds }))
      // Edge was stored as loss→hazard, so the ID uses that order
      const edgeId = (fromType === 'hazard' && toType === 'loss')
        ? `e-loss-${toId}-hazard-${fromId}`
        : `e-${nodeTypeToPrefix(fromType)}-${fromId}-${nodeTypeToPrefix(toType)}-${toId}`
      removeRFEdge(edgeId)
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
  const linkedHazardId = formData.linked_hazard_id || nodeData.linked_hazard_id

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {LAYER_LABELS[nodeType] || nodeType.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Label</p>
          <p className="text-base font-bold text-gray-900">{nodeData.label || nodeData.name || rfNodeId}</p>
        </div>

        {/* Fields by type */}
        {nodeType === 'loss' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={e => handleFieldChange('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        )}

        {nodeType === 'hazard' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </>
        )}

        {nodeType === 'system_constraint' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={e => handleFieldChange('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
        )}

        {nodeType === 'control_action' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={e => handleFieldChange('name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </>
        )}

        {nodeType === 'uca' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleFieldChange('description', e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">UCA Type</label>
              <select
                value={formData.uca_type || ''}
                onChange={e => handleFieldChange('uca_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select type...</option>
                {Object.entries(UCA_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k} style={{ color: UCA_TYPE_COLORS[k] }}>{v}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {nodeType === 'loss_scenario' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={e => handleFieldChange('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
        )}

        {/* Save / Delete buttons */}
        {nodeType !== 'root' && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-lg transition-colors border border-red-200"
            >
              {deleting ? '...' : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              )}
            </button>
          </div>
        )}

        {/* Link management */}
        {linkError && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{linkError}</div>
        )}

        {/* Hazard → Losses */}
        {nodeType === 'hazard' && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Linked Losses</p>
            {allLosses.length === 0
              ? <p className="text-xs text-gray-400">No losses exist yet.</p>
              : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {allLosses.map(l => {
                    const isLinked = currentLossIds.includes(l.id)
                    return (
                      <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={e => {
                            if (e.target.checked) handleAddLink('hazard', nodeId, 'loss', l.id)
                            else handleRemoveLink('hazard', nodeId, 'loss', l.id)
                          }}
                          className="accent-orange-500"
                        />
                        <span className="text-xs font-medium text-gray-700">{l.label}</span>
                        {l.description && (
                          <span className="text-xs text-gray-400 truncate">{l.description}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* UCA → Hazards */}
        {nodeType === 'uca' && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Linked Hazards</p>
            {allHazards.length === 0
              ? <p className="text-xs text-gray-400">No hazards exist yet.</p>
              : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {allHazards.map(h => {
                    const isLinked = currentHazardIds.includes(h.id)
                    return (
                      <label key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={e => {
                            if (e.target.checked) handleAddLink('uca', nodeId, 'hazard', h.id)
                            else handleRemoveLink('uca', nodeId, 'hazard', h.id)
                          }}
                          className="accent-blue-500"
                        />
                        <span className="text-xs font-medium text-gray-700">{h.label}</span>
                        {h.description && (
                          <span className="text-xs text-gray-400 truncate">{h.description}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* Loss Scenario → Hazards */}
        {nodeType === 'loss_scenario' && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Linked Hazards</p>
            {allHazards.length === 0
              ? <p className="text-xs text-gray-400">No hazards exist yet.</p>
              : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {allHazards.map(h => {
                    const isLinked = currentHazardIds.includes(h.id)
                    return (
                      <label key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={e => {
                            if (e.target.checked) handleAddLink('loss_scenario', nodeId, 'hazard', h.id)
                            else handleRemoveLink('loss_scenario', nodeId, 'hazard', h.id)
                          }}
                          className="accent-purple-500"
                        />
                        <span className="text-xs font-medium text-gray-700">{h.label}</span>
                        {h.description && (
                          <span className="text-xs text-gray-400 truncate">{h.description}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* System Constraint → Hazard (single FK shown as checkboxes, only one can be active) */}
        {nodeType === 'system_constraint' && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Linked Hazard</p>
            {allHazards.length === 0
              ? <p className="text-xs text-gray-400">No hazards exist yet.</p>
              : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                  {allHazards.map(h => {
                    const isLinked = linkedHazardId === h.id
                    return (
                      <label key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isLinked}
                          onChange={async e => {
                            const newVal = e.target.checked ? h.id : null
                            const oldVal = linkedHazardId
                            setLinkError('')
                            try {
                              await updateNode(projectId, 'system_constraint', nodeId, { linked_hazard_id: newVal })
                              updateRFNode(rfNodeId, { linked_hazard_id: newVal })
                              setFormData(prev => ({ ...prev, linked_hazard_id: newVal }))
                              if (oldVal) removeRFEdge(`e-sc-${nodeId}-hazard-${oldVal}`)
                              if (newVal) addRFEdge(makeRFEdge(`sc-${nodeId}`, `hazard-${newVal}`, true))
                            } catch (err) {
                              setLinkError(err.message || 'Failed to update linked hazard.')
                            }
                          }}
                          className="accent-yellow-500"
                        />
                        <span className="text-xs font-medium text-gray-700">{h.label}</span>
                        {h.description && (
                          <span className="text-xs text-gray-400 truncate">{h.description}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* Collapse/Expand toggle */}
        {hasChildren && (
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => toggleNodeCollapse(rfNodeId)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <span>{isCollapsed ? 'Expand children' : 'Collapse children'}</span>
              <svg className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
