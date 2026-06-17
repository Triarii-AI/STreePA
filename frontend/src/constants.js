export const LAYER_COLORS = {
  root: { bg: '#ede9fe', border: '#6366f1', text: '#4338ca' },
  loss: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  hazard: { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },
  system_constraint: { bg: '#fefce8', border: '#eab308', text: '#854d0e' },
  control_action: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
  uca: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  loss_scenario: { bg: '#faf5ff', border: '#8b5cf6', text: '#6b21a8' },
}

export const UCA_TYPE_COLORS = {
  not_providing: '#ef4444',
  providing_causes_hazard: '#f97316',
  wrong_timing_order: '#eab308',
  duration_issue: '#3b82f6',
}

export const UCA_TYPE_LABELS = {
  not_providing: 'Not Providing',
  providing_causes_hazard: 'Causes Hazard',
  wrong_timing_order: 'Wrong Timing/Order',
  duration_issue: 'Duration Issue',
}

export const LAYER_Y_POSITIONS = {
  root: 50,
  loss: 280,
  hazard: 510,
  system_constraint: 740,
  control_action: 970,
  uca: 1200,
  loss_scenario: 1430,
}

export const NODE_HORIZONTAL_SPACING = 240

export const NODE_TYPES_LIST = [
  'loss',
  'hazard',
  'system_constraint',
  'control_action',
  'uca',
  'loss_scenario',
]

export function nodeTypeToPrefix(nodeType) {
  const map = {
    loss: 'loss', hazard: 'hazard', system_constraint: 'sc',
    control_action: 'ca', uca: 'uca', loss_scenario: 'ls', root: 'root',
  }
  return map[nodeType] || nodeType
}

const SOLID_EDGE_STYLE = { stroke: '#64748b', strokeWidth: 2 }
const DASHED_EDGE_STYLE = { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '5,5' }
const SOLID_MARKER = { type: 'arrowclosed', width: 16, height: 16, color: '#64748b' }
const DASHED_MARKER = { type: 'arrow', width: 16, height: 16, color: '#94a3b8' }

export function makeRFEdge(source, target, dashed = false) {
  const edge = {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'default',
    style: dashed ? DASHED_EDGE_STYLE : SOLID_EDGE_STYLE,
    markerEnd: dashed ? DASHED_MARKER : SOLID_MARKER,
  }
  if (dashed) {
    edge.sourceHandle = 'top-source'
    edge.targetHandle = 'bottom-target'
  }
  return edge
}
