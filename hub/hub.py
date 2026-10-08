"""THE DAY connectivity hub.

This is the one place where interactive parts of the interface are wired to
what they do. Element IDs are listed in src/hub/elementIds.ts.
Events: "tap", "long_press", "hover", "app_start", "timer".

A connection is one line:      hub.on("<element id>", "<event>", <action>, ...)
or a decorated Python function that returns zero, one or several actions.
An element with no connection simply does nothing.

Windows: this file runs in a local companion process next to the app. In the
         installed app it sits in the install folder (hub/hub.py) and can be
         edited there; restart the app to load the change.
Android: `npm run hub:export` writes the declarative connections to hub.json.
         Decorated functions (and API calls with secrets) are marked "remote"
         and only work there if config.hub.remoteUrl points at this hub on a
         server. The export prints which connections those are.
"""

import platform
from datetime import datetime

from hub_core import button, hub, navigate, open_url, popup, set_visible, sheet, toast

# ---------------------------------------------------------------------------
# Live connections: the interface's own buttons
# ---------------------------------------------------------------------------

# The settings button opens and closes the glass settings panel.
hub.on("btn.settings", "tap", set_visible("panel.settings", "toggle"))

# The hide button hides the whole interface for a clean view
# (tap the sky, or press H, to bring it back).
hub.on("btn.hide_ui", "tap", set_visible("ui", False))

# ENTER opens the placeholder screen; its back button returns home.
hub.on("btn.enter", "tap", navigate("enter"))
hub.on("btn.back", "tap", navigate("home"))

# The pill on the ENTER screen opens a website in the system browser.
hub.on("btn.website", "tap", open_url("https://example.com"))

# ---------------------------------------------------------------------------
# Live connections: the scene
# ---------------------------------------------------------------------------

# Tapping the ship shows a glass pop-up. Its first button opens a page in the
# in-app glass web panel.
hub.on(
    "scene.ship",
    "tap",
    popup(
        title="Mothership",
        text="Status: online",
        buttons=[button("Open log", open_url("https://example.com", in_app=True)), button("Close")],
    ),
)

# A long press on the left dome slides up a bottom sheet.
hub.on(
    "scene.dome_left",
    "long_press",
    sheet(title="The Archive", text="Sealed since the first day. Its lights have never gone out."),
)

# Tapping the wreck shows a toast.
hub.on("scene.wreck", "tap", toast("Signal lost. The wreck is silent."))


@hub.on("btn.settings", "long_press")
def my_feature(event):
    return hub.toast("Hello from Python")


@hub.on("dev.hub_test", "tap")
def hub_test(event):
    """Development round trip: the test button calls Python and shows its reply."""
    now = datetime.now().strftime("%H:%M:%S")
    return hub.toast(f"Hello from Python {platform.python_version()} · hub time {now}")


# ---------------------------------------------------------------------------
# One example per action type. Uncomment and change the element ID to use.
# ---------------------------------------------------------------------------

# Open a website in the system browser:
# hub.on("scene.dome_right", "tap", open_url("https://example.com"))

# Open a website inside the app, in a glass panel:
# hub.on("scene.beam", "tap", open_url("https://example.com/docs", in_app=True))

# Glass dialog with buttons (each button can run more actions):
# hub.on("scene.dome_right", "tap", popup(
#     title="Archive",
#     text="Sealed since the first day.",
#     buttons=[button("Open site", open_url("https://example.com")), button("Close")],
# ))

# Toast message:
# hub.on("scene.aircraft", "tap", toast("Two contacts, heading north-east"))

# Bottom sheet:
# hub.on("scene.grass", "long_press", sheet(title="Field notes", text="Wind from the west."))

# Go to another screen of the app ("home" or "enter"):
# hub.on("text.title", "long_press", navigate("enter"))

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
# from hub_core import set_text, set_setting
# hub.on("text.title", "long_press", set_visible("btn.enter", False))
# hub.on("scene.beam", "long_press", set_text("btn.enter", "BEGIN"))
# hub.on("app", "app_start", set_setting("time.hour12", False))
# hub.on("app", "timer", set_text("text.time", "SIGNAL"), every=60)
# Settings keys: "time.timeZone", "time.hour12", "time.showSeconds",
#                "motion" (0..1), "quality" ("auto", "low" .. "ultra"),
#                "sound" (True/False), "layout" ("extend", "letterbox").

# Custom Python function (anything you like, return actions or None):
# @hub.on("scene.dome_right", "tap")
# def count_taps(event):
#     count_taps.n = getattr(count_taps, "n", 0) + 1
#     return hub.toast(f"Tapped {count_taps.n} times")
