# THE DAY

A full-screen living poster that works as an app home screen, for Windows and
Android from one codebase: a cinematic scene in many moving layers, the live
time and date, and glass buttons that you connect to the rest of your project
in one Python file, `hub/hub.py`.

Built in 12 steps from `../the-day-12-step-build-prompt.md`. This is the
complete README (step 12).

- [Requirements](#requirements)
- [Run in development](#run-in-development)
- [Build for Windows](#build-for-windows) · [Build for Android](#build-for-android)
- [Signing](#signing)
- [Replace an image layer](#replace-an-image-layer)
- [Configuration](#configuration): time zone, clock, wind, look, quality
- [The connectivity hub](#the-connectivity-hub): one example per action type
- [How the hub runs on each platform](#how-the-hub-runs-on-each-platform)
- [The three fixed text lines](#the-three-fixed-text-lines)
- [Using the app](#using-the-app)
- [Quality levels and measured frame rates](#quality-levels-and-measured-frame-rates)
- [Tests](#tests)
- [Before publishing to a store](#before-publishing-to-a-store)

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 20 or newer (tested on 24.18) | everything |
| Python | 3.10 or newer (tested on 3.11.9) | the hub in development, `hub:export`, tests, build scripts |
| Pillow | any recent (`pip install pillow numpy`) | `assets:textures`, `assets:temp`, `icons` |
| Rust + Microsoft C++ Build Tools | stable (tested on 1.99) | the Windows app |
| Android Studio | any recent; its JDK (`jbr`, 21) and SDK | the Android app |
| Android NDK | r27 or newer (tested on r29) | the Android app |
| Rust Android targets | `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` | the Android app |

The end user needs none of these. The Windows app carries its own Python,
and the Android app needs no Python.

For Android builds, set these once per terminal (PowerShell shown):

```powershell
$env:JAVA_HOME    = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME     = "$env:LOCALAPPDATA\Android\Sdk\ndk\29.0.14206865"
```

(Install the NDK from Android Studio: Settings › Languages & Frameworks ›
Android SDK › SDK Tools › NDK. Use the version folder you actually have.)

## Run in development

```sh
npm install
npm run dev          # browser at http://localhost:5173; starts the Python hub too
npm run tauri:dev    # the same app in a native Windows window
```

Edits to the interface reload at once; edits to anything in `hub/` restart the
hub. Under `npm run dev` the development tools are shown as well (they are
never in a built app):

| Key / control | What it does |
|---|---|
| **D** | hides or shows the development panel |
| Motion | pause the scene, or run it at 1×, 10× or 60× |
| **R** / Show reference | the reference poster on top, to check alignment |
| Layout | `extend` fills any window shape; `letterbox` shows the poster alone |
| Post-processing / **P** | the finished image on or off, and each pass on its own |
| Display font | Bodoni Moda, Italiana or Playfair Display for THE, D and Y |
| Clock | quick time-zone switches (shared with the settings panel) |
| Quality and robustness | measure every level, forget the automatic choice, simulate a lost GPU context |
| Test hub (bottom right) | sends `dev.hub_test / tap` to Python and shows the reply and its route |

`http://localhost:5173/?benchmark` measures every quality level and writes
`benchmark/results.json`; `?benchmark=medium` measures one level with its own
textures and writes `benchmark/medium.json`.

## Build for Windows

```sh
npm run windows:build
```

This builds the web app, fetches the bundled Python (once), compiles the
Windows app, then packs the portable build. You get, in `release/`:

| File | What it is |
|---|---|
| `THE DAY_1.0.0_x64-setup.exe` | the installer: installs for the current user (no administrator rights), with Start-menu entry and uninstaller |
| `THE-DAY-1.0.0-portable-x64.zip` | the portable build: unzip anywhere and run `THE DAY.exe` |

Both contain the app, its icon, name and version, the hub (`hub/hub.py` stays a
plain, editable file next to the app) and the official embeddable Python
3.11.9 from python.org (`python/`, checked against a pinned SHA-256 by
`scripts/fetch_python.py`). Windows 10 and 11 already include the WebView2
runtime the app draws in.

The installed app lives in `%LOCALAPPDATA%\THE DAY`. Its settings are kept in
`%LOCALAPPDATA%\dev.theday.app`, so they survive updates and reinstalls.

## Build for Android

Set the three environment variables above, then:

```sh
npm run android:apk    # debug APK: install straight away
npm run android:aab    # release AAB: for Google Play
```

| Output | Path |
|---|---|
| Debug APK | `src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk` |
| Release AAB | `src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab` |

The universal debug APK holds all four processor types (about 260 MB). For
a phone alone, `npm run android:apk -- --target aarch64` builds a quarter of
that. Google Play delivers only the matching part of the AAB.

Install the debug APK on a phone with USB debugging on (Settings › About phone
› tap Build number seven times, then Developer options › USB debugging):

```sh
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Or copy the APK to the phone and open it (allow installing from that app when
asked).

The Android app is portrait only, runs full screen and immersive (the system
bars hide; swipe from an edge to see them briefly), shows a splash screen in
the poster's cream while it starts, and needs Android 7.0 (API 24) or newer.
The Android project is in `src-tauri/gen/android` and is part of the source:
`MainActivity.kt` (immersive, splash), `AndroidManifest.xml` (portrait) and
`app/build.gradle.kts` (signing) carry THE DAY's changes.

## Signing

Signing proves who made the app. Keys and passwords never go in the code: the
`.gitignore` already excludes `*.jks`, `*.keystore`, `*.pfx`, `*.p12`,
`keystore.properties` and `hub/.env`. Keep a backup of every key somewhere safe:
a lost Android upload key has to be reset through Google, and a lost Windows
certificate has to be bought again.

### Android, step by step

1. **Create an upload key**, once, outside the project folder:
   ```powershell
   & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore "$env:USERPROFILE\keys\the-day-upload.jks" `
     -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```
   Choose a strong password and answer the questions (your name is enough).
2. **Tell the build where it is.** Create `src-tauri/gen/android/keystore.properties`:
   ```properties
   storeFile=C:/Users/you/keys/the-day-upload.jks
   keyAlias=upload
   storePassword=the password
   keyPassword=the password
   ```
   Or leave the passwords out of the file and set them in the environment
   instead: `THE_DAY_STORE_PASSWORD` and `THE_DAY_KEY_PASSWORD` (also
   `THE_DAY_STORE_FILE` and `THE_DAY_KEY_ALIAS`, e.g. on a build server).
3. **Build:** `npm run android:aab` now produces a signed AAB. Without the
   file or variables the AAB is built unsigned.
4. **In Google Play Console**, create the app and turn on *Play App Signing*
   (the default). Google keeps the key that signs what users download; yours
   is only the upload key, which Google can reset if you lose it.
5. **Check a build** with
   `& "$env:JAVA_HOME\bin\jarsigner.exe" -verify -verbose -certs <file.aab>`.

The debug APK is signed automatically with Android's debug key, which is why
it installs straight away. It cannot go to the store.

### Windows, step by step

Unsigned installers work, but Windows SmartScreen warns about them
("Windows protected your PC" › More info › Run anyway).

1. **Get a code-signing certificate** from a certificate authority (an
   OV or EV certificate, or Microsoft's Azure Trusted Signing service). Store
   it in your Windows certificate store, or on the hardware token it comes on.
2. **Find its thumbprint:** `Get-ChildItem Cert:\CurrentUser\My` in PowerShell.
3. **Tell Tauri**, in `src-tauri/tauri.windows.conf.json`, under `bundle`:
   ```json
   "windows": {
     "certificateThumbprint": "YOUR THUMBPRINT",
     "digestAlgorithm": "sha256",
     "timestampUrl": "http://timestamp.digicert.com",
     "nsis": { "installMode": "currentUser", "installerIcon": "icons/icon.ico", "displayLanguageSelector": false }
   }
   ```
   The thumbprint is not a secret: the private key stays in the certificate
   store and is never copied into the project. For Azure Trusted Signing, use
   `"signCommand"` instead, as described in Tauri's Windows signing guide.
4. **Build** with `npm run windows:build`: the app and the installer are signed.
5. **Check:** right-click the installer › Properties › Digital Signatures.

## Replace an image layer

Put the new file in `public/assets/layers/` under exactly the same name, then
run:

```sh
npm run assets:textures   # remakes the smaller sets for the medium and low levels
```

No code change is needed (`npm run build` runs this step for you). `ASSETS.md`
lists every layer: its size, what it shows, whether it is transparent, and
the shared canvas the full-scene layers are drawn on. Each layer is loaded
through `src/assets/manifest.ts`.

To replace the app icon, put a 1024 × 1024 PNG with no transparency at
`art/app-icon.png` and run `npx tauri icon art/app-icon.png`. On Android the
middle two thirds of the icon must hold everything important, because the
launcher crops the rest to its own shape. (`npm run icons` remakes the
temporary icon from the reference first; skip it once you have your own.)

## Configuration

Every tunable value is in `src/config/config.ts`, with a comment on each.

### Time zone and clock

These are the first-launch defaults. The settings panel changes them while the
app runs and remembers the user's choice.

```ts
time: {
  timeZone: '',         // IANA zone such as 'Asia/Kolkata'; '' uses the device's zone
  hour12: true,         // false for 24-hour
  showSeconds: false,
  locale: 'en-GB',      // weekday and month names
},
```

### Wind and the finished look

```ts
wind: {
  direction: 1,        // 1 blows left to right, -1 right to left (clouds, haze, smoke, grass, seeds)
  strength: 0.18,      // steady lean of the grass between gusts, 0..1
  gustsPerMinute: 7,   // how often a gust crosses the screen
  gustStrength: 0.75,  // how hard a gust bends the grass, 0..1
  ...
},
post: {
  bloom: { enabled: true, strength: 0.45, ... },  // every pass: enabled + strength
  ...
},
```

### Interface, motion, quality and sound

| Section | What it sets |
|---|---|
| `ui` | idle fade (5 s), long-press and hover times, the tappable scene areas |
| `parallax` | depth response: largest shift, smoothing, tilt range, each layer's depth |
| `motion` | default motion intensity, the calm mode's intensity, and what motion scales |
| `quality` | the four levels (render resolution, texture set, particles, passes) and the frame-time budget for the automatic choice |
| `sound` | the generated wind ambience (off until the user turns it on) |
| `hub` | `remoteUrl` and `remoteToken` for a hub on a server (custom Python on Android) |
| `debug` | the development tools (only under `npm run dev`) |

## The connectivity hub

`hub/hub.py` is the one place that decides what every button and tappable
object does. Change it, save, and the change applies: at once under
`npm run dev`, or after restarting the installed Windows app (its `hub.py` is
in the install folder), or after rebuilding for Android. An element with no
connection simply does nothing.

**Element IDs** (from `src/hub/elementIds.ts`):

| Kind | IDs |
|---|---|
| App | `app` (events `app_start` and `timer`), `ui` (the whole interface) |
| Glass buttons | `btn.enter`, `btn.settings`, `btn.hide_ui`, `btn.back`, `btn.website` |
| Settings panel | `panel.settings`, `settings.time_zone`, `settings.hour_format`, `settings.show_seconds`, `settings.motion_intensity`, `settings.quality`, `settings.sound` |
| Text | `text.title`, `text.time`, `text.date` |
| Scene | `scene.ship`, `scene.beam`, `scene.dome_left`, `scene.dome_right`, `scene.aircraft`, `scene.wreck`, `scene.grass` |
| Development | `dev.hub_test` |

**Events:** `tap`, `long_press`, `hover` (mouse only), `app_start`, `timer`.
The settings controls report every change as `tap` with
`event.payload["value"]`.

**Connections it ships with:** settings opens and closes the settings panel,
hide gives the clean view, ENTER opens the placeholder screen (whose back
button returns home and whose pill opens a website), tapping the ship shows a
glass pop-up, a long press on the left dome shows a bottom sheet, tapping the
wreck shows a toast, and a long press on settings runs a custom Python
function.

### One example per action type

```python
from hub_core import (hub, open_url, popup, sheet, toast, navigate, call_api,
                      set_text, set_visible, set_setting, button)

# Open a website in the system browser, or in the in-app glass panel:
hub.on("btn.website", "tap", open_url("https://example.com"))
hub.on("scene.beam", "tap", open_url("https://example.com/docs", in_app=True))

# A glass dialog with buttons (each button can run more actions):
hub.on("scene.ship", "tap", popup(
    title="Mothership", text="Status: online",
    buttons=[button("Open log", open_url("https://example.com", in_app=True)), button("Close")],
))

# A bottom sheet, and a toast:
hub.on("scene.dome_left", "long_press", sheet(title="The Archive", text="Sealed since the first day."))
hub.on("scene.wreck", "tap", toast("Signal lost."))

# Go to another screen ("home" or "enter"):
hub.on("btn.enter", "tap", navigate("enter"))

# Call a web API and show the result; {a.b} reads a field of the JSON reply:
hub.on("scene.aircraft", "tap", call_api("https://api.github.com/zen", show="toast", template="{}"))
# ...with an API key kept in hub/.env (needs the server hub on Android):
hub.on("text.date", "tap", call_api(
    "https://api.example.com/today", secret_headers={"Authorization": "EXAMPLE_API_KEY"},
    show="set_text", target="text.date", template="{today.label}",
))

# Push changes back to the interface:
hub.on("scene.beam", "long_press", set_text("btn.enter", "BEGIN"))       # a label (or text.time / text.date)
hub.on("text.title", "long_press", set_visible("btn.enter", False))      # hide or show; "toggle" flips
hub.on("btn.settings", "tap", set_visible("panel.settings", "toggle"))   # the settings panel
hub.on("app", "app_start", set_setting("time.hour12", False))            # any setting
hub.on("app", "timer", set_text("text.time", "SIGNAL"), every=60)        # every 60 seconds

# A custom Python function: return actions (or None):
@hub.on("scene.dome_right", "tap")
def count_taps(event):
    count_taps.n = getattr(count_taps, "n", 0) + 1
    return hub.toast(f"Tapped {count_taps.n} times")
```

Settings keys for `set_setting`: `time.timeZone`, `time.hour12`,
`time.showSeconds`, `motion` (0 to 1), `quality` (`auto`, `low`, `medium`,
`high`, `ultra`), `sound` (True or False), `layout` (`extend` or `letterbox`).
`set_visible` also takes a scene object (`scene.ship` and so on) to hide it.

**Safety.** Only web addresses written in `hub.py` are ever opened: the list is
sealed when the hub starts, an address made at run time (for example from an
API's reply) is refused unless you call `hub.allow_url(...)` for it, and the
interface opens only `http` and `https` addresses. API results are only ever
shown as text. API keys stay in `hub/.env` (copy `hub/.env.example`), which
is never committed or bundled into the Android build.

## How the hub runs on each platform

- **Windows.** The app starts `hub/server.py` with its bundled Python as a
  hidden companion process. The process listens on `127.0.0.1` only, on a free
  port, and needs a fresh random token for every launch, handed over in an
  environment variable, so nothing else on the machine can call it. It stops
  when the app closes. Under `npm run dev`, vite starts and restarts it the
  same way.
- **Android.** There is no Python on the phone, so `npm run hub:export` (part
  of every build) writes the declarative connections to `public/hub.json`,
  and the app runs them itself: websites, pop-ups, screens, API calls without
  secrets, and changes to the interface. Custom Python functions, and API calls
  with secret keys, are exported as "remote". They work on Android only if
  you run the hub on a server and set `config.hub.remoteUrl` (and
  `remoteToken`). The export lists which connections those are. Right now
  they are `btn.settings / long_press: my_feature` and `dev.hub_test / tap`.
  To run the hub on a server:
  `THE_DAY_HUB_TOKEN=<long random token> python hub/server.py --host 0.0.0.0 --port 8765 --origin http://tauri.localhost`,
  behind HTTPS.
- **If the hub is unreachable**, the interface keeps working. Windows falls
  back to `hub.json`; anything still unanswered simply does nothing.

## The three fixed text lines

The wording never changes in the app. If you ever do need to change it:

- **THE** and **FOR DEV BY DEV**: `text.title.sample` and `text.tagline.sample`
  in `src/config/config.ts`. Each line's width stays as measured on the
  reference (`width`), so the letter spacing adapts to the new wording. Adjust
  `width` if the new words should be wider or narrower.
- **DAY** is three separate letters, because its A is the decorative swash
  traced from the reference: D and Y are set in `placeDay()` in
  `src/scene/layers/TextLayer.ts` (`this.glyph('D', …)` and `this.glyph('Y', …)`),
  the swash A is drawn in `src/scene/text/swashA.ts`, and their horizontal
  centres are `text.day.centers` in the config. To change the word, change
  those letters and centres; to use a plain A, replace the swash with a third
  `this.glyph(…)`.

## Using the app

- **Glass buttons:** settings (top right) grows into the settings panel. Hide
  (next to it) gives a clean view: tap the sky or press **H** to bring the
  interface back. ENTER (bottom) opens the placeholder screen.
- The interface fades out after 5 seconds without input and returns on any
  touch, mouse movement or key.
- **Depth:** the layers shift with the mouse on Windows and with the phone's
  tilt on Android (touch drag where there is no tilt sensor). Far layers move
  least.
- **Settings** (remembered between launches): time zone, 12 or 24 hour,
  seconds, motion, quality (Auto measures the device on first launch) and the
  wind sound.
- **Keyboard:** Tab moves between buttons and controls, Enter or Space presses,
  Escape closes the topmost panel or pop-up, **H** toggles the clean view, F11
  toggles full screen. Android's back button closes the topmost panel.
- **Calm mode:** when the system asks for reduced motion, clouds and beam move
  very slowly, the grass barely moves, the depth response is off, and the
  glass does not spring.

## Quality levels and measured frame rates

| Level | Render resolution | Textures | Particles | Post-processing |
|---|---|---|---|---|
| low | 0.75 × | low (⅓ size, WebP) | 35 % | tone, grade, vignette, dither |
| medium | 1 × | medium (½ size, WebP) | 65 % | + bloom, key and fill light, atmosphere |
| high | up to 1.5 × | full | 100 % | + sun shafts, grain |
| ultra | up to 2 × | full | 100 % | + depth of field |

On first launch, Auto draws each level for a moment and picks the highest one
whose frame time fits 11 ms (60 Hz with headroom). Measured on the
development laptop (`?benchmark=<level>`, each level with its own textures):

| Screen | GPU | ultra | high | medium | low | Auto picked |
|---|---|---|---|---|---|---|
| 1080 × 1920 | Intel Graphics (integrated) | 67 fps | 85 fps | 99 fps | 169 fps | high |
| 412 × 915 @ 2.6× (phone shape), CPU slowed 4× | Intel Graphics (integrated) | 106 fps | 154 fps | 238 fps | 240 fps | ultra |
| 1080 × 1920 | NVIDIA RTX 5070 Ti Laptop | 240 fps | 240 fps | 239 fps | 240 fps | ultra |

(240 fps is that display's refresh rate.) Measure your own devices with
`?benchmark` under `npm run dev`, or with the development panel's "Measure
every level".

Rendering stops while the app is in the background or minimised, the scene
rebuilds itself if the GPU drops its context, and window resizing, rotation
and display-scaling changes apply without a restart.

## Tests

```sh
npm test             # both suites
npm run test:web     # TypeScript: time and date, time zones, daylight saving, midnight; hub client, actions, settings
npm run test:hub     # Python: registry, export to hub.json, URL safety, the local server and its token
npm run typecheck    # strict TypeScript
```

## Before publishing to a store

1. **Artwork rights.** Every layer in `public/assets/layers/` is currently
   cut from the reference image, and the app icon is cropped from it. Replace
   them with artwork you own or have a licence for (see `ASSETS.md`), and
   check the fonts' licences (Bodoni Moda, Italiana, Playfair Display and
   Cinzel are all under the SIL Open Font License, which allows bundling).
2. **Your own identity.** Change the app ID `dev.theday.app` (in
   `src-tauri/tauri.conf.json` and in `src-tauri/gen/android`) to a domain you
   control *before the first upload*. It can never change afterwards. Set
   `publisher` and `copyright` in the same file.
3. **Real connections.** Replace the example connections and `example.com`
   addresses in `hub/hub.py`, and decide whether you need the server hub on
   Android.
4. **Signing.** An Android upload key and Play App Signing; a Windows
   code-signing certificate (see [Signing](#signing)).
5. **Store listing.** Screenshots (phone portrait; desktop), a short and full
   description, a 512 × 512 icon and a 1024 × 500 feature graphic for Google
   Play, a content rating questionnaire, and a privacy policy. The app
   collects no data, but it can open sites and call APIs you connect.
6. **Versions.** Raise `version` in `src-tauri/tauri.conf.json` (and
   `package.json`) for every release; Android's version code follows it.
7. **Final checks.** Run `npm test`, then install the release builds on a
   real Windows PC and a real phone and try every connection.

## Layout

```
src/config/config.ts      every tunable value (typed)
src/core/                 the shared clock, settings (remembered), full screen, opening links
src/assets/               the asset manifest and loader (texture sets per quality level)
src/scene/composition.ts  the layer order, back to front, and tapping the scene
src/scene/Stage.ts        renderer, depth response, quality, background pause, context loss
src/scene/layers/         one module per scene layer
src/scene/post/           off-screen render and the post-processing passes
src/scene/text/           fonts, spaced lines, the swash A, light wrap
src/time/                 live time and date formatting and the boundary clock
src/ui/glass/             the glass components: round button, pill, panel, refraction
src/ui/                   the interface, settings panel, pop-ups, ENTER screen, loading screen
src/hub/                  hub client, wire protocol, action runner, element IDs
src/audio/                the generated wind ambience
hub/hub.py                YOUR connections: edit only this to change behaviour
hub/hub_core/             hub machinery
hub/server.py             local companion process (127.0.0.1 + per-launch token)
hub/export_json.py        hub.py -> public/hub.json for Android
hub/tests/                the hub's tests
src-tauri/                Tauri 2 shell (starts the hub), Windows config, Android project (gen/android)
scripts/                  texture sets, icon, bundled Python, portable build, temporary layers
ASSETS.md                 the images to supply
```
