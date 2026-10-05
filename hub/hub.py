"""THE DAY connectivity hub.

This is the one place where interactive parts of the interface are wired to
what they do. Element IDs are listed in src/hub/elementIds.ts.
Events: "tap", "long_press", "hover", "app_start", "timer".

A connection is one line:      hub.on("<element id>", "<event>", <action>, ...)
or a decorated Python function that returns zero, one or several actions.

Windows: this file runs in a local companion process next to the app.
Android: `npm run hub:export` writes the declarative connections to hub.json.
         Decorated functions (and API calls with secrets) are marked "remote"
         and only work there if config.hub.remoteUrl points at this hub on a
         server. The export prints which connections those are.
"""

import platform
from datetime import datetime

from hub_core import hub, open_url, popup

# ---------------------------------------------------------------------------
# Live connections
# ---------------------------------------------------------------------------

hub.on("btn.enter", "tap", open_url("https://example.com"))
hub.on("scene.ship", "tap", popup(title="Mothership", text="Status: online"))


@hub.on("btn.settings", "long_press")
def my_feature(event):
    return hub.toast("Hello from Python")


@hub.on("dev.hub_test", "tap")
def hub_test(event):
    """Step 1 round trip: the test button calls Python and shows its reply."""
    now = datetime.now().strftime("%H:%M:%S")
    return hub.toast(f"Hello from Python {platform.python_version()} · hub time {now}")


# ---------------------------------------------------------------------------
# One example per action type. Uncomment and change the element ID to use.
# ---------------------------------------------------------------------------

# Open a website in the system browser:
# hub.on("btn.enter", "tap", open_url("https://example.com"))

# Open a website inside the app, in a glass panel:
# hub.on("scene.beam", "tap", open_url("https://example.com/docs", in_app=True))

# Glass dialog with buttons (each button can run more actions):
# from hub_core import button
# hub.on("scene.dome_left", "tap", popup(
#     title="Archive",
#     text="Sealed since the first day.",
#     buttons=[button("Open site", open_url("https://example.com")), button("Close")],
# ))

# Toast message:
# from hub_core import toast
# hub.on("scene.wreck", "tap", toast("Signal lost"))

# Bottom sheet:
# from hub_core import sheet
# hub.on("scene.grass", "long_press", sheet(title="Field notes", text="Wind from the west."))

# Go to another screen of the app:
# from hub_core import navigate
# hub.on("btn.enter", "tap", navigate("home"))

# Call a web API and show the result ({a.b} reads a field of the JSON reply):
# from hub_core import call_api
# hub.on("scene.aircraft", "tap", call_api(
#     "https://api.github.com/zen", show="toast", template="{}",
# ))
# With an API key from hub/.env (needs the server hub on Android):
# hub.on("text.date", "tap", call_api(
#     "https://api.example.com/today",
#     secret_headers={"Authorization": "EXAMPLE_API_KEY"},
#     show="set_text", target="text.date", template="{today.label}",
# ))

# Push changes back to the interface:
# from hub_core import set_text, set_visible, set_setting
# hub.on("text.title", "long_press", set_visible("btn.enter", False))
# hub.on("app", "app_start", set_setting("time.hour12", False))
# hub.on("app", "timer", set_text("text.time", "SIGNAL"), every=60)

# Custom Python function (anything you like, return actions or None):
# @hub.on("scene.dome_right", "tap")
# def count_taps(event):
#     count_taps.n = getattr(count_taps, "n", 0) + 1
#     return hub.toast(f"Tapped {count_taps.n} times")
