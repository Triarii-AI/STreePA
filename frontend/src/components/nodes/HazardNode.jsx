import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

const H = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 }

function HazardNode({ data, selected }) {
  if (data.hidden) return null
  const isSubHazard = !!data.parent_hazard_id
  return (
    <div className={`rounded-lg p-3 w-fit min-w-[180px] max-w-[320px] bg-orange-50 dark:bg-orange-950 border-2 border-orange-400 dark:border-orange-600 shadow-sm transition-all ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-bold text-orange-800 dark:text-orange-200 text-sm leading-tight break-words flex-1">{data.label || 'Hazard'}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isSubHazard && <span className="text-xs px-1 py-0.5 rounded bg-orange-200 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-medium">sub</span>}
          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 whitespace-nowrap">HAZ</span>
        </div>
      </div>
      {data.description && <p className="text-xs text-orange-700 dark:text-orange-300 leading-snug break-words mt-1">{data.description}</p>}
      <Handle type="source" position={Position.Bottom} style={H} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={H} isConnectable={false} />
    </div>
  )
}
export default memo(HazardNode)
