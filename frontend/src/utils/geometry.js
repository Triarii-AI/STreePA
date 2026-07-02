// Resolve a node's absolute canvas position by walking up its parentId chain
// and summing each ancestor's (parent-relative) position. Needed because
// reactFlow.getNodes() doesn't populate internals.positionAbsolute on the
// objects it returns — a node's own `.position` is only absolute when it has
// no parent; for a group member it's relative to that group's origin, so
// callers that need real canvas coordinates (e.g. centering the viewport on
// a node) must resolve through this instead of reading `.position` directly.
export function resolveAbsPos(node, nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  let x = node.position.x
  let y = node.position.y
  let current = node
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    current = parent
  }
  return { x, y }
}
