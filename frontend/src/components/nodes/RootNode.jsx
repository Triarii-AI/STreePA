import React from 'react'
import { Handle, Position } from '@xyflow/react'

export default function RootNode({ data, selected }) {
  return (
    <div
      className={`
        rounded-xl p-4 min-w-[280px] max-w-[360px] shadow-md
        border-2 transition-all
        ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
      `}
      style={{
        background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
        borderColor: '#6366f1',
      }}
    >
      <div className="mb-2">
        <span className="inline-block text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 mb-2">
          Purpose Statement
        </span>
        <h2 className="text-base font-bold text-indigo-900 leading-tight break-words">
          {data.title || 'Untitled Project'}
        </h2>
      </div>
      {data.purpose_statement && (
        <p className="text-xs text-indigo-700 leading-relaxed break-words">
          {data.purpose_statement}
        </p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: '#6366f1', width: 10, height: 10 }}
      />
    </div>
  )
}
