import React from 'react'

export default function SCNode({ data, selected }) {
  if (data.hidden) return null

  return (
    <div
      className={`
        rounded-lg p-3 min-w-[180px] max-w-[240px]
        bg-yellow-50 border-2 border-yellow-400
        shadow-sm transition-all
        ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-yellow-800 text-sm leading-tight break-words flex-1">
          {data.label || 'System Constraint'}
        </span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex-shrink-0 whitespace-nowrap">
          SC
        </span>
      </div>

      {data.description && (
        <p className="text-xs text-yellow-700 leading-snug break-words mt-1">
          {data.description}
        </p>
      )}
    </div>
  )
}
