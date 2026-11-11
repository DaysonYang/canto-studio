import functools
import http.server
import sys
from pathlib import Path

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(Path(__file__).resolve().parent))
if __name__ == '__main__':
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
        print(f'字有聲已啟動：http://127.0.0.1:{port} （Ctrl+C 結束）', flush=True)
        server.serve_forever()
