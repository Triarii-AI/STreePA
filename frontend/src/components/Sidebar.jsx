import React, { useState, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import useCanvasStore from '../store/canvasStore.js'
import { LAYER_COLORS } from '../constants.js'

const LAYER_DOT_COLORS = {
  loss: 'bg-red-400',
  hazard: 'bg-orange-400',
  system_constraint: 'bg-yellow-400',
  control_action: 'bg-green-400',
  uca: 'bg-blue-400',
  loss_scenario: 'bg-purple-400',
}

const LAYER_SECTION_LABELS = {
  loss: 'Losses',
  hazard: 'Hazards',
  system_constraint: 'System Constraints',
  control_action: 'Control Actions',
  uca: 'UCAs',
  loss_scenario: 'Loss Scenarios',
}

function SidebarSection({ title, items, nodeType, searchQuery, onItemClick }) {
  const [open, setOpen] = useState(true)
  const dotColor = LAYER_DOT_COLORS[nodeType] || 'bg-gray-400'

  const filtered = items.filter(item => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const label = (item.label || '').toLowerCase()
    const desc = (item.description || item.name || '').toLowerCase()
    return label.includes(q) || desc.includes(q)
  })

  if (filtered.length === 0 && searchQuery) return null

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:bg-gray-100 rounded-lg transition-colors"
      >
        <span>{title}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400 font-normal normal-case tracking-normal">{filtered.length}</span>
          <svg
            className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-gray-400 italic">None yet</p>
          ) : (
            filtered.map(item => (
              <button
                key={item.rfId}
                onClick={() => onItemClick(item.rfId)}
                className={`w-full flex items-start gap-2 px-3 py-1.5 text-left rounded-lg hover:bg-gray-100 transition-colors ${item.isSubHazard ? 'pl-6' : ''}`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-gray-800 truncate">{item.label}</div>
                  {(item.description || item.name) && (
                    <div className="text-xs text-gray-400 truncate">{item.description || item.name}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const nodes = useCanvasStore(s => s.nodes)
  const setFocusNode = useCanvasStore(s => s.setFocusNode)
  const reactFlow = useReactFlow()

  const layers = useMemo(() => {
    const groups = {
      loss: [],
      hazard: [],
      system_constraint: [],
      control_action: [],
      uca: [],
      loss_scenario: [],
    }

    nodes.forEach(n => {
      const nt = n.data?.nodeType
      if (!nt || nt === 'root' || !groups[nt]) return
      groups[nt].push({
        rfId: n.id,
        label: n.data.label || n.data.name || n.id,
        description: n.data.description || n.data.name || '',
        name: n.data.name,
        isSubHazard: nt === 'hazard' && !!n.data.parent_hazard_id,
      })
    })

    return groups
  }, [nodes])

  function handleItemClick(rfNodeId) {
    setFocusNode(rfNodeId)
    const node = nodes.find(n => n.id === rfNodeId)
    if (node) {
      reactFlow.setCenter(node.position.x + 90, node.position.y + 50, { zoom: 1.2, duration: 400 })
    }
  }

  return (
    <div
      className="relative flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden"
      style={{ width: isOpen ? 260 : 0 }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="absolute -right-3 top-4 z-20 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-400 hover:text-gray-600 hover:shadow-md transition-all"
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden" style={{ width: 260 }}>
          {/* Header */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Navigator</h2>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search nodes..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
              />
            </div>
          </div>

          {/* Layer sections */}
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            {Object.entries(layers).map(([nodeType, items]) => (
              <SidebarSection
                key={nodeType}
                title={LAYER_SECTION_LABELS[nodeType]}
                items={items}
                nodeType={nodeType}
                searchQuery={searchQuery}
                onItemClick={handleItemClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
