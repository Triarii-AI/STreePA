import React from 'react'
import { Handle, Position } from '@xyflow/react'

const H = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 }

export default function LossNode({ data, selected }) {
  if (data.hidden) return null

  return (
    <div
      className={`
        rounded-lg p-3 min-w-[180px] max-w-[240px]
        bg-red-50 border-2 border-red-400
        shadow-sm transition-all
        ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-red-800 text-sm leading-tight break-words flex-1">
          {data.label || 'Loss'}
        </span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0 whitespace-nowrap">
          LOSS
        </span>
      </div>

      {data.description && (
        <p className="text-xs text-red-700 leading-snug break-words mt-1">
          {data.description}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} style={H} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={H} isConnectable={false} />
    </div>
  )
}
