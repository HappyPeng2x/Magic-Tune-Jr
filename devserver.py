#!/usr/bin/env python3
"""Static file server for local dev that disables all HTTP caching.

Plain `python -m http.server` lets browsers cache index.html and other
assets, which then serve stale content across rebuilds even though the
service worker's own cache-busting (build-id-based re-registration) is
working correctly. Disabling HTTP caching entirely removes that extra
layer so a normal browser refresh always reflects the latest build.
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.test(HandlerClass=NoCacheHandler, port=port)
