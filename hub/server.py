"""Runs the hub as a local companion process.

    python hub/server.py --port 8765 --lifeline

The per-launch token is read from the THE_DAY_HUB_TOKEN environment variable
(never from the command line, so it does not appear in process listings).
Every request must carry "Authorization: Bearer <token>".

    POST /event      {"id", "event", "payload"} -> {"actions": [...]}
    GET  /manifest   every connection and timer (the same shape as hub.json)
    GET  /health     {"ok": true}

By default the server listens on 127.0.0.1 only. To serve custom functions to
the Android app, run it on a server with --host 0.0.0.0 behind HTTPS and set
config.hub.remoteUrl and config.hub.remoteToken in the app.
"""

from __future__ import annotations

import argparse
import hmac
import json
import logging
import os
import sys
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hub_core import hub, url_registry  # noqa: E402
from hub_core.env import load_env  # noqa: E402

log = logging.getLogger("hub")

MAX_BODY_BYTES = 64 * 1024
DEFAULT_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
)


def make_handler(token: str, origins: frozenset[str]) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "TheDayHub/1"

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            log.debug("%s %s", self.address_string(), format % args)

        def _cors(self) -> None:
            origin = self.headers.get("Origin")
            if origin in origins:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Max-Age", "600")

        def _reply(self, status: HTTPStatus, body: object) -> None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _authorised(self) -> bool:
            if token == "":
                return True
            supplied = self.headers.get("Authorization", "")
            return hmac.compare_digest(supplied.encode(), f"Bearer {token}".encode())

        def do_OPTIONS(self) -> None:  # noqa: N802
            self.send_response(HTTPStatus.NO_CONTENT)
            self._cors()
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            if not self._authorised():
                self._reply(HTTPStatus.UNAUTHORIZED, {"error": "unauthorised"})
            elif self.path == "/health":
                self._reply(HTTPStatus.OK, {"ok": True})
            elif self.path == "/manifest":
                # Every connection and timer, so the interface knows what is connected.
                manifest = hub.export()
                manifest.pop("needs_server", None)
                self._reply(HTTPStatus.OK, manifest)
            else:
                self._reply(HTTPStatus.NOT_FOUND, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            length = int(self.headers.get("Content-Length") or 0)
            # Read the body before answering, even to refuse it: a reply sent
            # while the client is still uploading aborts its connection.
            body = self.rfile.read(length) if 0 < length <= MAX_BODY_BYTES else b""
            if not self._authorised():
                self._reply(HTTPStatus.UNAUTHORIZED, {"error": "unauthorised"})
                return
            if self.path != "/event":
                self._reply(HTTPStatus.NOT_FOUND, {"error": "not found"})
                return
            if length <= 0 or length > MAX_BODY_BYTES:
                self.close_connection = True
                self._reply(HTTPStatus.BAD_REQUEST, {"error": "bad length"})
                return
            try:
                request = json.loads(body)
                element_id = str(request["id"])
                event = str(request["event"])
                payload = request.get("payload") or {}
                if not isinstance(payload, dict):
                    raise ValueError("payload must be an object")
            except (ValueError, KeyError, TypeError):
                self._reply(HTTPStatus.BAD_REQUEST, {"error": "bad request"})
                return
            self._reply(HTTPStatus.OK, {"actions": hub.dispatch(element_id, event, payload)})

    return Handler


def watch_lifeline() -> None:
    """Exit when the parent app closes our stdin, so the hub never outlives it."""

    def wait() -> None:
        try:
            while sys.stdin.buffer.read(1024):
                pass
        finally:
            log.info("App closed; hub stopping")
            os._exit(0)

    threading.Thread(target=wait, name="lifeline", daemon=True).start()


def main() -> None:
    parser = argparse.ArgumentParser(description="THE DAY connectivity hub")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--lifeline", action="store_true", help="exit when stdin closes")
    parser.add_argument("--origin", action="append", default=[], help="extra allowed web origin")
    parser.add_argument(
        "--allow-no-token", action="store_true", help="serve without a token (testing only)"
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[hub] %(message)s")
    token = os.environ.get("THE_DAY_HUB_TOKEN", "")
    if token == "" and not args.allow_no_token:
        sys.exit("THE_DAY_HUB_TOKEN is not set. Refusing to start without a token.")

    load_env()
    import hub as _connections  # noqa: E402,F401  registers every connection

    url_registry.seal()

    if args.lifeline:
        watch_lifeline()

    origins = frozenset((*DEFAULT_ORIGINS, *args.origin))
    server = ThreadingHTTPServer((args.host, args.port), make_handler(token, origins))
    log.info("listening on http://%s:%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
