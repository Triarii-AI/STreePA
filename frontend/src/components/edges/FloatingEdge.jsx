import { memo, useMemo } from 'react'
import { BaseEdge, getBezierPath, Position, useInternalNode } from '@xyflow/react'
import useCanvasStore from '../../store/canvasStore.js'

function borderPoint(node, towardX, towardY) {
  const { x, y } = node.internals.positionAbsolute
  const w = node.measured?.width ?? 150
  const h = node.measured?.height ?? 40
  const cx = x + w / 2
  const cy = y + h / 2

  const dx = towardX - cx
  const dy = towardY - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy, pos: Position.Bottom }

  const hw = w / 2
  const hh = h / 2
  const onSide = Math.abs(dx) / hw > Math.abs(dy) / hh
  let bx, by, pos

  if (onSide) {
    const t = hw / Math.abs(dx)
    bx = cx + t * dx
    by = cy + t * dy
    pos = dx > 0 ? Position.Right : Position.Left
  } else {
    const t = hh / Math.abs(dy)
    bx = cx + t * dx
    by = cy + t * dy
    pos = dy > 0 ? Position.Bottom : Position.Top
  }

  return { x: bx, y: by, pos }
}

function FloatingEdge({ id, source, target, style, markerEnd }) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  // Per-edge selection status using a targeted selector so Zustand only re-renders
  // THIS component when ITS own connection status changes, not when any node is clicked.
  // 'none' → no selection; 'connected' → touches selected node; 'dimmed' → everything else
  const selStatus = useCanvasStore(s => {
    const selId = s.selectedNode?.id
    if (!selId) return 'none'
    return (source === selId || target === selId) ? 'connected' : 'dimmed'
  })

  const effectiveStyle = useMemo(() => {
    if (selStatus === 'none') return style
    if (selStatus === 'connected') {
      const isDashed = !!style?.strokeDasharray
      return { ...style, stroke: isDashed ? '#f97316' : '#6366f1', strokeWidth: isDashed ? 2.5 : 3, opacity: 1 }
    }
    return { ...style, opacity: 0.15 }
  }, [style, selStatus])

  if (!sourceNode || !targetNode) return null

  const sw = sourceNode.measured?.width ?? 150
  const sh = sourceNode.measured?.height ?? 40
  const tCx = targetNode.internals.positionAbsolute.x + (targetNode.measured?.width ?? 150) / 2
  const tCy = targetNode.internals.positionAbsolute.y + (targetNode.measured?.height ?? 40) / 2
  const sCx = sourceNode.internals.positionAbsolute.x + sw / 2
  const sCy = sourceNode.internals.positionAbsolute.y + sh / 2

  const src = borderPoint(sourceNode, tCx, tCy)
  const tgt = borderPoint(targetNode, sCx, sCy)

  const [edgePath] = getBezierPath({
    sourceX: src.x, sourceY: src.y, sourcePosition: src.pos,
    targetX: tgt.x, targetY: tgt.y, targetPosition: tgt.pos,
  })

  return <BaseEdge id={id} path={edgePath} style={effectiveStyle} markerEnd={markerEnd} />
}

export default memo(FloatingEdge)
