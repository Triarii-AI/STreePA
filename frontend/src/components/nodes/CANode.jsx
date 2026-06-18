import React from 'react'
import { Handle, Position } from '@xyflow/react'

const H = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 }

export default function CANode({ data, selected }) {
  if (data.hidden) return null

  return (
    <div
      className={`
        rounded-lg p-3 min-w-[180px] max-w-[240px]
        bg-green-50 border-2 border-green-400
        shadow-sm transition-all
        ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-green-800 text-sm leading-tight break-words flex-1">
          {data.label || data.name || 'Control Action'}
        </span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0 whitespace-nowrap">
          CA
        </span>
      </div>

      {data.name && data.label && data.name !== data.label && (
        <p className="text-xs text-green-700 leading-snug break-words mt-1">
          {data.name}
        </p>
      )}
      <Handle type="source" position={Position.Bottom} style={H} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={H} isConnectable={false} />
    </div>
  )
}
