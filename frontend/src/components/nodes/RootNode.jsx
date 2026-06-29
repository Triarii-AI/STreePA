import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import useCanvasStore from '../../store/canvasStore.js'

const H = { opacity: 0, pointerEvents: 'none', width: 1, height: 1 }

function RootNode({ data, selected }) {
  const darkMode = useCanvasStore(s => s.darkMode)
  return (
    <div
      className={`rounded-xl p-4 min-w-[280px] max-w-[360px] shadow-md border-2 transition-all ${selected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      style={{
        background: darkMode
          ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'
          : 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
        borderColor: '#6366f1',
      }}
    >
      <div className="mb-2">
        <span className="inline-block text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-streepa-900/60 dark:bg-streepa-900 text-streepa-300 dark:text-streepa-300 mb-2">
          Purpose Statement
        </span>
        <h2 className="text-base font-bold text-streepa-900 dark:text-streepa-100 leading-tight break-words">{data.title || 'Untitled Project'}</h2>
      </div>
      {data.purpose_statement && <p className="text-xs text-streepa-700 dark:text-streepa-300 leading-relaxed break-words">{data.purpose_statement}</p>}
      <Handle type="source" position={Position.Bottom} style={H} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={H} isConnectable={false} />
    </div>
  )
}
export default memo(RootNode)
