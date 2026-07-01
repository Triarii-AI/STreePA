import React, { useState, useMemo } from 'react'
import { useReactFlow } from '@xyflow/react'
import useCanvasStore from '../store/canvasStore.js'

const LAYER_DOT_COLORS = {
  loss: 'bg-red-400',
  hazard: 'bg-orange-400',
  system_constraint: 'bg-yellow-400',
  control_action: 'bg-green-400',
  uca: 'bg-blue-400',
  controller_constraint: 'bg-teal-400',
  loss_scenario: 'bg-purple-400',
}

const LAYER_SECTION_LABELS = {
  loss: 'Losses',
  hazard: 'Hazards',
  system_constraint: 'System Constraints',
  control_action: 'Control Actions',
  uca: 'UCAs',
  controller_constraint: 'Controller Constraints',
  loss_scenario: 'Loss Scenarios',
}

function naturalLabelSort(a, b) {
  const nums = s => (s || '').replace(/[^\d.]/g, '').split('.').map(n => parseInt(n) || 0)
  const pa = nums(a.label), pb = nums(b.label)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

// Depth-first flatten of the hazard tree, children sorted naturally within each level
function buildHazardTree(hazardNodes) {
  const byParent = {}
  hazardNodes.forEach(n => {
    const pid = n.data.parent_hazard_id ?? null
    if (!byParent[pid]) byParent[pid] = []
    byParent[pid].push(n)
  })
  Object.values(byParent).forEach(g => g.sort(naturalLabelSort))

  const result = []
  function visit(parentDbId, depth) {
    for (const n of (byParent[parentDbId] || [])) {
      result.push({
        rfId: n.id,
        label: n.data.label || n.id,
        description: n.data.description || '',
        depth,
        isLast: false, // filled below per-group
      })
      visit(n.data.id, depth + 1)
    }
  }
  visit(null, 0)

  // Mark last child in each sibling group so we can draw └ vs ├
  // Track per (parentDbId, depth) which index is last — simpler: scan in reverse
  // We'll just mark isLast by checking if the next item has same or smaller depth
  for (let i = 0; i < result.length; i++) {
    const next = result[i + 1]
    result[i].isLast = !next || next.depth <= result[i].depth
  }

  return result
}

function SidebarSection({ title, items, nodeType, searchQuery, onItemClick }) {
  const [open, setOpen] = useState(true)
  const dotColor = LAYER_DOT_COLORS[nodeType] || 'bg-gray-400'
  const isHazard = nodeType === 'hazard'

  const filtered = useMemo(() => {
    if (!searchQuery) return items
    const q = searchQuery.toLowerCase()
    return items.filter(item => {
      const label = (item.label || '').toLowerCase()
      const desc = (item.description || '').toLowerCase()
      return label.includes(q) || desc.includes(q)
    })
  }, [items, searchQuery])

  if (filtered.length === 0 && searchQuery) return null

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
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
            filtered.map(item => {
              const depth = item.depth || 0
              return (
                <button
                  key={item.rfId}
                  onClick={() => onItemClick(item.rfId)}
                  className="w-full flex items-start gap-2 pr-3 py-1.5 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                  style={{ paddingLeft: depth === 0 ? 12 : 12 + depth * 14 }}
                >
                  {isHazard && depth > 0 ? (
                    // Tree connector: └ for last child, ├ otherwise
                    <span className="flex-shrink-0 mt-0.5 text-gray-300 leading-none select-none" style={{ fontSize: 11, marginRight: -2 }}>
                      {item.isLast ? '└' : '├'}
                    </span>
                  ) : (
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColor}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs truncate ${depth === 0 ? 'font-semibold text-gray-800 dark:text-neutral-200' : 'font-medium text-gray-700 dark:text-neutral-300'}`}>
                      {item.label}
                    </div>
                    {item.description && (
                      <div className="text-xs text-gray-400 dark:text-neutral-500 truncate">{item.description}</div>
                    )}
                  </div>
                </button>
              )
            })
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
    const hazardNodes = nodes.filter(n => n.data?.nodeType === 'hazard')

    function flatItems(nodeType) {
      return nodes
        .filter(n => n.data?.nodeType === nodeType)
        .map(n => ({
          rfId: n.id,
          label: n.data.label || n.data.name || n.id,
          description: n.data.description || n.data.name || '',
          depth: 0,
          isLast: true,
        }))
        .sort(naturalLabelSort)
    }

    return {
      loss: flatItems('loss'),
      hazard: buildHazardTree(hazardNodes),
      system_constraint: flatItems('system_constraint'),
      control_action: flatItems('control_action'),
      uca: flatItems('uca'),
      controller_constraint: flatItems('controller_constraint'),
      loss_scenario: flatItems('loss_scenario'),
    }
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
      className="relative flex-shrink-0 transition-all duration-300"
      style={{ width: isOpen ? 260 : 0 }}
    >
      {/* Toggle button — sibling of overflow container so it never gets clipped */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={`absolute -right-3 top-4 z-20 w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 shadow-sm flex items-center justify-center text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 hover:shadow-md transition-all ${isOpen ? '' : 'translate-x-3'}`}
        title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Content — overflow-hidden here, not on the outer div */}
      <div
        className="flex flex-col h-full overflow-hidden transition-all duration-300 bg-white dark:bg-neutral-800 border-r border-gray-200 dark:border-neutral-700"
        style={{ width: isOpen ? 260 : 0 }}
      >
          {/* Header */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-200 mb-2">Navigator</h2>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search nodes..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-streepa-400 bg-gray-50 dark:bg-neutral-700 dark:text-neutral-200 dark:placeholder-neutral-500"
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
    </div>
  )
}
