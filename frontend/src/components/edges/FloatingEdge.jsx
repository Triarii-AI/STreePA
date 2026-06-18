import { BaseEdge, getBezierPath, Position, useInternalNode } from '@xyflow/react'

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

  // Whichever axis hits the border first determines the exit side
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

export default function FloatingEdge({ id, source, target, style, markerEnd }) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  const { x: sx, y: sy } = sourceNode.internals.positionAbsolute
  const sw = sourceNode.measured?.width ?? 150
  const sh = sourceNode.measured?.height ?? 40
  const tCx = (targetNode.internals.positionAbsolute.x) + (targetNode.measured?.width ?? 150) / 2
  const tCy = (targetNode.internals.positionAbsolute.y) + (targetNode.measured?.height ?? 40) / 2
  const sCx = sx + sw / 2
  const sCy = sy + sh / 2

  const src = borderPoint(sourceNode, tCx, tCy)
  const tgt = borderPoint(targetNode, sCx, sCy)

  const [edgePath] = getBezierPath({
    sourceX: src.x,
    sourceY: src.y,
    sourcePosition: src.pos,
    targetX: tgt.x,
    targetY: tgt.y,
    targetPosition: tgt.pos,
  })

  return <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
}
