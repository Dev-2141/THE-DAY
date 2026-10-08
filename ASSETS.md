# Images needed for THE DAY

Put each file in `public/assets/layers/` under exactly this name. Replacing a
file needs no code change. Until you supply a file, the temporary version cut
from the reference (`npm run assets:temp`) is used.

## The shared canvas (read this first)

All **full-scene** layers are exported on one shared canvas so they line up
with no manual positioning:

- Canvas: **3840 x 4000 px**.
- The poster area (the 455 x 674 reference) maps to the **2160 x 3200 px** box
  whose top-left corner is at **(840, 400)**.
- The margins are real artwork, not padding: 400 px of extra sky above,
  400 px of extra grass below, and 840 px left and right so wide desktop
  windows can be filled without stretching.

Easiest way: in your editor make a 3840 x 4000 document, place the reference
scaled to 2160 x 3200 at (840, 400) as a guide layer, paint or place each
layer over it, then export each layer on its own with the guide hidden.

## The list

| File | Shows | Size (px) | Transparent |
|---|---|---|---|
| `sky-base.png` | Warm cream, peach and tan gradient with soft built-in cloud texture; cooler blue-grey at the top; the sun's glow. It never moves, so keep anything that should drift in the cloud layers. No ship, beams, text or terrain. | 3840 x 4000 (canvas) | No |
| `clouds-far.png` | Large, soft, slow cloud masses, low in the sky near the horizon. Clear sky between clouds is transparent. **Must tile seamlessly left to right.** | 4096 x 2700 | Yes |
| `clouds-mid.png` | The upper sky's cloud, behind the ship. Transparent between clouds. **Tiles seamlessly left to right.** | 4096 x 2700 | Yes |
| `clouds-near.png` | Wispy cloud in front of the ship, passing over its edges and around the domes. Transparent between clouds. **Tiles seamlessly left to right.** | 4096 x 2700 | Yes |
| `ship.png` | The whole ship: both angular halves, the V-notch, pale hull, dark underside, curved emitter. **No beams.** | 2400 x 640 | Yes |
| `ship-lights.png` | Same frame as `ship.png`: only the running lights and emitter glow, white on transparent. | 2400 x 640 | Yes |
| `dome-left.png` | The large left dome with its thin row of lights, without haze baked in. | 1000 x 820 | Yes |
| `dome-right.png` | The smaller right dome with its thin row of lights, without haze baked in. | 700 x 640 | Yes |
| `aircraft.png` | One small aircraft as seen in the reference, flying up and to the right. **No vapour trail** (trails are generated). Used for both aircraft. | 480 x 240 | Yes |
| `mountains-far.png` | The farthest, palest ridge line, behind the beam. | 3840 x 4000 (canvas) | Yes |
| `mountains-mid.png` | The middle ridges, including the ones the beam lights cyan. | 3840 x 4000 (canvas) | Yes |
| `mountains-near.png` | The nearest, darkest ridges and terrain. | 3840 x 4000 (canvas) | Yes |
| `wreck.png` | The small tilted crashed craft at the lower left. | 800 x 560 | Yes |
| `water.png` | The thin pale marsh water strips, and the ground behind the grass down to the bottom edge (no grass in it). No reflections baked in if possible. | 3840 x 4000 (canvas) | Yes |
| `grass-far.png` | The back row of grass and reeds, smallest and hazier. Blades only, on transparent. | 3840 x 4000 (canvas) | Yes |
| `grass-mid.png` | The middle row of grass and reeds. Blades only, on transparent. | 3840 x 4000 (canvas) | Yes |
| `grass-near.png` | The front row: tallest, darkest grass and reeds along the bottom edge, denser toward the right. Blades only, on transparent. | 3840 x 4000 (canvas) | Yes |
| `flowers.png` | Only the tiny warm orange flowers, on transparent, so they can bob with the grass. | 3840 x 4000 (canvas) | Yes |

The app icon: `art/app-icon.png`, **1024 x 1024**, no transparency. A
temporary one cropped from the reference is in place (`python
scripts/make_icon.py`). Replace it with your own and run `npx tauri icon
art/app-icon.png` to remake every platform's icons. On Android the launcher
shows only the middle two thirds, so keep everything important there.

After replacing any layer, run `npm run assets:textures` (or build): it remakes
the smaller copies the medium and low quality levels load.

### Not needed as images

These are generated in code so they can move and react to light: the sun
glow, the light beams and their dust motes, haze, vapour trails, smoke,
water shimmer, seeds and particles, and every post-processing effect.

### Notes

- When you supply real cloud tiles with detail across their whole width, set
  `layers.clouds.edgeFade` to `0` in `src/config/config.ts`. It currently fades
  the temporary clouds out past the poster to match their soft extension.

- Do not include the logos or the watermark from the bottom of the reference.
- Export grass with clean, un-premultiplied alpha and the roots running off
  the bottom of the canvas, so the wind shader can bend the tips without
  showing a cut edge. Nothing but blades in the grass layers: whatever is
  in them sways. The ground and water behind the grass belong in `water.png`.
- Each grass plane bends from `layers.grass.root` (the roots, poster y) and
  reaches full bend at `layers.grass.height` above it. Keep a whole blade in
  one plane, so the planes never pull a blade apart.
- PNG for anything transparent. `sky-base` may also be a high-quality JPEG
  if you rename the path in `src/assets/manifest.ts`.
