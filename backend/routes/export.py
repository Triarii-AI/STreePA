"""
Server-side SVG export for a project.

GET /api/projects/<id>/export?format=svg&theme=light|dark&cross_refs=0|1&hidden=rfId,...
"""
from flask import Blueprint, request, Response
from flask_login import login_required
from models import (
    Project, Loss, Hazard, SystemConstraint, ControlAction,
    UCA, LossScenario, CanvasEdge, db,
)
from routes.utils import check_project_access

export_bp = Blueprint('export', __name__)

# ── Colors (exact Tailwind values used by node components) ────────────────────

LIGHT = {
    'root':              {'fill': '#ede9fe', 'fill2': '#ddd6fe', 'stroke': '#6366f1', 'text': '#1e1b4b'},
    'loss':              {'fill': '#fef2f2', 'stroke': '#f87171', 'text': '#991b1b'},
    'hazard':            {'fill': '#fff7ed', 'stroke': '#fb923c', 'text': '#9a3412'},
    'system_constraint': {'fill': '#fefce8', 'stroke': '#facc15', 'text': '#854d0e'},
    'control_action':    {'fill': '#f0fdf4', 'stroke': '#4ade80', 'text': '#166534'},
    'uca':               {'fill': '#eff6ff', 'stroke': '#60a5fa', 'text': '#1e40af'},
    'loss_scenario':     {'fill': '#faf5ff', 'stroke': '#c084fc', 'text': '#6b21a8'},
}
DARK = {
    'root':              {'fill': '#1e1b4b', 'fill2': '#312e81', 'stroke': '#6366f1', 'text': '#e0e7ff'},
    'loss':              {'fill': '#450a0a', 'stroke': '#dc2626', 'text': '#fecaca'},
    'hazard':            {'fill': '#431407', 'stroke': '#ea580c', 'text': '#fed7aa'},
    'system_constraint': {'fill': '#422006', 'stroke': '#ca8a04', 'text': '#fef08a'},
    'control_action':    {'fill': '#052e16', 'stroke': '#16a34a', 'text': '#bbf7d0'},
    'uca':               {'fill': '#172554', 'stroke': '#2563eb', 'text': '#bfdbfe'},
    'loss_scenario':     {'fill': '#3b0764', 'stroke': '#9333ea', 'text': '#e9d5ff'},
}

# Badge pill (bg, text) — light / dark
BADGE_LIGHT = {
    'loss':              ('#fee2e2', '#b91c1c'),
    'hazard':            ('#ffedd5', '#c2410c'),
    'system_constraint': ('#fef9c3', '#a16207'),
    'control_action':    ('#dcfce7', '#15803d'),
    'uca':               ('#dbeafe', '#1d4ed8'),
    'loss_scenario':     ('#f3e8ff', '#7e22ce'),
}
BADGE_DARK = {
    'loss':              ('#7f1d1d', '#fca5a5'),
    'hazard':            ('#7c2d12', '#fdba74'),
    'system_constraint': ('#713f12', '#fde047'),
    'control_action':    ('#14532d', '#86efac'),
    'uca':               ('#1e3a8a', '#93c5fd'),
    'loss_scenario':     ('#581c87', '#d8b4fe'),
}
BADGE_LABEL = {
    'loss': 'LOSS', 'hazard': 'HAZ', 'system_constraint': 'SC',
    'control_action': 'R', 'uca': 'UCA', 'loss_scenario': 'LS',
}
UCA_TYPE_LABELS = {
    'not_providing':           'Not Providing',
    'providing_causes_hazard': 'Providing Causes Hazard',
    'wrong_timing_order':      'Wrong Timing/Order',
    'duration_issue':          'Duration Issue',
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

SOLID_STROKE  = '#64748b'
DASHED_STROKE = '#94a3b8'
BG_LIGHT = '#f8fafc'
BG_DARK  = '#0f172a'
EXPORT_PAD = 60

# Layout
PAD      = 12   # p-3
ROOT_PAD = 16   # p-4
NODE_W   = 220
ROOT_W   = 320

# Font sizes (px — slightly smaller than Tailwind px for SVG fidelity)
LBL_F   = 13   # text-sm (14px)
DESC_F  = 11   # text-xs (12px)
TITL_F  = 15   # text-base (16px)
BADGE_F = 10

# Line heights
LBL_LH  = 16
DESC_LH = 14
TITL_LH = 18
BADGE_H = 16


# ── Text helpers ──────────────────────────────────────────────────────────────

def _esc(s):
    if not s:
        return ''
    return (str(s)
            .replace('&', '&amp;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('"', '&quot;'))


def _wrap(text, avail_px, font_size, char_ratio=0.65, max_lines=None):
    if not text:
        return []
    chars = max(8, int(avail_px / (font_size * char_ratio)))
    words = str(text).split()
    lines, cur = [], ''
    for word in words:
        cand = (cur + ' ' + word).strip()
        if len(cand) <= chars:
            cur = cand
        else:
            if cur:
                lines.append(cur)
                if max_lines and len(lines) >= max_lines:
                    return lines
            cur = word
    if cur and (not max_lines or len(lines) < max_lines):
        lines.append(cur)
    return lines


def _badge_w(text, font=BADGE_F, hpad=6):
    return max(18, int(len(str(text)) * font * 0.68 + 2 * hpad))


def _node_width(label, ntype, is_sub=False):
    """Estimate node width: matches browser's min-w-[180px] max-w-[240px]."""
    bw = _badge_w(BADGE_LABEL.get(ntype, ''))
    if is_sub and ntype == 'hazard':
        bw += _badge_w('sub') + 4
    one_line = int(len(str(label or '')) * LBL_F * 0.65)
    return max(180, min(240, 2 * PAD + one_line + bw + 4))


# ── Node height estimation ────────────────────────────────────────────────────

def _std_height(label, desc, ntype, nw=None, is_sub=False, uca_type=None):
    if nw is None:
        nw = _node_width(label, ntype, is_sub)
    bl = BADGE_LABEL.get(ntype, '')
    bw = _badge_w(bl)
    if is_sub:
        bw += _badge_w('sub') + 4
    lbl_lines = max(1, len(_wrap(label, nw - 2 * PAD - bw - 4, LBL_F)))
    dsc_lines = len(_wrap(desc, nw - 2 * PAD, DESC_F, max_lines=4)) if desc else 0
    h = PAD + lbl_lines * LBL_LH
    if dsc_lines:
        h += 4 + dsc_lines * DESC_LH
    if uca_type:
        h += 6 + BADGE_H
    h += PAD
    return max(40, int(h))


def _root_height(title, desc):
    t_lines = max(1, len(_wrap(title, ROOT_W - 2 * ROOT_PAD, TITL_F)))
    d_lines = len(_wrap(desc, ROOT_W - 2 * ROOT_PAD, DESC_F)) if desc else 0
    h = ROOT_PAD + BADGE_H + 8 + t_lines * TITL_LH
    if d_lines:
        h += 8 + d_lines * DESC_LH
    h += ROOT_PAD
    return max(80, int(h))


# ── SVG drawing primitives ────────────────────────────────────────────────────

def _pill(out, bx, by, bw, bh, text, bg, fg, rx=8, font=BADGE_F):
    out.append(f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh}"'
               f' rx="{rx}" fill="{bg}"/>')
    out.append(f'<text x="{bx + bw/2:.1f}" y="{by + bh/2:.1f}"'
               f' text-anchor="middle" dominant-baseline="middle"'
               f' font-family="Inter,ui-sans-serif,system-ui,sans-serif"'
               f' font-size="{font}" font-weight="600" fill="{fg}">{_esc(text)}</text>')


def _tlines(out, lines, x, y0, lh, font, weight, fill, opacity=None):
    op = f' opacity="{opacity}"' if opacity else ''
    for line in lines:
        out.append(f'<text x="{x:.1f}" y="{y0:.1f}" dominant-baseline="middle"'
                   f' font-family="Inter,ui-sans-serif,system-ui,sans-serif"'
                   f' font-size="{font}" font-weight="{weight}" fill="{fill}"{op}>'
                   f'{_esc(line)}</text>')
        y0 += lh
    return y0


def _border_pt(cx, cy, w, h, tx, ty):
    """Returns (bx, by, side) — exact algorithm from FloatingEdge.borderPoint."""
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return cx, cy + h / 2, 'bottom'
    hw, hh = w / 2.0, h / 2.0
    on_side = abs(dx) / hw > abs(dy) / hh
    if on_side:
        t = hw / abs(dx)
        pos = 'right' if dx > 0 else 'left'
    else:
        t = hh / abs(dy)
        pos = 'bottom' if dy > 0 else 'top'
    return cx + dx * t, cy + dy * t, pos


def _bezier_ctrl(pos, x1, y1, x2, y2, c=0.25):
    """React Flow's getControlWithCurvature: push outward from pos by c * |delta|."""
    if pos == 'left':   return x1 - abs(x2 - x1) * c, y1
    if pos == 'right':  return x1 + abs(x2 - x1) * c, y1
    if pos == 'top':    return x1, y1 - abs(y2 - y1) * c
    # bottom
    return x1, y1 + abs(y2 - y1) * c


# ── Node renderers ────────────────────────────────────────────────────────────

def _draw_root(n, out, dark):
    x, y, nw, nh = n['x'], n['y'], n['w'], n['h']
    title_c = '#e0e7ff' if dark else '#1e1b4b'
    desc_c  = '#a5b4fc' if dark else '#4338ca'

    out.append(f'<rect x="{x+2:.1f}" y="{y+3:.1f}" width="{nw}" height="{nh}"'
               f' rx="12" fill="#00000020"/>')
    out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{nw}" height="{nh}"'
               f' rx="12" fill="url(#root-grad)" stroke="#6366f1" stroke-width="2"/>')

    # "PURPOSE STATEMENT" chip
    chip_label = 'PURPOSE STATEMENT'
    chip_w = _badge_w(chip_label, font=BADGE_F, hpad=8)
    chip_y = y + ROOT_PAD
    out.append(f'<rect x="{x + ROOT_PAD:.1f}" y="{chip_y:.1f}" width="{chip_w}" height="{BADGE_H}"'
               f' rx="8" fill="#312e81" opacity="0.65"/>')
    out.append(f'<text x="{x + ROOT_PAD + chip_w/2:.1f}" y="{chip_y + BADGE_H/2:.1f}"'
               f' text-anchor="middle" dominant-baseline="middle"'
               f' font-family="Inter,ui-sans-serif,system-ui,sans-serif"'
               f' font-size="{BADGE_F}" font-weight="700" fill="#a5b4fc"'
               f' letter-spacing="1">{_esc(chip_label)}</text>')

    title = n['label'] or ''
    desc  = n.get('desc') or ''
    avail = nw - 2 * ROOT_PAD
    t_lines = _wrap(title, avail, TITL_F) or ['']
    title_y0 = chip_y + BADGE_H + 8 + TITL_LH / 2
    last_y = _tlines(out, t_lines, x + ROOT_PAD, title_y0, TITL_LH, TITL_F, '700', title_c)

    if desc:
        d_lines = _wrap(desc, avail, DESC_F)
        desc_y0 = last_y - TITL_LH / 2 + 8 + DESC_LH / 2
        _tlines(out, d_lines, x + ROOT_PAD, desc_y0, DESC_LH, DESC_F, '400', desc_c)


def _draw_std(n, out, dark):
    ntype = n['type']
    x, y, nw, nh = n['x'], n['y'], n['w'], n['h']
    c  = (DARK if dark else LIGHT).get(ntype, LIGHT['loss'])
    bc = (BADGE_DARK if dark else BADGE_LIGHT).get(ntype, ('#ccc', '#333'))
    label    = n['label'] or ''
    desc     = n.get('desc') or ''
    uca_type = n.get('uca_type')
    is_sub   = n.get('is_sub', False)

    # Shadow + body
    out.append(f'<rect x="{x+2:.1f}" y="{y+3:.1f}" width="{nw}" height="{nh}"'
               f' rx="8" fill="#00000018"/>')
    out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{nw}" height="{nh}"'
               f' rx="8" fill="{c["fill"]}" stroke="{c["stroke"]}" stroke-width="2"/>')

    # Type badge (right side)
    bl  = BADGE_LABEL.get(ntype, '')
    mbw = _badge_w(bl)
    mbx = x + nw - PAD - mbw
    badge_y = y + PAD
    _pill(out, mbx, badge_y, mbw, BADGE_H, bl, bc[0], bc[1])

    # Sub badge (to left of type badge, hazards only)
    if is_sub:
        sbw = _badge_w('sub')
        sbx = mbx - 4 - sbw
        _pill(out, sbx, badge_y, sbw, BADGE_H, 'sub', bc[0], bc[1])
        label_right_edge = sbx
    else:
        label_right_edge = mbx

    # Label
    lbl_avail = label_right_edge - (x + PAD) - 4
    lbl_lines = _wrap(label, lbl_avail, LBL_F) or ['']
    lbl_y0 = y + PAD + LBL_LH / 2
    last_y = _tlines(out, lbl_lines, x + PAD, lbl_y0, LBL_LH, LBL_F, '700', c['text'])

    # Description
    if desc:
        dsc_lines = _wrap(desc, nw - 2 * PAD, DESC_F, max_lines=4)
        dsc_y0 = last_y - LBL_LH / 2 + 4 + DESC_LH / 2
        op = '0.9' if dark else '0.75'
        _tlines(out, dsc_lines, x + PAD, dsc_y0, DESC_LH, DESC_F, '400', c['text'], opacity=op)

    # UCA type badge (bottom-left)
    if uca_type and uca_type in UCA_TYPE_LABELS:
        tl  = UCA_TYPE_LABELS[uca_type]
        tc  = UCA_TYPE_COLORS[uca_type]
        tbw = _badge_w(tl, font=BADGE_F, hpad=8)
        ty  = y + nh - PAD - BADGE_H
        _pill(out, x + PAD, ty, tbw, BADGE_H, tl, tc, '#ffffff')


# ── Edge renderer ─────────────────────────────────────────────────────────────

def _draw_edge(e, nodes, out):
    sn, tn = nodes[e['src']], nodes[e['tgt']]
    scx = sn['x'] + sn['w'] / 2;  scy = sn['y'] + sn['h'] / 2
    tcx = tn['x'] + tn['w'] / 2;  tcy = tn['y'] + tn['h'] / 2
    sx, sy, src_pos = _border_pt(scx, scy, sn['w'], sn['h'], tcx, tcy)
    tx, ty, tgt_pos = _border_pt(tcx, tcy, tn['w'], tn['h'], scx, scy)

    c1x, c1y = _bezier_ctrl(src_pos, sx, sy, tx, ty)
    c2x, c2y = _bezier_ctrl(tgt_pos, tx, ty, sx, sy)

    dashed = e['dashed']
    stroke = DASHED_STROKE if dashed else SOLID_STROKE
    sw     = 1.5 if dashed else 2.0
    dash   = ' stroke-dasharray="5,5"' if dashed else ''
    marker = 'arr-d' if dashed else 'arr-s'

    out.append(
        f'<path d="M {sx:.1f},{sy:.1f} C {c1x:.1f},{c1y:.1f} {c2x:.1f},{c2y:.1f} {tx:.1f},{ty:.1f}"'
        f' fill="none" stroke="{stroke}" stroke-width="{sw}"{dash}'
        f' marker-end="url(#{marker})"/>'
    )


# ── Main SVG generator ────────────────────────────────────────────────────────

def _generate_svg(project, losses, hazards, scs, cas, ucas, lss, c_edges,
                  dark=False, show_cross_refs=True, hidden_ids=None):
    bg         = BG_DARK if dark else BG_LIGHT
    hidden_set = set(hidden_ids or [])

    # ── Build node table ──────────────────────────────────────────────────
    nodes = {}

    def add(nid, ntype, x, y, label, desc=None, uca_type=None, is_sub=False):
        if nid in hidden_set:
            return
        if ntype == 'root':
            nw, nh = ROOT_W, _root_height(label, desc)
        else:
            nw = _node_width(label, ntype, is_sub)
            nh = _std_height(label, desc, ntype, nw=nw, is_sub=is_sub, uca_type=uca_type)
        nodes[nid] = {
            'x': float(x or 0), 'y': float(y or 0), 'w': nw, 'h': nh,
            'type': ntype, 'label': label or '', 'desc': desc,
            'uca_type': uca_type, 'is_sub': is_sub,
        }

    add(f'root-{project.id}', 'root',
        project.root_x or 500, project.root_y or 50,
        project.title, project.purpose_statement)

    for n in losses:
        d = n.to_dict()
        add(f'loss-{d["id"]}', 'loss', d['x'], d['y'], d['label'], d.get('description'))

    for n in hazards:
        d = n.to_dict()
        add(f'hazard-{d["id"]}', 'hazard', d['x'], d['y'], d['label'], d.get('description'),
            is_sub=bool(d.get('parent_hazard_id')))

    for n in scs:
        d = n.to_dict()
        add(f'sc-{d["id"]}', 'system_constraint', d['x'], d['y'], d['label'], d.get('description'))

    for n in cas:
        d = n.to_dict()
        name = d.get('name') or ''
        lbl  = d.get('label') or name
        desc = name if name and name != lbl else None
        add(f'ca-{d["id"]}', 'control_action', d['x'], d['y'], lbl, desc)

    for n in ucas:
        d = n.to_dict()
        add(f'uca-{d["id"]}', 'uca', d['x'], d['y'], d['label'], d.get('description'),
            uca_type=d.get('uca_type'))

    for n in lss:
        d = n.to_dict()
        add(f'ls-{d["id"]}', 'loss_scenario', d['x'], d['y'], d['label'], d.get('description'))

    # ── Build edge list ───────────────────────────────────────────────────
    edges = []

    def edge(src, tgt, dashed):
        if dashed and not show_cross_refs:
            return
        if src in nodes and tgt in nodes:
            edges.append({'src': src, 'tgt': tgt, 'dashed': dashed})

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
        tgt = f'{NODE_PREFIX.get(ce.to_node_type,   ce.to_node_type)}-{ce.to_node_id}'
        edge(src, tgt, ce.style != 'solid')

    # ── Bounding box ──────────────────────────────────────────────────────
    if not nodes:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
                f'<rect width="400" height="300" fill="{bg}"/></svg>')

    min_x = min(n['x']          for n in nodes.values()) - EXPORT_PAD
    min_y = min(n['y']          for n in nodes.values()) - EXPORT_PAD
    max_x = max(n['x'] + n['w'] for n in nodes.values()) + EXPORT_PAD
    max_y = max(n['y'] + n['h'] for n in nodes.values()) + EXPORT_PAD
    vw, vh = max_x - min_x, max_y - min_y

    # ── Assemble SVG ──────────────────────────────────────────────────────
    out = []
    w = out.append

    w(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
      f' width="{vw:.0f}" height="{vh:.0f}"'
      f' viewBox="{min_x:.1f} {min_y:.1f} {vw:.1f} {vh:.1f}">')

    w('<defs>')
    # Filled arrowhead for solid edges (arrowclosed)
    w(f'<marker id="arr-s" markerWidth="10" markerHeight="7"'
      f' refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">'
      f'<path d="M0,0 L10,3.5 L0,7 Z" fill="{SOLID_STROKE}"/></marker>')
    # Open arrowhead for dashed edges (arrow)
    w(f'<marker id="arr-d" markerWidth="10" markerHeight="7"'
      f' refX="9" refY="3.5" orient="auto" markerUnits="strokeWidth">'
      f'<path d="M0,0 L10,3.5 L0,7" fill="none" stroke="{DASHED_STROKE}" stroke-width="1.5"/></marker>')
    # Root gradient (135deg ≈ top-left to bottom-right)
    if dark:
        w('<linearGradient id="root-grad" x1="0" y1="0" x2="1" y2="1">'
          '<stop offset="0%" stop-color="#1e1b4b"/>'
          '<stop offset="100%" stop-color="#312e81"/>'
          '</linearGradient>')
    else:
        w('<linearGradient id="root-grad" x1="0" y1="0" x2="1" y2="1">'
          '<stop offset="0%" stop-color="#ede9fe"/>'
          '<stop offset="100%" stop-color="#ddd6fe"/>'
          '</linearGradient>')
    w('</defs>')

    w(f'<rect x="{min_x:.1f}" y="{min_y:.1f}" width="{vw:.1f}" height="{vh:.1f}" fill="{bg}"/>')

    for e in edges:
        _draw_edge(e, nodes, out)

    for n in nodes.values():
        if n['type'] == 'root':
            _draw_root(n, out, dark)
        else:
            _draw_std(n, out, dark)

    w('</svg>')
    return ''.join(out)


# ── Route ─────────────────────────────────────────────────────────────────────

@export_bp.route('/projects/<int:project_id>/export', methods=['GET'])
@login_required
def export_project(project_id):
    check_project_access(project_id)

    fmt             = request.args.get('format', 'svg').lower()
    dark            = request.args.get('theme', 'light').lower() == 'dark'
    show_cross_refs = request.args.get('cross_refs', '1') == '1'
    hidden_raw      = request.args.get('hidden', '')
    hidden_ids      = [h.strip() for h in hidden_raw.split(',') if h.strip()]
    slug            = request.args.get('filename', None)

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
            return {'error': 'cairosvg not installed; use format=svg'}, 501

    return Response(
        svg,
        mimetype='image/svg+xml; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename="{filename}.svg"'},
    )
