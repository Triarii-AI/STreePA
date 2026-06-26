import { memo } from 'react'
import { useViewport, useReactFlow } from '@xyflow/react'

// Remote collaborator cursors + selection rings.
//
// This component is deliberately isolated from CanvasInner so that the
// useViewport() subscription (which fires on EVERY pan/zoom frame) only
// re-renders this small overlay, not the entire canvas + ReactFlow tree.
function RemoteOverlays({ remoteSelections, remoteCursors }) {
  const { x: vpX, y: vpY, zoom: vpZoom } = useViewport()
  const reactFlow = useReactFlow()

  return (
    <>
      {/* Remote selection rings — colored border around nodes other users have selected */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
        {Object.entries(remoteSelections).map(([userId, { rfNodeId, avatarColor }]) => {
          const node = reactFlow.getNode(rfNodeId)
          if (!node || node.data?.hidden) return null
          const w = (node.measured?.width ?? 180) * vpZoom
          const h = (node.measured?.height ?? 40) * vpZoom
          const sx = node.position.x * vpZoom + vpX
          const sy = node.position.y * vpZoom + vpY
          return (
            <div key={userId} style={{
              position: 'absolute',
              left: sx - 3,
              top: sy - 3,
              width: w + 6,
              height: h + 6,
              border: `2.5px solid ${avatarColor}`,
              borderRadius: 11,
              boxShadow: `0 0 0 1px ${avatarColor}55`,
            }} />
          )
        })}
      </div>

      {/* Remote cursors — colored pointer + name label */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>
        {Object.entries(remoteCursors).map(([userId, { x, y, username, avatarColor }]) => {
          const sx = x * vpZoom + vpX
          const sy = y * vpZoom + vpY
          return (
            <div key={userId} style={{ position: 'absolute', left: sx, top: sy, transform: 'translate(0, 0)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ display: 'block' }}>
                <path
                  d="M2 2L7.5 16.5L10 10L16.5 7.5L2 2Z"
                  fill={avatarColor}
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <div style={{
                marginTop: 1,
                marginLeft: 3,
                background: avatarColor,
                color: '#fff',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'system-ui, sans-serif',
                lineHeight: 1.2,
                padding: '2px 5px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                maxWidth: 100,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}>
                {username}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default memo(RemoteOverlays)
