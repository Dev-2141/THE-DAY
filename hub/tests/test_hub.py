"""Tests for the connectivity hub.

    npm run test:hub        (python -m unittest discover -s hub/tests)
"""

from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

# The hub's own folder, as when hub/server.py runs.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import export_json  # noqa: E402
import hub as connections  # noqa: E402  registers the connections in hub.py
from hub_core import Hub, button, call_api, navigate, open_url, popup, set_visible, toast  # noqa: E402
from hub_core.element_ids import ELEMENT_IDS, HUB_EVENTS  # noqa: E402
from hub_core.registry import fill_template  # noqa: E402
from hub_core.urls import UrlRegistry, url_registry  # noqa: E402
from server import make_handler  # noqa: E402

assert connections  # imported for its side effect


class RegistryTests(unittest.TestCase):
    def test_declarative_connection_dispatches_its_actions(self) -> None:
        h = Hub()
        h.on("btn.enter", "tap", navigate("enter"), toast("Welcome"))
        self.assertEqual(
            h.dispatch("btn.enter", "tap", {}),
            [{"type": "navigate", "screen": "enter"}, {"type": "toast", "text": "Welcome"}],
        )

    def test_unconnected_element_does_nothing(self) -> None:
        self.assertEqual(Hub().dispatch("scene.grass", "tap", {}), [])

    def test_custom_function_receives_the_event(self) -> None:
        h = Hub()

        @h.on("scene.dome_right", "tap")
        def count(event):  # noqa: ANN001
            return [toast(f"{event.id} {event.event} {event.payload['n']}")]

        self.assertEqual(h.dispatch("scene.dome_right", "tap", {"n": 3}), [{"type": "toast", "text": "scene.dome_right tap 3"}])

    def test_failing_custom_function_does_not_break_the_hub(self) -> None:
        h = Hub()

        @h.on("scene.wreck", "tap")
        def broken(event):  # noqa: ANN001
            raise RuntimeError("boom")

        h.on("scene.wreck", "tap", toast("still works"))
        with self.assertLogs("hub", level="ERROR"):
            self.assertEqual(h.dispatch("scene.wreck", "tap", {}), [{"type": "toast", "text": "still works"}])

    def test_timer_needs_an_interval(self) -> None:
        with self.assertRaises(ValueError):
            Hub().on("app", "timer", toast("tick"))

    def test_set_visible_accepts_toggle_only_as_a_word(self) -> None:
        self.assertEqual(set_visible("panel.settings", "toggle").to_dict()["visible"], "toggle")
        with self.assertRaises(ValueError):
            set_visible("ui", "maybe")  # type: ignore[arg-type]


class ExportTests(unittest.TestCase):
    def test_custom_functions_and_secret_calls_are_marked_remote(self) -> None:
        h = Hub()
        h.on("btn.enter", "tap", navigate("enter"))
        h.on("text.date", "tap", call_api("https://api.example.test/x", secret_headers={"Authorization": "KEY"}))

        @h.on("btn.settings", "long_press")
        def my_feature(event):  # noqa: ANN001
            return None

        h.on("app", "timer", toast("tick"), every=30)
        data = h.export()
        self.assertEqual(data["bindings"]["btn.enter"]["tap"], [{"type": "navigate", "screen": "enter"}])
        self.assertEqual(data["bindings"]["text.date"]["tap"], [{"type": "remote", "function": "call_api with secrets"}])
        self.assertEqual(data["bindings"]["btn.settings"]["long_press"], [{"type": "remote", "function": "my_feature"}])
        self.assertEqual(data["timers"], [{"id": "app", "every": 30}])
        self.assertEqual(len(data["needs_server"]), 2)
        self.assertNotIn("KEY", json.dumps(data["bindings"]))

    def test_public_api_call_is_exported_without_secrets(self) -> None:
        h = Hub()
        h.on("scene.aircraft", "tap", call_api("https://api.github.com/zen"))
        action = h.export()["bindings"]["scene.aircraft"]["tap"][0]
        self.assertEqual(action["type"], "call_api")
        self.assertNotIn("secret_headers", action)

    def test_write_manifest_produces_valid_hub_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "hub.json"
            needs_server = export_json.write_manifest(out)
            data = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(data["version"], 1)
        self.assertNotIn("needs_server", data)
        self.assertIn("btn.settings / long_press: my_feature", needs_server)
        # Every element and event in hub.py exists in src/hub/elementIds.ts.
        assert ELEMENT_IDS is not None and HUB_EVENTS is not None
        for element_id, events in data["bindings"].items():
            self.assertIn(element_id, ELEMENT_IDS)
            for event in events:
                self.assertIn(event, HUB_EVENTS)
        # The connections step 10 ships with.
        self.assertEqual(data["bindings"]["btn.enter"]["tap"][0], {"type": "navigate", "screen": "enter"})
        self.assertEqual(data["bindings"]["btn.website"]["tap"][0]["type"], "open_url")
        self.assertEqual(data["bindings"]["scene.ship"]["tap"][0]["type"], "dialog")
        self.assertEqual(data["bindings"]["btn.settings"]["tap"][0]["visible"], "toggle")


class SafetyTests(unittest.TestCase):
    def test_only_web_addresses_can_be_defined(self) -> None:
        with self.assertRaises(ValueError):
            open_url("javascript:alert(1)")
        with self.assertRaises(ValueError):
            open_url("file:///C:/Windows")

    def test_sealed_registry_refuses_addresses_made_at_run_time(self) -> None:
        registry = UrlRegistry()
        registry.register("https://defined.test")
        registry.seal()
        registry.register("https://from-an-api.test")
        self.assertTrue(registry.is_allowed("https://defined.test"))
        with self.assertLogs("hub", level="WARNING"):
            self.assertFalse(registry.is_allowed("https://from-an-api.test"))

    def test_dispatch_drops_unlisted_addresses_even_inside_pop_up_buttons(self) -> None:
        h = Hub()
        h.on("scene.ship", "tap", popup(title="T", buttons=[button("Go", open_url("https://allowed.test"))]))
        url_registry._allowed.discard("https://allowed.test")  # as if built after sealing
        try:
            with self.assertLogs("hub", level="WARNING"):
                result = h.dispatch("scene.ship", "tap", {})
            self.assertEqual(result[0]["buttons"][0]["actions"], [])
        finally:
            url_registry.allow("https://allowed.test")


class TemplateTests(unittest.TestCase):
    """The same cases as src/hub/runActions.test.ts, so both sides agree."""

    DATA = {"a": {"b": "x", "n": 3, "list": [10, "twenty"]}, "s": "text", "z": None}
    CASES = [
        ("{a.b}", "x"),
        ("{a.n}", "3"),
        ("{a.list.1}", "twenty"),
        ("{a.list.9}", ""),
        ("{missing.field}", ""),
        ("{z}", "null"),
        ("{a.list}", '[10,"twenty"]'),
        ("{}", '{"a":{"b":"x","n":3,"list":[10,"twenty"]},"s":"text","z":null}'),
        ("Say {s}!", "Say text!"),
    ]

    def test_cases(self) -> None:
        for template, expected in self.CASES:
            with self.subTest(template=template):
                self.assertEqual(fill_template(template, self.DATA), expected)


class ServerTests(unittest.TestCase):
    TOKEN = "test-token"

    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.TOKEN, frozenset()))
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def request(self, path: str, body: object | None = None, token: str | None = TOKEN, raw: bytes | None = None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method="POST" if data is not None else "GET")
        req.add_header("Content-Type", "application/json")
        if token is not None:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read())

    def test_requests_without_the_token_are_refused(self) -> None:
        self.assertEqual(self.request("/manifest", token=None)[0], 401)
        self.assertEqual(self.request("/event", {"id": "btn.enter", "event": "tap"}, token="wrong")[0], 401)

    def test_event_round_trip(self) -> None:
        status, body = self.request("/event", {"id": "btn.enter", "event": "tap", "payload": {}})
        self.assertEqual(status, 200)
        self.assertEqual(body, {"actions": [{"type": "navigate", "screen": "enter"}]})

    def test_custom_python_function_runs_on_the_local_hub(self) -> None:
        status, body = self.request("/event", {"id": "btn.settings", "event": "long_press"})
        self.assertEqual(status, 200)
        self.assertEqual(body["actions"], [{"type": "toast", "text": "Hello from Python"}])

    def test_manifest_lists_connections(self) -> None:
        status, body = self.request("/manifest")
        self.assertEqual(status, 200)
        self.assertEqual(body["version"], 1)
        self.assertIn("btn.enter", body["bindings"])
        self.assertNotIn("needs_server", body)

    def test_malformed_requests_are_rejected(self) -> None:
        self.assertEqual(self.request("/event", raw=b"{not json")[0], 400)
        self.assertEqual(self.request("/event", {"event": "tap"})[0], 400)
        self.assertEqual(self.request("/event", {"id": "x", "event": "tap", "payload": [1]})[0], 400)
        self.assertEqual(self.request("/event", raw=b"x" * (70 * 1024))[0], 400)


if __name__ == "__main__":
    unittest.main()
