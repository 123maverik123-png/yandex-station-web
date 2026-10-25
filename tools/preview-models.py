#!/usr/bin/env python3
"""Render-only local gallery: no adb, account or speaker connection."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0]=='/model.stl':self.path='/3d/Yandex_Station_Lite_2.stl'
        if self.path=='/':self.path='/static/model-preview.html'
        return super().do_GET()
    def log_message(self,*args):pass

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8870);args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Preview,directory=str(ROOT)))
    print(f'3D preview: http://127.0.0.1:{server.server_port}/',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
