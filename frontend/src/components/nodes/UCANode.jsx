import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { UCA_TYPE_COLORS, UCA_TYPE_LABELS } from '../../constants.js'

const H = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 }

export default function UCANode({ data, selected }) {
  if (data.hidden) return null

  const typeColor = data.uca_type ? UCA_TYPE_COLORS[data.uca_type] : '#94a3b8'
  const typeLabel = data.uca_type ? UCA_TYPE_LABELS[data.uca_type] : null

  return (
    <div
      className={`
        rounded-lg p-3 min-w-[180px] max-w-[240px]
        bg-blue-50 border-2 border-blue-400
        shadow-sm transition-all
        ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-blue-800 text-sm leading-tight break-words flex-1">
          {data.label || 'UCA'}
        </span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0 whitespace-nowrap">
          UCA
        </span>
      </div>

      {data.description && (
        <p className="text-xs text-blue-700 leading-snug break-words mt-1 line-clamp-2">
          {data.description}
        </p>
      )}

      {typeLabel && (
        <div className="mt-2">
          <span
            className="inline-block text-xs font-medium px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: typeColor }}
          >
            {typeLabel}
          </span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={H} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={H} isConnectable={false} />
    </div>
  )
}
