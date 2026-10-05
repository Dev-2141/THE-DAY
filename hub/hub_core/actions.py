"""Action builders: everything a connection in hub.py can make the interface do.

Each builder returns an Action. Actions are plain data, so they can be sent to
the interface over the local channel or exported to hub.json for Android.
The wire format is mirrored in src/hub/protocol.ts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Sequence

from .urls import url_registry


@dataclass(frozen=True)
class Action:
    data: Mapping[str, Any]
    #: True when the action needs the Python hub to run (secrets, custom code).
    needs_server: bool = False

    def to_dict(self) -> dict[str, Any]:
        return dict(self.data)


@dataclass(frozen=True)
class Button:
    label: str
    actions: Sequence[Action] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {"label": self.label, "actions": [a.to_dict() for a in self.actions]}


def button(label: str, *actions: Action) -> Button:
    """A pop-up button. With no actions it simply closes the pop-up."""
    return Button(label, tuple(actions))


def open_url(url: str, *, in_app: bool = False) -> Action:
    """Open a website in the system browser, or in an in-app glass panel."""
    url_registry.register(url)
    return Action({"type": "open_url", "url": url, "target": "panel" if in_app else "browser"})


def popup(
    *,
    title: str,
    text: str = "",
    buttons: Sequence[Button] = (),
    style: Literal["dialog", "sheet"] = "dialog",
) -> Action:
    """A glass dialog (default) or bottom sheet with a title, text and buttons."""
    return Action(
        {
            "type": style,
            "title": title,
            "text": text,
            "buttons": [b.to_dict() for b in buttons] or [button("OK").to_dict()],
        },
        needs_server=any(a.needs_server for b in buttons for a in b.actions),
    )


def sheet(*, title: str, text: str = "", buttons: Sequence[Button] = ()) -> Action:
    """A bottom sheet. Same as popup(style="sheet")."""
    return popup(title=title, text=text, buttons=buttons, style="sheet")


def toast(text: str) -> Action:
    """A short message that fades away by itself."""
    return Action({"type": "toast", "text": text})


def navigate(screen: str) -> Action:
    """Go to another screen of the app, by name."""
    return Action({"type": "navigate", "screen": screen})


def set_text(target: str, text: str) -> Action:
    """Change the text of a label, by element ID."""
    return Action({"type": "set_text", "target": target, "text": text})


def set_visible(target: str, visible: bool) -> Action:
    """Show or hide an element, by element ID."""
    return Action({"type": "set_visible", "target": target, "visible": visible})


def set_setting(key: str, value: str | int | float | bool) -> Action:
    """Change a setting, such as "time.hour12" or "quality"."""
    return Action({"type": "set_setting", "key": key, "value": value})


def call_api(
    url: str,
    *,
    method: Literal["GET", "POST"] = "GET",
    body: Any = None,
    show: Literal["toast", "set_text"] = "toast",
    template: str = "{}",
    target: str | None = None,
    secret_headers: Mapping[str, str] | None = None,
) -> Action:
    """Call a web API and present the JSON result.

    template:       text to show; "{a.b}" reads field b of field a of the result,
                    "{}" shows the whole result.
    show/target:    "toast", or "set_text" into the element `target`.
    secret_headers: header name -> name of a variable in hub/.env. Secrets never
                    leave the hub, so such calls are not exported to Android and
                    need the hub running on a server there.
    """
    url_registry.register(url)
    data: dict[str, Any] = {
        "type": "call_api",
        "url": url,
        "method": method,
        "body": body,
        "present": {"kind": show, "template": template, "target": target},
    }
    if secret_headers:
        data["secret_headers"] = dict(secret_headers)
    return Action(data, needs_server=bool(secret_headers))
