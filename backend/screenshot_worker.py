#!/usr/bin/env python3
"""
Standalone headless-Chromium screenshot worker with tile stitching.

Run as a subprocess (NOT imported) so Playwright's sync API and its driver
subprocess stay fully isolated from Flask-SocketIO's eventlet loop.

Tiling strategy
---------------
For large graphs a single screenshot would need an enormous viewport that
exceeds the GPU compositor tile limit (~16 384 px), causing blank holes.
Instead we split the graph into TILE_CSS×TILE_CSS CSS-pixel tiles, screenshot
each tile individually (safe size), and stitch them into a single PNG with
Pillow.  At scale=2 each tile is already rendered at Retina quality, so the
final image is crisp at any zoom.

Signals expected from the React render-mode canvas
---------------------------------------------------
  window.__EXPORT_READY__   – true once nodes are measured and fitView is done
  window.__EXPORT_BOUNDS__  – {x, y, width, height} in model coordinates
  window.__rfSetViewport    – fn({x, y, zoom}) — sets the RF viewport directly
"""
import argparse
import sys

CHROMIUM_PATH = '/usr/bin/chromium'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--base-url', required=True, help='origin the auth cookie belongs to')
    ap.add_argument('--cookie-name', default=None)
    ap.add_argument('--cookie-value', default=None)
    ap.add_argument('--scale', type=float, default=2.0,
                    help='deviceScaleFactor (2 = Retina quality)')
    ap.add_argument('--node-zoom', type=float, default=1.0,
                    help='target RF zoom; 1.0 = nodes at native CSS size')
    ap.add_argument('--max-css', type=int, default=12000,
                    help='cap on total CSS width/height — controls zoom level for huge graphs')
    ap.add_argument('--tile-size', type=int, default=3000,
                    help='CSS pixels per tile side; physical = tile_size * scale')
    ap.add_argument('--pad', type=int, default=40, help='padding around graph (CSS px)')
    ap.add_argument('--timeout', type=int, default=25000, help='readiness timeout (ms)')
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('playwright not installed (pip install playwright)', file=sys.stderr)
        return 3

    try:
        from PIL import Image
        import io as _io
    except ImportError:
        print('Pillow not installed (pip install Pillow)', file=sys.stderr)
        return 4

    import math

    scale_i = round(args.scale)   # integer DPR for pixel math

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROMIUM_PATH,
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--hide-scrollbars',
                '--force-color-profile=srgb',
            ],
        )
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            device_scale_factor=args.scale,
        )

        if args.cookie_name and args.cookie_value:
            context.add_cookies([{
                'name': args.cookie_name,
                'value': args.cookie_value,
                'url': args.base_url,
            }])

        page = context.new_page()
        page.goto(args.url, wait_until='domcontentloaded', timeout=args.timeout)

        ready = True
        try:
            page.wait_for_function('() => window.__EXPORT_READY__ === true',
                                   timeout=args.timeout)
        except Exception:
            ready = False
            page.wait_for_timeout(1500)

        bounds = page.evaluate('() => window.__EXPORT_BOUNDS__') if ready else None

        if not bounds or bounds.get('width', 0) <= 0 or bounds.get('height', 0) <= 0:
            # No bounds signal — fall back to a single screenshot of current viewport.
            page.wait_for_timeout(200)
            page.screenshot(path=args.out, type='png')
            context.close()
            browser.close()
            return 0

        # ── Compute zoom ──────────────────────────────────────────────────────
        # Cap so the total CSS canvas fits within max_css on both axes.
        zoom = min(args.node_zoom,
                   args.max_css / bounds['width'],
                   args.max_css / bounds['height'])

        total_w_css = math.ceil(bounds['width'] * zoom + 2 * args.pad)
        total_h_css = math.ceil(bounds['height'] * zoom + 2 * args.pad)

        # ── Tiling plan ───────────────────────────────────────────────────────
        tile_size = args.tile_size
        n_cols = math.ceil(total_w_css / tile_size)
        n_rows = math.ceil(total_h_css / tile_size)
        phys_w = total_w_css * scale_i
        phys_h = total_h_css * scale_i

        print(f'bounds={bounds}', file=sys.stderr)
        print(f'zoom={zoom:.4f}  css={total_w_css}x{total_h_css}  '
              f'tiles={n_cols}x{n_rows}={n_cols*n_rows}  '
              f'output={phys_w}x{phys_h}px  (x{args.scale})', file=sys.stderr)

        # Base RF viewport that positions the graph with (pad,pad) top-left padding.
        base_vp_x = args.pad - bounds['x'] * zoom
        base_vp_y = args.pad - bounds['y'] * zoom

        # ── Stitch canvas ─────────────────────────────────────────────────────
        out_img = Image.new('RGB', (phys_w, phys_h), (255, 255, 255))

        for row in range(n_rows):
            for col in range(n_cols):
                tile_x0 = col * tile_size
                tile_y0 = row * tile_size
                tile_w  = min(tile_size, total_w_css - tile_x0)
                tile_h  = min(tile_size, total_h_css - tile_y0)

                # Resize viewport to this tile's CSS footprint.
                page.set_viewport_size({'width': tile_w, 'height': tile_h})

                # Shift the RF viewport so this tile's region is at CSS (0, 0).
                page.evaluate('(vp) => window.__rfSetViewport(vp)', {
                    'x': base_vp_x - tile_x0,
                    'y': base_vp_y - tile_y0,
                    'zoom': zoom,
                })

                # Allow Chromium to finish painting the new region.
                page.wait_for_timeout(200)

                tile_bytes = page.screenshot(type='png')
                tile_img   = Image.open(_io.BytesIO(tile_bytes)).convert('RGB')

                paste_x = tile_x0 * scale_i
                paste_y = tile_y0 * scale_i
                out_img.paste(tile_img, (paste_x, paste_y))

                print(f'  tile ({col},{row}) -> paste ({paste_x},{paste_y}) '
                      f'size {tile_img.width}x{tile_img.height}', file=sys.stderr)

        out_img.save(args.out, 'PNG')
        context.close()
        browser.close()

    return 0


if __name__ == '__main__':
    sys.exit(main())
