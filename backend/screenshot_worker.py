#!/usr/bin/env python3
"""
Standalone headless-Chromium screenshot worker.

Run as a subprocess (NOT imported) so Playwright's sync API and its driver
subprocess stay fully isolated from Flask-SocketIO's eventlet loop.

It loads the app's render-mode canvas (/projects/<id>?render=1&...), waits for
the page to signal window.__EXPORT_READY__, and writes a PNG to --out.

Exit code 0 on success; non-zero with a message on stderr otherwise.

Example:
    python screenshot_worker.py \
        --url "http://localhost:5000/projects/3?render=1&theme=dark&cross_refs=1" \
        --out /tmp/out.png \
        --base-url http://localhost:5000 \
        --cookie-name session --cookie-value <flask-session-cookie> \
        --width 1600 --height 1000 --scale 2
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
    ap.add_argument('--scale', type=float, default=2.0, help='deviceScaleFactor (2 = Retina quality)')
    ap.add_argument('--node-zoom', type=float, default=1.0,
                    help='target zoom; 1.0 = nodes at native size (crispest)')
    ap.add_argument('--max-dim', type=int, default=10000,
                    help='cap on either CSS viewport dimension before scale')
    ap.add_argument('--max-output', type=int, default=20000,
                    help='cap on either physical output dimension (px) after scale')
    ap.add_argument('--pad', type=int, default=40, help='padding around graph (px)')
    ap.add_argument('--timeout', type=int, default=25000, help='readiness timeout (ms)')
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('playwright not installed (pip install playwright)', file=sys.stderr)
        return 3

    import math

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

        # The render-mode canvas flips this flag once nodes are measured and it has
        # published window.__EXPORT_BOUNDS__ + window.__rfSetViewport.
        ready = True
        try:
            page.wait_for_function('() => window.__EXPORT_READY__ === true', timeout=args.timeout)
        except Exception:
            ready = False
            page.wait_for_timeout(1500)

        bounds = page.evaluate('() => window.__EXPORT_BOUNDS__') if ready else None

        if bounds and bounds.get('width', 0) > 0 and bounds.get('height', 0) > 0:
            # Size the output canvas to the graph at the chosen zoom (capped), then place
            # the viewport so the whole graph sits at (pad, pad). Deterministic — no
            # dependency on the app's own fitView container measurement.
            #
            # Two caps:
            #   max_dim  — CSS viewport size (controls browser layout memory)
            #   max_output — physical output pixels (controls PNG file size)
            # The physical output is CSS * scale, so scale both constraints down by scale.
            zoom = min(args.node_zoom,
                       args.max_dim / bounds['width'],
                       args.max_dim / bounds['height'],
                       args.max_output / (bounds['width'] * args.scale),
                       args.max_output / (bounds['height'] * args.scale))
            vw = math.ceil(bounds['width'] * zoom + 2 * args.pad)
            vh = math.ceil(bounds['height'] * zoom + 2 * args.pad)
            page.set_viewport_size({'width': vw, 'height': vh})
            page.evaluate(
                '(vp) => window.__rfSetViewport(vp)',
                {'x': args.pad - bounds['x'] * zoom, 'y': args.pad - bounds['y'] * zoom, 'zoom': zoom},
            )
            page.wait_for_timeout(250)
            print(f'bounds={bounds} zoom={zoom:.4f} out={vw}x{vh} (x{args.scale})', file=sys.stderr)

        page.wait_for_timeout(100)
        page.screenshot(path=args.out, type='png')
        context.close()
        browser.close()

    return 0


if __name__ == '__main__':
    sys.exit(main())
