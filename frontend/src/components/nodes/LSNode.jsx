import React from 'react'
import { Handle, Position } from '@xyflow/react'

export default function LSNode({ data, selected }) {
  if (data.hidden) return null

  return (
    <div
      className={`
        rounded-lg p-3 min-w-[180px] max-w-[240px]
        bg-purple-50 border-2 border-purple-400
        shadow-sm transition-all
        ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: '#8b5cf6', width: 8, height: 8 }}
      />

      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-purple-800 text-sm leading-tight break-words flex-1">
          {data.label || 'Loss Scenario'}
        </span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 flex-shrink-0 whitespace-nowrap">
          LS
        </span>
      </div>

      {data.description && (
        <p className="text-xs text-purple-700 leading-snug break-words mt-1">
          {data.description}
        </p>
      )}

      {/* Leaf node: no source handle */}
    </div>
  )
}
