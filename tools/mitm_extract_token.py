"""
mitmproxy addon: watches apisd.ebay.com/graphql requests, extracts the
Authorization: Bearer header, writes it to data/token.txt atomically.

Usage:
    mitmweb -s tools/mitm_extract_token.py
    # or headless:
    mitmdump -s tools/mitm_extract_token.py
"""

import os
import time
from pathlib import Path

from mitmproxy import ctx, http

TOKEN_PATH = Path(__file__).resolve().parent.parent / "data" / "token.txt"
QUERIES_DIR = Path(__file__).resolve().parent.parent / "data" / "graphql-requests"
TARGET_HOST = "apisd.ebay.com"
TARGET_PATH_PREFIX = "/graphql"


class TokenExtractor:
    def __init__(self) -> None:
        self.last_token: str | None = None
        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        QUERIES_DIR.mkdir(parents=True, exist_ok=True)

    def load(self, loader) -> None:
        ctx.log.info(f"TokenExtractor loaded, writing tokens to {TOKEN_PATH}")

    def request(self, flow: http.HTTPFlow) -> None:
        # Match the graphql path on any eBay-like host. Host sometimes arrives as raw IP.
        if not flow.request.path.startswith(TARGET_PATH_PREFIX):
            return
        if flow.request.pretty_host != TARGET_HOST:
            return

        auth = flow.request.headers.get("authorization") or flow.request.headers.get("Authorization")
        if not auth or not auth.startswith("Bearer "):
            return

        token = auth[len("Bearer "):].strip()
        if token and token != self.last_token:
            self._write(token)
            self.last_token = token
            ts = time.strftime("%H:%M:%S")
            ctx.log.info(f"[{ts}] token captured ({len(token)} chars) -> {TOKEN_PATH}")

        self._dump_body(flow)

    def _dump_body(self, flow: http.HTTPFlow) -> None:
        body = flow.request.get_text() or ""
        op = "unknown"
        try:
            import json
            parsed = json.loads(body)
            op = parsed.get("operationName") or "unknown"
        except Exception:
            pass
        ts = time.strftime("%Y%m%dT%H%M%S")
        path = QUERIES_DIR / f"{ts}_{op}.json"
        path.write_text(body, encoding="utf-8")
        ctx.log.info(f"graphql req dumped: op={op} -> {path.name}")

    def _write(self, token: str) -> None:
        tmp = TOKEN_PATH.with_suffix(".tmp")
        tmp.write_text(token + "\n", encoding="utf-8")
        os.replace(tmp, TOKEN_PATH)


addons = [TokenExtractor()]
