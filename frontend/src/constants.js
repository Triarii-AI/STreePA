export const LAYER_COLORS = {
  root: { bg: '#f0faf5', border: '#2d6a4f', text: '#1b4332' },
  loss: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
  hazard: { bg: '#fff7ed', border: '#f97316', text: '#9a3412' },
  system_constraint: { bg: '#fefce8', border: '#eab308', text: '#854d0e' },
  control_action: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
  uca: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
  controller_constraint: { bg: '#f0fdfa', border: '#14b8a6', text: '#115e59' },
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
  providing_causes_hazard: 'Providing Causes Hazard',
  wrong_timing_order: 'Wrong Timing/Order',
  duration_issue: 'Duration Issue',
}

export const LS_TYPE_COLORS = {
  uca_occurrence: '#6366f1',
  improper_execution: '#f43f5e',
}

export const LS_TYPE_LABELS = {
  uca_occurrence: 'UCA Occurrence',
  improper_execution: 'Improper Execution',
}

export const LS_TYPE_QUESTIONS = {
  uca_occurrence: 'Why would Unsafe Control Actions occur?',
  improper_execution: 'Why would control actions be improperly executed or not executed, leading to hazards?',
}

export const LAYER_Y_POSITIONS = {
  root: 50,
  loss: 280,
  hazard: 510,
  system_constraint: 740,
  control_action: 970,
  uca: 1200,
  controller_constraint: 1430,
  loss_scenario: 1660,
}

export const NODE_HORIZONTAL_SPACING = 240

export function nodeTypeToPrefix(nodeType) {
  const map = {
    loss: 'loss', hazard: 'hazard', system_constraint: 'sc',
    control_action: 'ca', uca: 'uca', controller_constraint: 'cc',
    loss_scenario: 'ls', root: 'root',
  }
  return map[nodeType] || nodeType
}

const SOLID_EDGE_STYLE = { stroke: '#64748b', strokeWidth: 2 }
// Dash period matters for performance: a fine pattern like '5,5' generates ~2.4x
// more dash segments per path, and rasterizing thousands of finely-dashed bezier
// curves is what made the cross-refs toggle drop to ~1fps on 1k+ node projects.
// '14,10' paints at 60fps at the same edge counts. Keep in sync with
// canvasStore.js, ProjectCanvas.jsx and backend/routes/export.py.
const DASHED_EDGE_STYLE = { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '14,10' }
const SOLID_MARKER = { type: 'arrowclosed', width: 16, height: 16, color: '#64748b' }
const DASHED_MARKER = { type: 'arrow', width: 16, height: 16, color: '#94a3b8' }

export function makeRFEdge(source, target, dashed = false) {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'floating',
    style: dashed ? DASHED_EDGE_STYLE : SOLID_EDGE_STYLE,
    markerEnd: dashed ? DASHED_MARKER : SOLID_MARKER,
    // 'xref-edge' lets CSS hide dashed edges during node drags (see styles/index.css)
    ...(dashed ? { className: 'xref-edge' } : {}),
  }
}
