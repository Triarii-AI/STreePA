import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

const H = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 }

function LSNode({ data, selected }) {
  if (data.hidden) return null
  return (
    <div className={`rounded-lg p-3 min-w-[180px] max-w-[240px] bg-purple-50 dark:bg-purple-950 border-2 border-purple-400 dark:border-purple-600 shadow-sm transition-all ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-purple-800 dark:text-purple-200 text-sm leading-tight break-words flex-1">{data.label || 'Loss Scenario'}</span>
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 flex-shrink-0 whitespace-nowrap">LS</span>
      </div>
      {data.description && <p className="text-xs text-purple-700 dark:text-purple-300 leading-snug break-words mt-1">{data.description}</p>}
      {data.controller && (
        <div className="mt-2">
          <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400">
            Controller: {data.controller}
          </span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={H} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={H} isConnectable={false} />
    </div>
  )
}
export default memo(LSNode)
