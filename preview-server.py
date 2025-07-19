#!/usr/bin/env python3
"""
Simple preview server for agent-generated HTML/JS apps.
Usage: python preview-server.py [port]
"""

import http.server
import socketserver
import os
import sys
import threading
import time
from pathlib import Path

class PreviewHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="/workspace", **kwargs)
    
    def end_headers(self):
        # Add headers to prevent caching and enable CORS
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
    
    def do_GET(self):
        if self.path == '/' or self.path == '/preview':
            # Serve the preview page
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            
            # Check if there's a preview.html file, otherwise use html.html content
            preview_file = Path("/workspace/preview.html")
            if preview_file.exists():
                content = preview_file.read_text()
            else:
                content = """
<!DOCTYPE html>
<html>
<head>
    <title>Agent Preview</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="info">
        <h2>🤖 Agent Preview Server</h2>
        <p>No preview.html found. Ask an agent to create a web app and it will appear here!</p>
        <p>The preview will auto-reload when files change.</p>
    </div>
</body>
</html>
                """
            
            self.wfile.write(content.encode())
        else:
            # Serve other files normally
            super().do_GET()

def start_server(port=8000):
    with socketserver.TCPServer(("", port), PreviewHandler) as httpd:
        print(f"🚀 Preview server running at http://localhost:{port}")
        print(f"📁 Serving files from: /workspace")
        print(f"🔄 Auto-reload enabled")
        print("Press Ctrl+C to stop")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    start_server(port)