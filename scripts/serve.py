#!/usr/bin/env python3
"""Servidor estático de desarrollo sin caché.

Evita que el navegador mezcle módulos JS viejos en caché con HTML nuevo
(python3 -m http.server no manda Cache-Control y los navegadores aplican
caché heurística a los módulos).
"""
import http.server


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    http.server.test(HandlerClass=NoCacheHandler, port=8173)
