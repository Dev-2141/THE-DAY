# THE DAY

A full-screen living poster that works as an app home screen, for Windows and
Android from one codebase. Built in 12 approved steps from
`../the-day-12-step-build-prompt.md`. This README grows with each step; the
complete version is written in step 12.

**Current state: steps 1–9. Foundation, the layered scene, typography and the live clock, drifting sky, the hovering ship, the flowing light beams, the living middle distance (haze, dome lights, aircraft, water, wreck smoke), grass in the wind, and the finished image (bloom, sun shafts, key and fill light, tone curve, grade, atmosphere, depth of field, grain, vignette, dither).**

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 20+ (tested on 24.18) | everything |
| Python | 3.10+ (tested on 3.11.9) | the connectivity hub |
| Pillow + numpy | any recent (`pip install pillow numpy`) | only `npm run assets:temp` |
| Rust + MSVC Build Tools | stable | the Tauri window (`npm run tauri:dev`) |

## Run

```sh
npm install
npm run dev          # browser at http://localhost:5173, starts the Python hub too
npm run tauri:dev    # the same app in a native Windows window (needs Rust)
```

F11 toggles full screen. The top-left readout is the frame rate. **Test hub**
(bottom right) sends `dev.hub_test / tap` to `hub/hub.py` and shows Python's
reply, plus the route it took (local hub, hub.json, remote hub or none).

The development panel (top left) is for checking the work and is not part
of the final interface:

| Key / control | What it does |
|---|---|
| Motion | pause the scene, or run it at 1×, 10× or 60× to fast-forward the drift |
| **R** / Show reference | the reference poster on top, at the chosen opacity, to check alignment |
| Layout | `extend` fills any window shape; `letterbox` shows the poster alone |
| Display font | Bodoni Moda, Italiana or Playfair Display for THE, D and Y |
| Clock | try time zones, 12/24-hour and seconds live |
| Post-processing / **P** | the finished image on or off, and each pass on its own, to compare |
| **D** | hides or shows the panel |

The defaults for all of these live in `src/config/config.ts`
(`stage.layout`, `text.displayFont`, `time`, `debug`).

## Changing the time zone and clock format

In `src/config/config.ts`, section `time`:

```ts
time: {
  timeZone: 'Asia/Kolkata', // any IANA zone; '' uses the device's zone
  hour12: true,             // false for 24-hour
  showSeconds: false,
  locale: 'en-GB',          // weekday and month names
},
```

## Changing the wind and the finished look

In `src/config/config.ts`:

```ts
wind: {
  direction: 1,        // 1 blows left to right, -1 right to left (clouds, haze, smoke, grass, seeds)
  strength: 0.18,      // steady lean of the grass between gusts, 0..1
  gustsPerMinute: 7,   // how often a gust crosses the screen
  gustStrength: 0.75,  // how hard a gust bends the grass, 0..1
  gustSpeed: 0.2,      // poster widths per second
  calm: 0.65,          // how much calmer the calm spells are, 0..1
  ...
},
post: {
  bloom: { enabled: true, strength: 0.45, ... },  // every pass: enabled + strength
  ...
},
```

## Other commands

```sh
npm run typecheck    # strict TypeScript check
npm run hub:export   # write public/hub.json (declarative connections for Android)
npm run assets:enhance  # AI-upscale the reference 4x (Real-ESRGAN, GPU): pip install realesrgan-ncnn-py
npm run assets:temp  # re-cut the temporary layers from the (enhanced) reference
                     # (python scripts/cut_temp_layers.py grass: only terrain, water, grass, flowers)
npm run build        # hub export + type check + production web build
```

## Layout

```
src/config/config.ts      every tunable value (typed)
src/core/clock.ts         the one shared animation clock
src/assets/manifest.ts    every image the app loads
src/scene/composition.ts  the layer order, back to front
src/scene/layers/         one module per scene layer
src/scene/beamPulses.ts   the beam's pulse schedule, shared by beam, ground glow and water
src/scene/wind.ts         the gust schedule, shared by grass, flowers and seeds
src/scene/post/           off-screen render and the post-processing passes
src/scene/text/           fonts, spaced lines, the swash A, light wrap
src/time/                 live time and date formatting and the boundary clock
src/hub/elementIds.ts     every interactive element ID
src/hub/                  hub client, wire protocol, action runner
hub/hub.py                YOUR connections: edit only this to change behaviour
hub/hub_core/             hub machinery
hub/server.py             local companion process (127.0.0.1 + per-launch token)
hub/export_json.py        hub.py -> public/hub.json for Android
src-tauri/                Tauri 2 shell (starts the hub in release builds)
scripts/cut_temp_layers.py  temporary layers from the reference
ASSETS.md                 the images to supply
```
