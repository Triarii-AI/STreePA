import React, { useState, useMemo } from 'react'
import { createNode, createLink } from '../../api.js'
import socket from '../../socket.js'
import useCanvasStore from '../../store/canvasStore.js'
import { UCA_TYPE_LABELS, UCA_TYPE_COLORS, LAYER_Y_POSITIONS, NODE_HORIZONTAL_SPACING, makeRFEdge, nodeTypeToPrefix } from '../../constants.js'

const NODE_TYPE_LABELS = {
  loss: 'Loss',
  hazard: 'Hazard',
  system_constraint: 'System Constraint',
  control_action: 'Control Action',
  uca: 'UCA',
  loss_scenario: 'Loss Scenario',
}

const LABEL_EXAMPLES = {
  loss: 'e.g. L-3',
  hazard: 'e.g. H-4',
  system_constraint: 'e.g. SC-2',
  control_action: 'e.g. CA-1',
  uca: 'e.g. UCA-5',
  loss_scenario: 'e.g. LS-6',
}

const NODE_TYPE_PREFIXES = {
  loss: 'loss',
  hazard: 'hazard',
  system_constraint: 'sc',
  control_action: 'ca',
  uca: 'uca',
  loss_scenario: 'ls',
}

const RF_NODE_TYPES = {
  loss: 'lossNode',
  hazard: 'hazardNode',
  system_constraint: 'scNode',
  control_action: 'caNode',
  uca: 'ucaNode',
  loss_scenario: 'lsNode',
}

function convertAPINodeToRF(nodeType, nodeData, position) {
  const prefix = NODE_TYPE_PREFIXES[nodeType]
  return {
    id: `${prefix}-${nodeData.id}`,
    type: RF_NODE_TYPES[nodeType],
    position,
    data: { ...nodeData, nodeType },
  }
}

export default function AddNodeForm({ nodeType, projectId, onClose, onCreated }) {
  const addRFNode = useCanvasStore(s => s.addRFNode)
  const addRFEdge = useCanvasStore(s => s.addRFEdge)
  const currentProject = useCanvasStore(s => s.currentProject)
  const nodes = useCanvasStore(s => s.nodes)

  const [formData, setFormData] = useState({})
  const [selectedLossIds, setSelectedLossIds] = useState([])
  const [selectedHazardIds, setSelectedHazardIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function getNodesByType(nt) {
    return nodes.filter(n => n.data?.nodeType === nt).map(n => n.data)
  }

  const allLosses = useMemo(() => getNodesByType('loss'), [nodes])
  const allHazards = useMemo(() => getNodesByType('hazard'), [nodes])
  const allCAs = useMemo(() => getNodesByType('control_action'), [nodes])
  const allUCAs = useMemo(() => getNodesByType('uca'), [nodes])

  function getDefaultPosition() {
    const sameTypeNodes = nodes.filter(n => n.data?.nodeType === nodeType)
    const x = sameTypeNodes.length * NODE_HORIZONTAL_SPACING + 100
    const y = LAYER_Y_POSITIONS[nodeType] || 400
    return { x, y }
  }

  function handleChange(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validate required fields
    if (nodeType === 'control_action' && !formData.name?.trim()) {
      setError('Name is required.')
      return
    }
    if (nodeType === 'uca' && (!formData.control_action_id || !formData.uca_type)) {
      setError('Control action and UCA type are required.')
      return
    }
    if (nodeType === 'loss_scenario' && !formData.uca_id) {
      setError('UCA is required.')
      return
    }
    if (nodeType === 'system_constraint' && !formData.linked_hazard_id) {
      setError('Parent hazard is required.')
      return
    }

    setLoading(true)
    try {
      const payload = { ...formData }
      if (payload.parent_hazard_id) payload.parent_hazard_id = parseInt(payload.parent_hazard_id)
      if (payload.linked_hazard_id) payload.linked_hazard_id = parseInt(payload.linked_hazard_id)
      if (payload.control_action_id) payload.control_action_id = parseInt(payload.control_action_id)
      if (payload.uca_id) payload.uca_id = parseInt(payload.uca_id)

      const result = await createNode(projectId, nodeType, payload)
      const nodeData = result[nodeType] || result.node || result

      const position = getDefaultPosition()
      const rfNode = convertAPINodeToRF(nodeType, nodeData, position)
      addRFNode(rfNode)

      // Auto-add parent-child solid edges
      if (nodeType === 'loss' && currentProject?.id) {
        addRFEdge(makeRFEdge(`root-${currentProject.id}`, `loss-${nodeData.id}`, false))
      }
      if (nodeType === 'hazard' && payload.parent_hazard_id) {
        addRFEdge(makeRFEdge(`hazard-${payload.parent_hazard_id}`, `hazard-${nodeData.id}`, false))
      }
      if (nodeType === 'uca' && payload.control_action_id) {
        addRFEdge(makeRFEdge(`ca-${payload.control_action_id}`, `uca-${nodeData.id}`, false))
      }
      if (nodeType === 'loss_scenario' && payload.uca_id) {
        addRFEdge(makeRFEdge(`uca-${payload.uca_id}`, `ls-${nodeData.id}`, false))
      }
      if (nodeType === 'system_constraint' && payload.linked_hazard_id) {
        addRFEdge(makeRFEdge(`hazard-${payload.linked_hazard_id}`, `sc-${nodeData.id}`, false))
      }

      // Create hazard→loss links
      if (nodeType === 'hazard' && selectedLossIds.length > 0) {
        const linkedIds = []
        for (const lid of selectedLossIds) {
          try {
            await createLink(projectId, 'hazard', nodeData.id, 'loss', lid)
            addRFEdge(makeRFEdge(`hazard-${nodeData.id}`, `loss-${lid}`, true))
            linkedIds.push(lid)
          } catch (_) {}
        }
        if (linkedIds.length > 0) {
          useCanvasStore.getState().updateRFNode(`hazard-${nodeData.id}`, { loss_ids: linkedIds })
        }
      }

      // Create hazard links for UCA / LS / SC
      if (['uca', 'loss_scenario', 'system_constraint'].includes(nodeType) && selectedHazardIds.length > 0) {
        const linkedHazardIds = []
        const prefix = NODE_TYPE_PREFIXES[nodeType]
        for (const hid of selectedHazardIds) {
          try {
            await createLink(projectId, nodeType, nodeData.id, 'hazard', hid)
            addRFEdge(makeRFEdge(`${prefix}-${nodeData.id}`, `hazard-${hid}`, true))
            linkedHazardIds.push(hid)
          } catch (_) {}
        }
        if (linkedHazardIds.length > 0) {
          useCanvasStore.getState().updateRFNode(rfNode.id, { hazard_ids: linkedHazardIds })
        }
      }

      socket.emit('node:added', {
        project_id: projectId,
        node_type: nodeType,
        node_data: {
          ...nodeData,
          loss_ids: selectedLossIds,
          hazard_ids: selectedHazardIds,
        },
        position,
      })

      useCanvasStore.getState().pushHistory({
        action: 'create',
        rfId: rfNode.id,
        nodeType,
        nodeId: nodeData.id,
        projectId,
        snapshot: {
          nodeData: { ...nodeData, nodeType, loss_ids: selectedLossIds.length > 0 ? selectedLossIds : [], hazard_ids: selectedHazardIds.length > 0 ? selectedHazardIds : [] },
          position,
          rfNodeType: RF_NODE_TYPES[nodeType],
        },
      })
      onCreated(rfNode)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create node.')
      setLoading(false)
    }
  }

  const title = NODE_TYPE_LABELS[nodeType] || nodeType
  const labelExample = LABEL_EXAMPLES[nodeType] || ''

  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-80 relative">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <h3 className="text-sm font-semibold text-gray-900 mb-1">Add {title}</h3>
      <p className="text-xs text-gray-400 mb-4">Will be auto-labeled ({labelExample})</p>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Loss */}
        {nodeType === 'loss' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
            <textarea
              value={formData.description || ''}
              onChange={e => handleChange('description', e.target.value)}
              rows={3}
              placeholder="Describe the loss event..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
              required
            />
          </div>
        )}

        {/* Hazard */}
        {nodeType === 'hazard' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleChange('description', e.target.value)}
                rows={3}
                placeholder="Describe the hazard..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parent Hazard (optional)</label>
              <select
                value={formData.parent_hazard_id || ''}
                onChange={e => handleChange('parent_hazard_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">None (top-level)</option>
                {allHazards.map(h => (
                  <option key={h.id} value={h.id}>{h.label}</option>
                ))}
              </select>
            </div>
            {allLosses.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link to Losses (optional)</label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-32 overflow-y-auto">
                  {allLosses.map(l => (
                    <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLossIds.includes(l.id)}
                        onChange={e => setSelectedLossIds(prev =>
                          e.target.checked ? [...prev, l.id] : prev.filter(id => id !== l.id)
                        )}
                        className="accent-orange-500"
                      />
                      <span className="text-xs font-medium text-gray-700">{l.label}</span>
                      {l.description && <span className="text-xs text-gray-400 truncate">{l.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* System Constraint */}
        {nodeType === 'system_constraint' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-red-500">*</span></label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleChange('description', e.target.value)}
                rows={3}
                placeholder="Describe the system constraint..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Parent Hazard <span className="text-red-500">*</span></label>
              <select
                value={formData.linked_hazard_id || ''}
                onChange={e => handleChange('linked_hazard_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                required
              >
                <option value="">Select hazard...</option>
                {allHazards.map(h => (
                  <option key={h.id} value={h.id}>{h.label}{h.description ? ` — ${h.description.slice(0, 40)}` : ''}</option>
                ))}
              </select>
            </div>
            {allHazards.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Additional Linked Hazards (optional)</label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-32 overflow-y-auto">
                  {allHazards.map(h => (
                    <label key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedHazardIds.includes(h.id)}
                        onChange={e => setSelectedHazardIds(prev =>
                          e.target.checked ? [...prev, h.id] : prev.filter(id => id !== h.id)
                        )}
                        className="accent-yellow-500"
                      />
                      <span className="text-xs font-medium text-gray-700">{h.label}</span>
                      {h.description && <span className="text-xs text-gray-400 truncate">{h.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Control Action */}
        {nodeType === 'control_action' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={e => handleChange('name', e.target.value)}
              placeholder="e.g. Apply brakes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              required
            />
          </div>
        )}

        {/* UCA */}
        {nodeType === 'uca' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleChange('description', e.target.value)}
                rows={2}
                placeholder="Describe the unsafe control action..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Control Action <span className="text-red-500">*</span></label>
              <select
                value={formData.control_action_id || ''}
                onChange={e => handleChange('control_action_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              >
                <option value="">Select control action...</option>
                {allCAs.map(ca => (
                  <option key={ca.id} value={ca.id}>{ca.label || ca.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">UCA Type <span className="text-red-500">*</span></label>
              <select
                value={formData.uca_type || ''}
                onChange={e => handleChange('uca_type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              >
                <option value="">Select type...</option>
                {Object.entries(UCA_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k} style={{ color: UCA_TYPE_COLORS[k] }}>{v}</option>
                ))}
              </select>
            </div>
            {allHazards.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link to Hazards (optional)</label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-32 overflow-y-auto">
                  {allHazards.map(h => (
                    <label key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedHazardIds.includes(h.id)}
                        onChange={e => setSelectedHazardIds(prev =>
                          e.target.checked ? [...prev, h.id] : prev.filter(id => id !== h.id)
                        )}
                        className="accent-blue-500"
                      />
                      <span className="text-xs font-medium text-gray-700">{h.label}</span>
                      {h.description && <span className="text-xs text-gray-400 truncate">{h.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Loss Scenario */}
        {nodeType === 'loss_scenario' && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={e => handleChange('description', e.target.value)}
                rows={2}
                placeholder="Describe the loss scenario..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">UCA <span className="text-red-500">*</span></label>
              <select
                value={formData.uca_id || ''}
                onChange={e => handleChange('uca_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                required
              >
                <option value="">Select UCA...</option>
                {allUCAs.map(u => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </div>
            {allHazards.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link to Hazards (optional)</label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-32 overflow-y-auto">
                  {allHazards.map(h => (
                    <label key={h.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedHazardIds.includes(h.id)}
                        onChange={e => setSelectedHazardIds(prev =>
                          e.target.checked ? [...prev, h.id] : prev.filter(id => id !== h.id)
                        )}
                        className="accent-purple-500"
                      />
                      <span className="text-xs font-medium text-gray-700">{h.label}</span>
                      {h.description && <span className="text-xs text-gray-400 truncate">{h.description}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? 'Adding...' : `Add ${title}`}
          </button>
        </div>
      </form>
    </div>
  )
}
