import { memo } from 'react'
import useCanvasStore from '../../store/canvasStore.js'

function GroupNode({ data, selected }) {
  const darkMode = useCanvasStore(s => s.darkMode)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: 14,
        position: 'relative',
        border: selected
          ? '2px solid #818cf8'
          : `2px dashed ${darkMode ? '#475569' : '#cbd5e1'}`,
        background: selected
          ? 'rgba(99,102,241,0.06)'
          : darkMode
            ? 'rgba(30,41,59,0.4)'
            : 'rgba(248,250,252,0.6)',
        boxSizing: 'border-box',
      }}
    >
      {data.label && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            left: 12,
            background: darkMode ? '#0f172a' : '#ffffff',
            padding: '0 6px',
            fontSize: 24,
            fontWeight: 600,
            color: selected ? '#818cf8' : darkMode ? '#64748b' : '#94a3b8',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: '20px',
            borderRadius: 4,
            userSelect: 'none',
            whiteSpace: 'nowrap',
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {data.label}
        </span>
      )}
    </div>
  )
}

export default memo(GroupNode)
