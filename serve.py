# SPDX-License-Identifier: MIT
# Copyright (c) 2026 MS ROBOTIKA
"""Serve AB-Vision locally and optionally acquire authorized private-IP camera frames.

Images remain in the user's browser except while a frame travels from an explicitly
configured local camera through the loopback server. No cloud or disk storage.
"""
from __future__ import annotations
import argparse
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import ipaddress
import json
import mimetypes
from pathlib import Path
import re
import secrets
import ssl
import webbrowser

ROOT = Path(__file__).parent.resolve()
ASSETS = {
    '/': 'index.html', '/index.html': 'index.html',
    '/src/app.js': 'src/app.js', '/src/vision-core.js': 'src/vision-core.js',
    '/src/style.css': 'src/style.css', '/favicon.svg': 'favicon.svg',
}
CAMERA_LIMIT = 4 * 1024 * 1024
RFC1918 = tuple(ipaddress.ip_network(cidr) for cidr in
               ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))


class CameraError(ValueError):
    pass


def validate_camera_config(data):
    """No arbitrary URLs, DNS, redirects, local services, IPv6 or public addresses."""
    if not isinstance(data, dict) or set(data) != {'ip', 'port', 'path', 'protocol', 'username', 'password', 'approved'}:
        raise CameraError('Configuración de cámara incompleta')
    if data['approved'] is not True:
        raise CameraError('La conexión necesita una autorización explícita')
    try:
        ip = ipaddress.IPv4Address(data['ip'])
    except (ValueError, TypeError):
        raise CameraError('Utiliza la IPv4 numérica de la cámara (sin DNS)') from None
    if not any(ip in network for network in RFC1918):
        raise CameraError('Solo cámaras de LAN privada RFC1918; localhost y redes públicas bloqueadas')
    port = data['port']
    if type(port) is not int or not 1 <= port <= 65535:
        raise CameraError('Puerto fuera de rango')
    if data['protocol'] not in ('http', 'https'):
        raise CameraError('Admitido HTTP(S) para snapshot JPEG/MJPEG; RTSP no es HTTP')
    path = data['path']
    if not isinstance(path, str) or len(path) > 256 or not path.startswith('/') or path.startswith('//') \
            or re.search(r'[\\\x00-\x20\x7f#@]', path):
        raise CameraError('Ruta de imagen inválida; debe comenzar por / y carecer de credenciales')
    username, password = data['username'], data['password']
    if not isinstance(username, str) or not isinstance(password, str) or len(username) > 128 or len(password) > 256:
        raise CameraError('Credenciales demasiado largas o inválidas')
    if any(ord(c) < 32 for c in username+password):
        raise CameraError('Credenciales contienen caracteres de control')
    return str(ip), port, path, data['protocol'], username, password


def fetch_camera_frame(config):
    """Fetch a bounded JPEG from a private camera, optionally parsing MJPEG's first frame.

    Does not follow HTTP redirects. HTTP Digest/RTSP/ONVIF not supported.
    """
    ip, port, path, protocol, username, password = validate_camera_config(config)
    conn = (http.client.HTTPSConnection(ip, port, timeout=3, context=ssl.create_default_context())
            if protocol == 'https' else http.client.HTTPConnection(ip, port, timeout=3))
    headers = {'Accept': 'image/jpeg, multipart/x-mixed-replace', 'Connection': 'close',
               'User-Agent': 'AB-Vision-Inspector/0.3', 'Cache-Control': 'no-cache'}
    if username:
        secret = base64.b64encode(f'{username}:{password}'.encode('utf-8')).decode('ascii')
        headers['Authorization'] = 'Basic ' + secret
    try:
        conn.request('GET', path, headers=headers)
        response = conn.getresponse()
        if response.status != 200:
            raise CameraError(f'Cámara HTTP {response.status}; revisa ruta o autenticación')
        mime = response.getheader('Content-Type', '').lower()
        if not (mime.startswith('image/jpeg') or mime.startswith('multipart/x-mixed-replace')):
            raise CameraError('La cámara debe servir JPEG o MJPEG. RTSP/H.264 no está admitido.')
        raw = bytearray()
        while len(raw) <= CAMERA_LIMIT + 65536:
            chunk = response.read1(8192)
            if not chunk:
                break
            raw.extend(chunk)
            start = raw.find(b'\xff\xd8')
            if start >= 0:
                end = raw.find(b'\xff\xd9', start + 2)
                if end >= 0:
                    result = bytes(raw[start:end + 2])
                    if len(result) > CAMERA_LIMIT:
                        raise CameraError('Fotograma superior a 4 MiB')
                    return result
            if mime.startswith('image/jpeg') and len(raw) > CAMERA_LIMIT:
                raise CameraError('Fotograma superior a 4 MiB')
        raise CameraError('No se recibió un JPEG válido en el límite de tiempo/tamaño')
    except (OSError, TimeoutError, ssl.SSLError) as error:
        raise CameraError('Cámara no disponible o tiempo agotado') from error
    finally:
        conn.close()


class Handler(BaseHTTPRequestHandler):
    def allowed_host(self):
        return self.headers.get_all('Host', []) in (
            [f'127.0.0.1:{self.server.server_port}'], [f'localhost:{self.server.server_port}'])

    def guard(self, protected=False):
        if not self.allowed_host():
            self.reply(403, b'Host no autorizado', 'text/plain; charset=utf-8'); return False
        origins = self.headers.get_all('Origin', [])
        if origins and origins not in ([f'http://127.0.0.1:{self.server.server_port}'],
                                       [f'http://localhost:{self.server.server_port}']):
            self.reply(403, b'Origin no autorizado', 'text/plain; charset=utf-8'); return False
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            self.reply(403, b'Sitio ajeno', 'text/plain; charset=utf-8'); return False
        if protected and not secrets.compare_digest(
                self.headers.get('X-AB-Vision-Session',''), self.server.token):
            self.reply(401, b'Sesion no autorizada', 'text/plain; charset=utf-8'); return False
        return True

    def reply(self, status, content, mimetype):
        self.send_response(status)
        self.send_header('Content-Type', mimetype)
        self.send_header('Content-Length',str(len(content)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.send_header('Permissions-Policy','camera=(self), microphone=(), geolocation=()')
        self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        if not self.guard(): return
        filename = ASSETS.get(self.path)
        if not filename:
            self.reply(404,b'Not Found','text/plain; charset=utf-8'); return
        data = (ROOT / filename).read_bytes()
        mime = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        self.reply(200,data,mime+'; charset=utf-8' if mime.startswith('text/') or 'javascript' in mime else mime)

    def do_POST(self):
        if self.path != '/api/ip-camera/frame':
            self.reply(405,b'Ruta no disponible','text/plain; charset=utf-8'); return
        if not self.guard(protected=True): return
        if self.headers.get_content_type() != 'application/json':
            self.reply(415,b'Se requiere JSON','text/plain; charset=utf-8'); return
        lengths = self.headers.get_all('Content-Length', [])
        if len(lengths) != 1 or self.headers.get('Transfer-Encoding'):
            self.reply(400,b'Longitud invalida','text/plain; charset=utf-8'); return
        try:
            size = int(lengths[0])
            if not 1 <= size <= 4096:
                self.reply(413,b'Limite de 4096 bytes','text/plain; charset=utf-8'); return
            data = self.rfile.read(size)
            if len(data) != size: raise CameraError('Petición incompleta')
            config = json.loads(data)
            frame = fetch_camera_frame(config)
            self.reply(200,frame,'image/jpeg')
        except (CameraError, ValueError, TypeError, UnicodeError) as error:
            self.reply(400,str(error).encode('utf-8')[:300],'text/plain; charset=utf-8')

    def log_message(self,*args):
        pass


class Server(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True
    def __init__(self,port=0):
        super().__init__(('127.0.0.1',port),Handler)
        self.token = secrets.token_urlsafe(32)


def main():
    parser=argparse.ArgumentParser(description='AB-Vision Inspector - aplicación local')
    parser.add_argument('--port',type=int,default=0)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if not 0<=args.port<=65535: parser.error('Puerto fuera de rango')
    with Server(args.port) as server:
        url=f'http://127.0.0.1:{server.server_port}/#token={server.token}'
        print('AB-Vision Inspector 0.3.0 - MS ROBOTIKA',flush=True)
        print(url,flush=True)
        if not args.no_browser: webbrowser.open(url)
        try: server.serve_forever(poll_interval=.1)
        except KeyboardInterrupt: pass

if __name__=='__main__':main()
