"""
Server-side SVG (and optional PNG) export for a project.

GET /api/projects/<id>/export?format=svg   → SVG download
GET /api/projects/<id>/export?format=png   → PNG download (requires cairosvg)
"""
from flask import Blueprint, request, Response
from flask_login import login_required
from models import (
    Project, Loss, Hazard, SystemConstraint, ControlAction,
    UCA, LossScenario, CanvasEdge,
    hazard_loss_links, uca_hazard_links, ls_hazard_links, sc_hazard_links,
    db,
)
from routes.utils import check_project_access

export_bp = Blueprint('export', __name__)

# ── Visual constants (match frontend constants.js + node components) ─────────

COLORS = {
    'root':              {'fill': '#ede9fe', 'stroke': '#6366f1', 'text': '#4338ca'},
    'loss':              {'fill': '#fef2f2', 'stroke': '#ef4444', 'text': '#991b1b'},
    'hazard':            {'fill': '#fff7ed', 'stroke': '#f97316', 'text': '#9a3412'},
    'system_constraint': {'fill': '#fefce8', 'stroke': '#eab308', 'text': '#854d0e'},
    'control_action':    {'fill': '#f0fdf4', 'stroke': '#22c55e', 'text': '#166534'},
    'uca':               {'fill': '#eff6ff', 'stroke': '#3b82f6', 'text': '#1e40af'},
    'loss_scenario':     {'fill': '#faf5ff', 'stroke': '#8b5cf6', 'text': '#6b21a8'},
}
COLORS_DARK = {
    'root':              {'fill': '#1e1b4b', 'stroke': '#6366f1', 'text': '#c7d2fe'},
    'loss':              {'fill': '#7f1d1d', 'stroke': '#ef4444', 'text': '#fecaca'},
    'hazard':            {'fill': '#7c2d12', 'stroke': '#f97316', 'text': '#fed7aa'},
    'system_constraint': {'fill': '#713f12', 'stroke': '#eab308', 'text': '#fef08a'},
    'control_action':    {'fill': '#14532d', 'stroke': '#22c55e', 'text': '#bbf7d0'},
    'uca':               {'fill': '#0c2340', 'stroke': '#3b82f6', 'text': '#bfdbfe'},
    'loss_scenario':     {'fill': '#581c87', 'stroke': '#8b5cf6', 'text': '#e9d5ff'},
}
UCA_TYPE_COLORS = {
    'not_providing':           '#ef4444',
    'providing_causes_hazard': '#f97316',
    'wrong_timing_order':      '#eab308',
    'duration_issue':          '#3b82f6',
}
NODE_PREFIX = {
    'loss': 'loss', 'hazard': 'hazard', 'system_constraint': 'sc',
    'control_action': 'ca', 'uca': 'uca', 'loss_scenario': 'ls',
}
NODE_W        = 220   # standard node width (px in flow coords)
ROOT_W        = 300
SOLID_COLOR   = '#64748b'
DASHED_COLOR  = '#94a3b8'
BG_LIGHT      = '#f8fafc'
BG_DARK       = '#0f172a'
EXPORT_PAD    = 60    # blank margin around the diagram


# ── SVG helpers ───────────────────────────────────────────────────────────────

def _esc(s):
    if not s:
        return ''
    return (str(s)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;'))


def _wrap(text, max_chars=30):
    """Word-wrap text into lines of at most max_chars characters."""
    if not text:
        return []
    words = str(text).split()
    lines, cur = [], ''
    for w in words:
        candidate = (cur + ' ' + w).strip()
        if len(candidate) <= max_chars:
            cur = candidate
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _node_height(label, description):
    """Estimate rendered node height from its text content."""
    VPAD      = 10   # top + bottom internal padding each
    LABEL_H   = 16   # px for label line
    LINE_H    = 13   # px per description line
    GAP       = 5    # gap between label and description
    desc_lines = _wrap(description or '', 30)[:4]
    desc_h = (len(desc_lines) * LINE_H + GAP) if desc_lines else 0
    return max(44, VPAD * 2 + LABEL_H + desc_h)


def _border_point(cx, cy, w, h, tx, ty):
    """Intersection of line (cx,cy)→(tx,ty) with the border of rect centred at (cx,cy)."""
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy + h / 2
    hw, hh = w / 2.0, h / 2.0
    t_x = abs(hw / dx) if dx else 1e9
    t_y = abs(hh / dy) if dy else 1e9
    t = min(t_x, t_y)
    return cx + dx * t, cy + dy * t


# ── Core SVG renderer ─────────────────────────────────────────────────────────

def _generate_svg(project, losses, hazards, scs, cas, ucas, lss, c_edges,
                  dark=False, show_cross_refs=True, hidden_ids=None):
    palette    = COLORS_DARK if dark else COLORS
    bg         = BG_DARK if dark else BG_LIGHT
    hidden_set = set(hidden_ids or [])

    # ── Build node table ────────────────────────────────────────────────────
    # Each entry: {x, y, w, h, type, label, description, uca_type}
    nodes = {}

    def add(nid, x, y, ntype, label, desc=None, uca_type=None):
        if nid in hidden_set:
            return
        w = ROOT_W if ntype == 'root' else NODE_W
        h = _node_height(label, desc)
        nodes[nid] = {
            'x': float(x or 0), 'y': float(y or 0),
            'w': w, 'h': h,
            'type': ntype, 'label': label or '',
            'desc': desc, 'uca_type': uca_type,
        }

    add(f'root-{project.id}',
        project.root_x or 500, project.root_y or 50,
        'root', project.title, project.purpose_statement)

    for n in losses:
        d = n.to_dict()
        add(f'loss-{d["id"]}', d['x'], d['y'], 'loss', d['label'], d.get('description'))

    for n in hazards:
        d = n.to_dict()
        add(f'hazard-{d["id"]}', d['x'], d['y'], 'hazard', d['label'], d.get('description'))

    for n in scs:
        d = n.to_dict()
        add(f'sc-{d["id"]}', d['x'], d['y'], 'system_constraint', d['label'], d.get('description'))

    for n in cas:
        d = n.to_dict()
        add(f'ca-{d["id"]}', d['x'], d['y'], 'control_action', d['label'], d.get('name'))

    for n in ucas:
        d = n.to_dict()
        add(f'uca-{d["id"]}', d['x'], d['y'], 'uca',
            d['label'], d.get('description'), d.get('uca_type'))

    for n in lss:
        d = n.to_dict()
        add(f'ls-{d["id"]}', d['x'], d['y'], 'loss_scenario', d['label'], d.get('description'))

    # ── Build edge list ─────────────────────────────────────────────────────
    edges = []  # list of {src, tgt, dashed}

    def edge(src, tgt, dashed):
        # Skip dashed (cross-reference) edges when the toggle is off.
        if dashed and not show_cross_refs:
            return
        # Skip edges where either endpoint is hidden or not in the node table.
        if src in nodes and tgt in nodes:
            edges.append({'src': src, 'tgt': tgt, 'dashed': dashed})

    # Structural (solid) edges mirror frontend canvasStore.buildNodesAndEdges
    for n in losses:
        edge(f'root-{project.id}', f'loss-{n.id}', False)

    for n in hazards:
        d = n.to_dict()
        if d.get('parent_hazard_id'):
            edge(f'hazard-{d["parent_hazard_id"]}', f'hazard-{d["id"]}', False)
        for lid in d.get('loss_ids', []):
            edge(f'hazard-{d["id"]}', f'loss-{lid}', True)

    for n in scs:
        d = n.to_dict()
        if d.get('linked_hazard_id'):
            edge(f'hazard-{d["linked_hazard_id"]}', f'sc-{d["id"]}', False)
        for hid in d.get('hazard_ids', []):
            if hid != d.get('linked_hazard_id'):
                edge(f'sc-{d["id"]}', f'hazard-{hid}', True)

    for n in ucas:
        d = n.to_dict()
        if d.get('control_action_id'):
            edge(f'ca-{d["control_action_id"]}', f'uca-{d["id"]}', False)
        for hid in d.get('hazard_ids', []):
            edge(f'uca-{d["id"]}', f'hazard-{hid}', True)

    for n in lss:
        d = n.to_dict()
        if d.get('uca_id'):
            edge(f'uca-{d["uca_id"]}', f'ls-{d["id"]}', False)
        for hid in d.get('hazard_ids', []):
            edge(f'ls-{d["id"]}', f'hazard-{hid}', True)

    for ce in c_edges:
        src = f'{NODE_PREFIX.get(ce.from_node_type, ce.from_node_type)}-{ce.from_node_id}'
        tgt = f'{NODE_PREFIX.get(ce.to_node_type,   ce.to_node_type  )}-{ce.to_node_id}'
        edge(src, tgt, ce.style != 'solid')

    # ── Bounding box ────────────────────────────────────────────────────────
    if not nodes:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
                f'<rect width="400" height="300" fill="{bg}"/></svg>')

    min_x = min(n['x']           for n in nodes.values()) - EXPORT_PAD
    min_y = min(n['y']           for n in nodes.values()) - EXPORT_PAD
    max_x = max(n['x'] + n['w'] for n in nodes.values()) + EXPORT_PAD
    max_y = max(n['y'] + n['h'] for n in nodes.values()) + EXPORT_PAD
    vw, vh = max_x - min_x, max_y - min_y

    # ── Assemble SVG ────────────────────────────────────────────────────────
    out = []
    w = out.append

    w(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
      f' width="{vw:.0f}" height="{vh:.0f}"'
      f' viewBox="{min_x:.1f} {min_y:.1f} {vw:.1f} {vh:.1f}">')

    # Arrowhead markers
    w('<defs>')
    w(f'<marker id="arr-s" markerWidth="8" markerHeight="6"'
      f' refX="7" refY="3" orient="auto" markerUnits="strokeWidth">'
      f'<path d="M0,0 L8,3 L0,6 Z" fill="{SOLID_COLOR}"/></marker>')
    w(f'<marker id="arr-d" markerWidth="8" markerHeight="6"'
      f' refX="7" refY="3" orient="auto" markerUnits="strokeWidth">'
      f'<path d="M0,0 L8,3 L0,6 Z" fill="{DASHED_COLOR}"/></marker>')
    w('</defs>')

    # Background
    w(f'<rect x="{min_x:.1f}" y="{min_y:.1f}" width="{vw:.1f}" height="{vh:.1f}" fill="{bg}"/>')

    # ── Edges (drawn behind nodes) ──────────────────────────────────────────
    for e in edges:
        sn, tn = nodes[e['src']], nodes[e['tgt']]
        scx = sn['x'] + sn['w'] / 2;  scy = sn['y'] + sn['h'] / 2
        tcx = tn['x'] + tn['w'] / 2;  tcy = tn['y'] + tn['h'] / 2
        sx, sy = _border_point(scx, scy, sn['w'], sn['h'], tcx, tcy)
        tx, ty = _border_point(tcx, tcy, tn['w'], tn['h'], scx, scy)

        # Gentle cubic bezier: pull control points toward the midpoint,
        # with a slight perpendicular offset so edges don't overlap exactly.
        dx, dy = tx - sx, ty - sy
        length = (dx * dx + dy * dy) ** 0.5
        offset = min(40.0, length * 0.20)
        # Perpendicular direction (rotated 90°)
        if length > 0:
            px, py = -dy / length * offset, dx / length * offset
        else:
            px, py = 0, 0
        mx, my = (sx + tx) / 2 + px, (sy + ty) / 2 + py
        c1x, c1y = (sx + mx) / 2, (sy + my) / 2
        c2x, c2y = (tx + mx) / 2, (ty + my) / 2

        dashed = e['dashed']
        stroke = DASHED_COLOR if dashed else SOLID_COLOR
        sw     = 1.5          if dashed else 2.0
        dash   = ' stroke-dasharray="6,4"' if dashed else ''
        marker = 'arr-d'      if dashed else 'arr-s'

        w(f'<path d="M {sx:.1f},{sy:.1f} C {c1x:.1f},{c1y:.1f} {c2x:.1f},{c2y:.1f} {tx:.1f},{ty:.1f}"'
          f' fill="none" stroke="{stroke}" stroke-width="{sw}"{dash}'
          f' marker-end="url(#{marker})"/>')

    # ── Nodes ───────────────────────────────────────────────────────────────
    for n in nodes.values():
        c   = palette.get(n['type'], palette['loss'])
        x, y, nw, nh = n['x'], n['y'], n['w'], n['h']
        rx  = 12 if n['type'] == 'root' else 8

        # Subtle drop shadow
        w(f'<rect x="{x+2:.1f}" y="{y+3:.1f}" width="{nw}" height="{nh}"'
          f' rx="{rx}" fill="#00000018"/>')

        # Node body
        w(f'<rect x="{x:.1f}" y="{y:.1f}" width="{nw}" height="{nh}"'
          f' rx="{rx}" fill="{c["fill"]}" stroke="{c["stroke"]}" stroke-width="2"/>')

        # UCA type accent bar (left edge, 4 px wide)
        uca_color = UCA_TYPE_COLORS.get(n.get('uca_type') or '')
        if uca_color:
            w(f'<rect x="{x:.1f}" y="{y:.1f}" width="5" height="{nh}"'
              f' rx="{rx}" fill="{uca_color}" opacity="0.85"/>')

        # Label text (centred, bold)
        label_y = y + 10 + 8   # 10px top pad + half line height
        w(f'<text x="{x + nw/2:.1f}" y="{label_y:.1f}"'
          f' text-anchor="middle" dominant-baseline="middle"'
          f' font-family="Inter,system-ui,ui-sans-serif,sans-serif"'
          f' font-size="12" font-weight="700" fill="{c["text"]}">'
          f'{_esc(n["label"])}</text>')

        # Description text (wrapped, smaller, dimmer)
        desc = n.get('desc') or ''
        if desc:
            desc_lines = _wrap(desc, 30)[:4]
            for i, line in enumerate(desc_lines):
                ly = label_y + 16 + i * 13
                w(f'<text x="{x + nw/2:.1f}" y="{ly:.1f}"'
                  f' text-anchor="middle" dominant-baseline="middle"'
                  f' font-family="Inter,system-ui,ui-sans-serif,sans-serif"'
                  f' font-size="10" fill="{c["text"]}" opacity="0.72">'
                  f'{_esc(line)}</text>')

    w('</svg>')
    return ''.join(out)


# ── Route ─────────────────────────────────────────────────────────────────────

@export_bp.route('/projects/<int:project_id>/export', methods=['GET'])
@login_required
def export_project(project_id):
    check_project_access(project_id)

    fmt            = request.args.get('format', 'svg').lower()
    dark           = request.args.get('theme', 'light').lower() == 'dark'
    show_cross_refs= request.args.get('cross_refs', '1') == '1'
    hidden_raw     = request.args.get('hidden', '')
    hidden_ids     = [h.strip() for h in hidden_raw.split(',') if h.strip()]
    slug           = request.args.get('filename', None)

    project = Project.query.get_or_404(project_id)
    losses  = Loss.query.filter_by(project_id=project_id).all()
    hazards = Hazard.query.filter_by(project_id=project_id).all()
    scs     = SystemConstraint.query.filter_by(project_id=project_id).all()
    cas     = ControlAction.query.filter_by(project_id=project_id).all()
    ucas    = UCA.query.filter_by(project_id=project_id).all()
    lss     = LossScenario.query.filter_by(project_id=project_id).all()
    cedges  = CanvasEdge.query.filter_by(project_id=project_id).all()

    svg = _generate_svg(
        project, losses, hazards, scs, cas, ucas, lss, cedges,
        dark=dark, show_cross_refs=show_cross_refs, hidden_ids=hidden_ids,
    )

    filename = slug or (project.title or 'export').replace(' ', '-').replace('/', '-')

    if fmt == 'png':
        try:
            import cairosvg
            png = cairosvg.svg2png(bytestring=svg.encode('utf-8'))
            return Response(
                png,
                mimetype='image/png',
                headers={'Content-Disposition': f'attachment; filename="{filename}.png"'},
            )
        except ImportError:
            return {'error': 'cairosvg is not installed on this server; use format=svg instead'}, 501

    return Response(
        svg,
        mimetype='image/svg+xml; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{filename}.svg"'},
    )
