import React from 'react'
import { Handle, Position } from '@xyflow/react'
import useCanvasStore from '../../store/canvasStore.js'

export default function HazardNode({ data, selected, id }) {
  if (data.hidden) return null

  const edges = useCanvasStore(s => s.edges)
  const toggleNodeCollapse = useCanvasStore(s => s.toggleNodeCollapse)
  const collapsedNodes = useCanvasStore(s => s.collapsedNodes)

  const hasChildren = edges.some(e => e.source === id && !(e.style?.strokeDasharray))
  const isCollapsed = collapsedNodes.has(id)
  const isSubHazard = !!data.parent_hazard_id

  return (
    <div
      className={`
        rounded-lg p-3 min-w-[180px] max-w-[240px]
        bg-orange-50 border-2 border-orange-400
        shadow-sm transition-all
        ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#f97316', width: 8, height: 8 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={{ background: '#f97316', width: 8, height: 8 }}
      />

      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-orange-800 text-sm leading-tight break-words flex-1">
          {data.label || 'Hazard'}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isSubHazard && (
            <span className="text-xs px-1 py-0.5 rounded bg-orange-200 text-orange-700 font-medium">sub</span>
          )}
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">
            HAZ
          </span>
        </div>
      </div>

      {data.description && (
        <p className="text-xs text-orange-700 leading-snug break-words mt-1">
          {data.description}
        </p>
      )}

      {hasChildren && (
        <button
          onClick={e => { e.stopPropagation(); toggleNodeCollapse(id) }}
          className="mt-2 flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#f97316', width: 8, height: 8 }}
      />
      <Handle
        type="target"
        id="bottom-target"
        position={Position.Bottom}
        style={{ background: '#f97316', width: 6, height: 6, opacity: 0.5, left: '70%' }}
      />
    </div>
  )
}
