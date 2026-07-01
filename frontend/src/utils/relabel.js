// Mirrors the label formats generated server-side in backend/routes/api.py
// (_next_*_label / _relabel_*_tree). Keep in sync if those formats change.
import { nodeTypeToPrefix } from '../constants.js'

const LABEL_PREFIX = {
  loss: 'L-',
  hazard: 'H-',
  control_action: 'R-',
  uca: 'UCA-',
  loss_scenario: 'LS-',
  system_constraint: 'SC-',
  controller_constraint: 'CC-',
}

// field: the FK on this node type that points at its numbering parent.
// parentType: the node type that FK points to.
// mirror: true means this type has no numbering of its own — it always
// copies its parent's suffix (see _next_sc_label / _next_cc_label).
const PARENT_INFO = {
  loss: { field: 'parent_loss_id', parentType: 'loss' },
  hazard: { field: 'parent_hazard_id', parentType: 'hazard' },
  control_action: { field: null, parentType: null },
  uca: { field: 'control_action_id', parentType: 'control_action' },
  loss_scenario: { field: 'uca_id', parentType: 'uca' },
  system_constraint: { field: 'linked_hazard_id', parentType: 'hazard', mirror: true },
  controller_constraint: { field: 'linked_uca_id', parentType: 'uca', mirror: true },
}

function stripPrefix(nodeType, label) {
  const p = LABEL_PREFIX[nodeType]
  return label && label.startsWith(p) ? label.slice(p.length) : (label || '')
}

// The numeric segment that belongs to this node itself (as opposed to the
// portion of its label inherited from an ancestor's prefix).
function ownIndex(nodeType, label) {
  const s = stripPrefix(nodeType, label)
  const last = s.includes('.') ? s.split('.').pop() : s
  const n = parseInt(last, 10)
  return Number.isNaN(n) ? Infinity : n
}

function buildLabel(nodeType, n, parentLabel) {
  switch (nodeType) {
    case 'loss': return parentLabel ? `${parentLabel}.${n}` : `L-${n}`
    case 'hazard': return parentLabel ? `${parentLabel}.${n}` : `H-${n}`
    case 'control_action': return `R-${n}`
    case 'uca': return `UCA-${stripPrefix('control_action', parentLabel || 'R-?')}.${n}`
    case 'loss_scenario': return `LS-${stripPrefix('uca', parentLabel || 'UCA-?')}.${n}`
    default: return null
  }
}

function mirrorLabel(nodeType, parentLabel) {
  if (nodeType === 'system_constraint') return `SC-${stripPrefix('hazard', parentLabel)}`
  if (nodeType === 'controller_constraint') return `CC-${stripPrefix('uca', parentLabel)}`
  return null
}

function scopeKeyOf(nodeType, data) {
  const info = PARENT_INFO[nodeType]
  if (!info.field) return 'global'
  const val = data[info.field]
  if (val != null) return val
  return (nodeType === 'loss' || nodeType === 'hazard') ? 'top' : 'unlinked'
}

// Depth (in self-referential parent hops) of the loss/hazard identified by parentId.
function parentDepth(nodeType, parentId, nodeByRfId) {
  const field = PARENT_INFO[nodeType].field
  const prefix = nodeTypeToPrefix(nodeType)
  let depth = 0
  let curId = parentId
  const seen = new Set()
  while (curId != null && curId !== 'top') {
    if (seen.has(curId)) break
    seen.add(curId)
    const node = nodeByRfId.get(`${prefix}-${curId}`)
    if (!node) break
    const pid = node.data[field]
    if (pid == null) break
    depth++
    curId = pid
  }
  return depth
}

function buildGroups(selected) {
  const groups = new Map()
  selected.forEach(n => {
    const nodeType = n.data.nodeType
    if (!PARENT_INFO[nodeType]) return
    const scopeKey = scopeKeyOf(nodeType, n.data)
    const key = `${nodeType}::${scopeKey}`
    if (!groups.has(key)) groups.set(key, { nodeType, scopeKey, members: [] })
    groups.get(key).members.push(n)
  })
  return groups
}

// Parents must be processed before children so a child's group can read its
// parent's freshly-computed label (relevant when both are in the same batch).
function orderedGroupKeys(groups, nodeByRfId) {
  const all = [...groups.values()]
  const pick = (nodeType, filterFn) => all.filter(g => g.nodeType === nodeType && filterFn(g))
  const byDepth = (nodeType) => (a, b) => parentDepth(nodeType, a.scopeKey, nodeByRfId) - parentDepth(nodeType, b.scopeKey, nodeByRfId)

  return [
    ...pick('control_action', () => true),
    ...pick('loss', g => g.scopeKey === 'top'),
    ...pick('hazard', g => g.scopeKey === 'top'),
    ...pick('loss', g => g.scopeKey !== 'top').sort(byDepth('loss')),
    ...pick('hazard', g => g.scopeKey !== 'top').sort(byDepth('hazard')),
    ...pick('uca', () => true),
    ...pick('loss_scenario', () => true),
    ...pick('system_constraint', () => true),
    ...pick('controller_constraint', () => true),
  ]
}

/**
 * Compute the set of label changes for a bulk relabel action.
 *
 * mode 'auto': relabel each selected node as if it had just been created —
 *   siblings of the same type/parent keep their number, and selected nodes
 *   are appended after them in their current relative order.
 * mode 'shift': add `delta` to each selected node's own numeric suffix,
 *   independent of siblings (used for the +1 / -1 buttons).
 */
export function computeRelabelChanges(selected, allNodes, mode, delta = 0) {
  const nodeByRfId = new Map(allNodes.map(n => [n.id, n]))
  const groups = buildGroups(selected)
  const ordered = orderedGroupKeys(groups, nodeByRfId)
  const overrides = new Map()
  const getLabel = (rfId) => (overrides.has(rfId) ? overrides.get(rfId) : nodeByRfId.get(rfId)?.data?.label)

  for (const group of ordered) {
    const info = PARENT_INFO[group.nodeType]
    let parentLabel = null
    if (info.parentType && group.scopeKey !== 'top' && group.scopeKey !== 'global' && group.scopeKey !== 'unlinked') {
      const parentRfId = `${nodeTypeToPrefix(info.parentType)}-${group.scopeKey}`
      parentLabel = getLabel(parentRfId)
    }

    if (info.mirror) {
      if (group.scopeKey === 'unlinked' || !parentLabel) continue
      const newLabel = mirrorLabel(group.nodeType, parentLabel)
      group.members.forEach(n => overrides.set(n.id, newLabel))
      continue
    }

    if (mode === 'auto') {
      const allInScope = allNodes.filter(n => n.data?.nodeType === group.nodeType && scopeKeyOf(group.nodeType, n.data) === group.scopeKey)
      const batchIds = new Set(group.members.map(n => n.id))
      // Numbers already spoken for by siblings NOT in this batch — the batch
      // must dodge these, not just append after however many of them there
      // are. Otherwise a batch member can get reassigned onto a number an
      // untouched sibling still holds (e.g. siblings 1,2,4,5 with only 5
      // selected: appending after "3 others" gives 4, colliding with the
      // existing 4, when 3 is the actual free slot).
      const usedByOthers = new Set(
        allInScope
          .filter(n => !batchIds.has(n.id))
          .map(n => ownIndex(group.nodeType, n.data.label))
          .filter(n => n !== Infinity)
      )
      const sorted = [...group.members].sort((a, b) =>
        ownIndex(group.nodeType, a.data.label) - ownIndex(group.nodeType, b.data.label) || a.data.id - b.data.id
      )
      let candidate = 1
      sorted.forEach(n => {
        while (usedByOthers.has(candidate)) candidate++
        overrides.set(n.id, buildLabel(group.nodeType, candidate, parentLabel))
        usedByOthers.add(candidate)
        candidate++
      })
    } else if (mode === 'shift') {
      group.members.forEach(n => {
        const idx = ownIndex(group.nodeType, getLabel(n.id))
        if (idx === Infinity) return
        const newIdx = Math.max(1, idx + delta)
        overrides.set(n.id, buildLabel(group.nodeType, newIdx, parentLabel))
      })
    }
  }

  const rank = new Map()
  ordered.forEach((g, gi) => g.members.forEach(m => rank.set(m.id, gi)))

  const changes = []
  overrides.forEach((newLabel, rfId) => {
    const node = nodeByRfId.get(rfId)
    if (!node || !newLabel || newLabel === node.data.label) return
    changes.push({ rfId, nodeType: node.data.nodeType, nodeId: node.data.id, prevLabel: node.data.label, newLabel })
  })
  changes.sort((a, b) => (rank.get(a.rfId) ?? 0) - (rank.get(b.rfId) ?? 0))
  return changes
}
