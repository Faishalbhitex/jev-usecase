#!/usr/bin/env python3
"""Jalankan perintah dengan API key dari vault disuntik sebagai env var.

Hanya di memori proses anak — tidak pernah di-print atau ditulis ke file.
Contoh: python3 run-with-keys.py npx tsx src/jev-tool-routing-langgraph-03.ts
"""
import json
import os
import socket
import subprocess
import sys


def surrogate(name, entry="access_token", timeout=5.0):
    sock = os.environ.get("JARVIS_AUTHD_SOCK", "/run/hatch/auth/authd.sock")
    body = json.dumps({"name": name}).encode()
    req = (
        "POST /v1/credentials/surrogate HTTP/1.1\r\n"
        "Host: authd.local\r\n"
        "Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Connection: close\r\n\r\n"
    ).encode() + body
    c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    c.settimeout(timeout)
    c.connect(sock)
    c.sendall(req)
    chunks = []
    while True:
        d = c.recv(65536)
        if not d:
            break
        chunks.append(d)
    raw = b"".join(chunks).decode("utf-8", errors="replace")
    payload = json.loads(raw.split("\r\n\r\n", 1)[1])
    for e in payload.get("credentials", []):
        if e.get("name") == entry and str(e.get("surrogate", "")).startswith("hsurr:"):
            return e["surrogate"]
    raise RuntimeError(f"surrogate {name}:{entry} tidak didapat")


env = dict(os.environ)
env["OPENROUTER_API_KEY"] = surrogate("custom.openrouter")
r = subprocess.run(sys.argv[1:], env=env, cwd=os.path.expanduser("~/workspace/jev-usecase"))
sys.exit(r.returncode)
