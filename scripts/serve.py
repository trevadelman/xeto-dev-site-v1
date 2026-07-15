#!/usr/bin/env python3
"""Serve dist/ locally honoring the same rewrite rules as public/_redirects,
so /lib/{name} and /orgs/{name} work like they do on Netlify.
Run after `npm run build`:

    python3 scripts/serve.py [port]
"""
import http.server
import os
import sys

DIST = os.path.join(os.path.dirname(__file__), "..", "dist")

# same rewrite rules as public/_redirects, in order
# V1: /publishers/* rewrite parked (docs/v1-scope.md) — restore on reopen
REWRITES = [
    ("/lib/", "/lib/index.html"),
    ("/orgs/", "/org/index.html"),
]


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        route = path.split("?", 1)[0]
        for prefix, target in REWRITES:
            if route.startswith(prefix) and route != prefix:
                path = target
                break
        return super().translate_path(path)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(DIST)
    print(f"serving {DIST} at http://localhost:{port} (with _redirects rewrites)")
    http.server.HTTPServer(("", port), Handler).serve_forever()
