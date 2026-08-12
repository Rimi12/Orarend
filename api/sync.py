from http.server import BaseHTTPRequestHandler
import json
import os
import time

STORAGE_DIR = "/tmp/cloud_sync"

def ensure_dir():
    if not os.path.exists(STORAGE_DIR):
        os.makedirs(STORAGE_DIR, exist_ok=True)

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        ensure_dir()
        from urllib.parse import parse_qs, urlparse
        query = parse_qs(urlparse(self.path).query)
        room = query.get('room', ['default'])[0]
        dtype = query.get('type', ['main'])[0]
        
        filepath = os.path.join(STORAGE_DIR, f"{room}_{dtype}.json")
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                self.wfile.write(f.read().encode('utf-8'))
        else:
            self.wfile.write(json.dumps({"exists": False}).encode('utf-8'))

    def do_POST(self):
        ensure_dir()
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            payload = json.loads(body.decode('utf-8'))
            room = payload.get('room', 'default')
            dtype = payload.get('type', 'main')
            data = payload.get('data')
            client_id = payload.get('clientId')
            
            record = {
                "exists": True,
                "data": data,
                "_updatedBy": client_id,
                "_updatedAt": time.time()
            }
            
            filepath = os.path.join(STORAGE_DIR, f"{room}_{dtype}.json")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(record, f, ensure_ascii=False)
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "error": str(e)}).encode('utf-8'))
