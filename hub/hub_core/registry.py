"""The Hub: maps (element ID, event) to actions or custom Python functions."""

from __future__ import annotations

import json
import logging
import re
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Union, overload

from . import actions as A
from .element_ids import ELEMENT_IDS, HUB_EVENTS
from .env import secret
from .urls import url_registry

log = logging.getLogger("hub")

API_TIMEOUT_SECONDS = 8
_FIELD = re.compile(r"\{([^{}]*)\}")


@dataclass(frozen=True)
class Event:
    """What a custom function receives."""

    id: str
    event: str
    payload: Mapping[str, Any] = field(default_factory=dict)


ActionResult = Union[A.Action, Iterable[A.Action], None]
Handler = Callable[[Event], ActionResult]


@dataclass
class _Binding:
    actions: tuple[A.Action, ...] = ()
    handler: Handler | None = None
    every: float | None = None


class Hub:
    def __init__(self) -> None:
        self._bindings: dict[tuple[str, str], list[_Binding]] = {}

    # ----------------------------------------------------------------- wiring

    @overload
    def on(self, element_id: str, event: str) -> Callable[[Handler], Handler]: ...

    @overload
    def on(
        self, element_id: str, event: str, *actions: A.Action, every: float | None = None
    ) -> None: ...

    def on(
        self, element_id: str, event: str, *actions: A.Action, every: float | None = None
    ) -> Callable[[Handler], Handler] | None:
        """Connect an element's event to actions, or use as a decorator for a function.

        hub.on("btn.enter", "tap", open_url("https://example.com"))

        @hub.on("btn.settings", "long_press")
        def my_feature(event): ...

        For the "timer" event, `every` sets the interval in seconds.
        """
        self._check(element_id, event, every)
        if actions:
            self._add(element_id, event, _Binding(actions=tuple(actions), every=every))
            return None

        def decorator(handler: Handler) -> Handler:
            self._add(element_id, event, _Binding(handler=handler, every=every))
            return handler

        return decorator

    # Shortcuts for use inside custom functions: `return hub.toast("Hi")`.
    toast = staticmethod(A.toast)
    popup = staticmethod(A.popup)
    sheet = staticmethod(A.sheet)
    open_url = staticmethod(A.open_url)
    navigate = staticmethod(A.navigate)
    set_text = staticmethod(A.set_text)
    set_visible = staticmethod(A.set_visible)
    set_setting = staticmethod(A.set_setting)
    call_api = staticmethod(A.call_api)
    allow_url = staticmethod(url_registry.allow)

    # --------------------------------------------------------------- dispatch

    def dispatch(self, element_id: str, event: str, payload: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Run everything connected to (element_id, event); return actions for the interface."""
        out: list[dict[str, Any]] = []
        for binding in self._bindings.get((element_id, event), []):
            produced: Iterable[A.Action]
            if binding.handler is not None:
                try:
                    produced = _as_actions(binding.handler(Event(element_id, event, payload)))
                except Exception:  # A failing custom function must not break the app.
                    log.exception("Custom function for %s/%s failed", element_id, event)
                    continue
            else:
                produced = binding.actions
            for action in produced:
                resolved = self._resolve(action)
                if resolved is not None:
                    out.append(resolved)
        return out

    def _resolve(self, action: A.Action) -> dict[str, Any] | None:
        data = action.to_dict()
        kind = data["type"]
        if kind == "open_url" and not url_registry.is_allowed(data["url"]):
            return None
        if kind in ("dialog", "sheet"):
            data["buttons"] = [
                {"label": b["label"], "actions": [a for a in b["actions"] if _url_ok(a)]}
                for b in data["buttons"]
            ]
        if kind == "call_api":
            return self._call_api(data)
        return data

    def _call_api(self, data: dict[str, Any]) -> dict[str, Any] | None:
        """The hub makes the call itself, so keys stay here and the interface
        only receives text to show, never an address to open."""
        if not url_registry.is_allowed(data["url"]):
            return None
        headers = {"Accept": "application/json", "User-Agent": "THE-DAY-hub"}
        for header, env_name in data.get("secret_headers", {}).items():
            headers[header] = secret(env_name)
        body = None
        if data["body"] is not None:
            body = json.dumps(data["body"]).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(data["url"], data=body, headers=headers, method=data["method"])
        try:
            with urllib.request.urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
                result = json.loads(response.read().decode("utf-8"))
        except Exception:
            log.exception("API call to %s failed", data["url"])
            return None
        present = data["present"]
        text = fill_template(present["template"], result)
        if present["kind"] == "set_text" and present["target"]:
            return A.set_text(present["target"], text).to_dict()
        return A.toast(text).to_dict()

    # ----------------------------------------------------------------- export

    def export(self) -> dict[str, Any]:
        """Declarative connections for hub.json. Custom functions and calls with
        secrets become {"type": "remote"}: Android needs a server hub for them."""
        bindings: dict[str, dict[str, list[dict[str, Any]]]] = {}
        timers: list[dict[str, Any]] = []
        needs_server: list[str] = []
        for (element_id, event), entries in self._bindings.items():
            exported: list[dict[str, Any]] = []
            for binding in entries:
                if binding.handler is not None or any(a.needs_server for a in binding.actions):
                    name = binding.handler.__name__ if binding.handler else "call_api with secrets"
                    exported.append({"type": "remote", "function": name})
                    needs_server.append(f"{element_id} / {event}: {name}")
                else:
                    exported.extend(_public(a) for a in binding.actions)
                if binding.every is not None:
                    timers.append({"id": element_id, "every": binding.every})
            bindings.setdefault(element_id, {})[event] = exported
        return {"version": 1, "bindings": bindings, "timers": timers, "needs_server": needs_server}

    # ---------------------------------------------------------------- helpers

    def _add(self, element_id: str, event: str, binding: _Binding) -> None:
        self._bindings.setdefault((element_id, event), []).append(binding)

    @staticmethod
    def _check(element_id: str, event: str, every: float | None) -> None:
        if ELEMENT_IDS is not None and element_id not in ELEMENT_IDS:
            log.warning("Unknown element ID %r (see src/hub/elementIds.ts)", element_id)
        if HUB_EVENTS is not None and event not in HUB_EVENTS:
            log.warning("Unknown event %r for %s; expected one of %s", event, element_id, sorted(HUB_EVENTS))
        if event == "timer" and (every is None or every <= 0):
            raise ValueError(f'{element_id}: the "timer" event needs every=<seconds>')


def _as_actions(result: ActionResult) -> Iterable[A.Action]:
    if result is None:
        return ()
    if isinstance(result, A.Action):
        return (result,)
    return tuple(result)


def _url_ok(action: Mapping[str, Any]) -> bool:
    return action.get("type") != "open_url" or url_registry.is_allowed(action["url"])


def _public(action: A.Action) -> dict[str, Any]:
    data = action.to_dict()
    data.pop("secret_headers", None)
    return data


def fill_template(template: str, result: Any) -> str:
    """Replace "{a.b}" with result["a"]["b"]; "{}" with the whole result."""

    def lookup(match: re.Match[str]) -> str:
        value: Any = result
        for part in filter(None, match.group(1).split(".")):
            if isinstance(value, Mapping):
                value = value.get(part, "")
            elif isinstance(value, list) and part.isdigit() and int(part) < len(value):
                value = value[int(part)]
            else:
                return ""
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

    return _FIELD.sub(lookup, template)


hub = Hub()
