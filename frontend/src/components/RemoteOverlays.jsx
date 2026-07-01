import { memo } from 'react'
import { useViewport, useStore } from '@xyflow/react'

// Remote collaborator cursors + selection rings, and the local multi-selection
// bounding box.
//
// This component is deliberately isolated from CanvasInner so that the
// useViewport() subscription (which fires on EVERY pan/zoom frame) only
// re-renders this small overlay, not the entire canvas + ReactFlow tree.
// useStore(s => s.nodeLookup) also re-renders on every node position change,
// which is needed so rings track nodes during drags by other users.
function RemoteOverlays({ remoteSelections, remoteCursors, selectionBoundsFlow }) {
  const { x: vpX, y: vpY, zoom: vpZoom } = useViewport()
  const nodeLookup = useStore(s => s.nodeLookup)

  return (
    <>
      {/* Own selection bounding box — shown whenever 2+ nodes are selected, however
          they got selected (drag-box, or one-by-one with shift-click), unlike React
          Flow's built-in nodesSelectionActive box which only appears after an actual
          drag-select gesture and disappears on the very next node click. Rendered
          pointer-events:none so it never blocks clicking/shift-clicking a node.
          selectionBoundsFlow (flow coords) comes from CanvasInner's onSelectionChange
          — nodeLookup isn't a reliable re-render trigger for selection-only changes. */}
      {selectionBoundsFlow && (
        <div className="pointer-events-none" style={{
          position: 'absolute',
          zIndex: 4,
          left: selectionBoundsFlow.x * vpZoom + vpX - 8,
          top: selectionBoundsFlow.y * vpZoom + vpY - 8,
          width: selectionBoundsFlow.width * vpZoom + 16,
          height: selectionBoundsFlow.height * vpZoom + 16,
          border: '1.5px dashed #6366f1',
          borderRadius: 10,
          background: 'rgba(99, 102, 241, 0.05)',
        }} />
      )}

      {/* Remote selection rings — colored border around nodes other users have selected */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
        {Object.entries(remoteSelections).map(([userId, { rfNodeId, avatarColor }]) => {
          const node = nodeLookup?.get(rfNodeId)
          if (!node || node.data?.hidden) return null
          const w = (node.measured?.width ?? 180) * vpZoom
          const h = (node.measured?.height ?? 40) * vpZoom
          const absPos = node.internals?.positionAbsolute ?? node.position
          const sx = absPos.x * vpZoom + vpX
          const sy = absPos.y * vpZoom + vpY
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
