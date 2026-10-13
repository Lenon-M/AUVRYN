from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os, webbrowser, threading, sys

PORT = 8765
VERSION = "1.11.2"
WEB_ROOT = Path(__file__).resolve().parent.parent / 'web'
os.chdir(WEB_ROOT)

class AuvrynHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        # Evita que o navegador reutilize HTML/JS antigo entre releases.
        if self.path.startswith(('/index.html', '/css/styles.css', '/js/', '/config/firebase-config.js')):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        super().end_headers()

class AuvrynServer(ThreadingHTTPServer):
    allow_reuse_address = True

url = f'http://localhost:{PORT}/index.html?v={VERSION}'
try:
    server = AuvrynServer(('127.0.0.1', PORT), AuvrynHandler)
except OSError as e:
    print('\nNao foi possivel iniciar o AUVRYN na porta 8765.')
    print('Feche qualquer janela antiga do AUVRYN e tente novamente.')
    print(f'Detalhe tecnico: {e}')
    input('\nPressione Enter para fechar...')
    sys.exit(1)

threading.Timer(0.8, lambda: webbrowser.open(url)).start()
print(f'AUVRYN {VERSION} aberto em {url}')
print('Mantenha esta janela aberta enquanto estiver usando. Ctrl+C para encerrar.')
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
