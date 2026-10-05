"""Cuts temporary layer images from the reference poster.

    npm run assets:enhance     (once: AI-upscales the reference, see enhance_reference.py)
    npm run assets:temp        (needs Pillow and numpy)

These stand in for the real artwork until it is supplied, so the app runs
with every layer in place. They follow the same frames as the final files
(see src/assets/manifest.ts) at three quarters of the 4K size: the shared
canvas is 2880 x 3000 with the poster area at (630, 300) sized 1620 x 2400.

How the cut works:
  0. The source is the 4x AI-upscaled reference (art/reference-x4.png) when it
     exists, otherwise the reference itself, resized.
  1. The logos along the bottom edge are painted out.
  2. A clean sky is made by removing the ship, beams, text, aircraft and domes
     and filling the holes from the surrounding sky (push-pull inpainting).
     The beams and text are drawn live by the app, so they must not be baked in.
  3. Objects are cut against the clean sky: their transparency is how much the
     reference differs from it, and their colour is un-mixed from the sky so
     that object-over-sky reproduces the reference.
  4. Terrain, water and grass are horizontal bands of the reference.
  5. Past the poster's edges each canvas layer continues as its own mirror
     image, exact at the edge and getting progressively softer and hazier with
     distance, so there is no visible line where the poster ends.
  6. The sky is split so it can move: a static base (the gradient and the sun)
     plus three cloud layers. Each cloud belongs to one layer by height, so it
     keeps all of its detail when the layers drift apart: the upper sky behind
     the ship (mid), the middle sky in front of it (near) and the sky near the
     horizon (far). The bands meet where the sky has least detail, and at rest
     the layers over the base give back the original sky exactly.

The object boxes below must match `config.layers` in src/config/config.ts.
Replacing any output file with the real artwork needs no code change.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "public" / "assets" / "reference" / "reference.png"
ENHANCED = ROOT / "art" / "reference-x4.png"
OUT = ROOT / "public" / "assets" / "layers"

# Three quarters of the 4K frame sizes in src/assets/manifest.ts.
SCALE = 0.75
POSTER_W, POSTER_H = round(2160 * SCALE), round(3200 * SCALE)
CANVAS_W, CANVAS_H = round(3840 * SCALE), round(4000 * SCALE)
POSTER_X, POSTER_Y = round(840 * SCALE), round(400 * SCALE)
TILE_W, TILE_H = round(4096 * SCALE), round(2700 * SCALE)
CLOUD_X = round(896 * SCALE)  # tile origin on the canvas: config.layers.clouds.originX

REF_W, REF_H = 455, 674
K = POSTER_W / REF_W  # reference pixels -> temp poster pixels

# Logo and watermark boxes in reference pixels, painted out.
LOGOS = [(30, 654, 102, 673), (430, 652, 455, 674)]

# The ship's outline in reference pixels, traced from the reference.
SHIP_LEFT = [
    (0, 19), (60, 21), (120, 23), (140, 26), (150, 23), (205, 24), (216, 30), (231, 46),
    (239, 66), (242, 90), (245, 112), (244, 125), (238, 118), (232, 104), (229, 88),
    (200, 84), (165, 82), (158, 96), (148, 94), (128, 83), (90, 68), (45, 54), (25, 42), (0, 38),
]
SHIP_RIGHT = [
    (290, 29), (345, 32), (353, 36), (363, 37), (455, 39), (455, 58), (420, 70), (406, 82),
    (370, 84), (330, 87), (295, 89), (264, 91), (262, 112), (255, 116), (250, 102),
    (252, 80), (262, 62), (275, 44),
]

# Regions removed from the sky, in reference pixels (x0, y0, x1, y1).
BEAMS_AND_TEXT = [(146, 55, 308, 470), (104, 124, 346, 276)]
AIRCRAFT_AND_TRAILS = (334, 276, 455, 346)
DOME_LEFT_BOX = (0, 372, 102, 505)
DOME_RIGHT_BOX = (374, 390, 452, 478)
BEAM_GROUND_BOX = (140, 440, 312, 600)
WRECK_BOX = (0, 515, 78, 584)

# Object cut-outs as poster fractions (x0, y0, x1, y1). Mirror config.layers.
OBJECTS = {
    "ship": (0.0, 0.0, 1.0, 0.1875),
    "dome-left": (0.0, 0.552, 0.224, 0.749),
    "dome-right": (0.822, 0.579, 0.993, 0.709),
    "aircraft": (0.866, 0.433, 0.963, 0.481),
    "wreck": (0.0, 0.77, 0.16, 0.86),
}

# Canvas layers as vertical bands of the poster: (y0, y1, feather).
BANDS = {
    "mountains-far": (0.695, 0.75, 0.012),
    "mountains-mid": (0.74, 0.82, 0.012),
    "mountains-near": (0.81, 0.89, 0.012),
    "water": (0.87, 0.93, 0.008),
    "grass-far": (0.86, 0.92, 0.01),
    "grass-mid": (0.90, 0.96, 0.01),
    "grass-near": (0.94, 1.0, 0.01),
}
# Luminance range over which a pixel in the water band counts as open water.
WATER_PALE = (0.45, 0.6)


# --------------------------------------------------------------------- helpers

def to_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image, dtype=np.float32) / 255.0


def to_image(array: np.ndarray) -> Image.Image:
    return Image.fromarray(np.clip(array * 255.0 + 0.5, 0, 255).astype(np.uint8))


def resize_float(array: np.ndarray, width: int, height: int) -> np.ndarray:
    channels = [
        np.asarray(Image.fromarray(array[..., c]).resize((width, height), Image.BILINEAR))
        for c in range(array.shape[2])
    ]
    return np.stack(channels, axis=-1)


def push_pull(image: np.ndarray, known: np.ndarray) -> np.ndarray:
    """Fill unknown pixels smoothly from the known ones (multi-scale average)."""
    h, w = known.shape
    if min(h, w) <= 4:
        weight = max(float(known.sum()), 1e-6)
        mean = (image * known[..., None]).sum((0, 1)) / weight
        return image * known[..., None] + mean * (1 - known[..., None])
    hp, wp = h + h % 2, w + w % 2
    img = np.pad(image * known[..., None], ((0, hp - h), (0, wp - w), (0, 0)))
    kn = np.pad(known, ((0, hp - h), (0, wp - w)))
    colour = img.reshape(hp // 2, 2, wp // 2, 2, 3).sum((1, 3))
    weight = kn.reshape(hp // 2, 2, wp // 2, 2).sum((1, 3))
    small = colour / np.maximum(weight, 1e-6)[..., None]
    coarse = push_pull(small, np.minimum(weight, 1.0))
    up = resize_float(coarse.astype(np.float32), wp, hp)[:h, :w]
    return image * known[..., None] + up * (1 - known[..., None])


def poly_mask(points: list[tuple[int, int]], dilate: float = 0.0, feather: float = 0.0) -> np.ndarray:
    mask = Image.new("L", (POSTER_W, POSTER_H), 0)
    ImageDraw.Draw(mask).polygon([(x * K, y * K) for x, y in points], fill=255)
    if dilate > 0:
        mask = mask.filter(ImageFilter.MaxFilter(int(dilate * K) * 2 + 1))
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(feather * K))
    return np.asarray(mask, dtype=np.float32) / 255.0


def box_mask(box: tuple[int, int, int, int], feather: float = 0.0) -> np.ndarray:
    x0, y0, x1, y1 = box
    return poly_mask([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], feather=feather)


def frac_box(box: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    return round(x0 * POSTER_W), round(y0 * POSTER_H), round(x1 * POSTER_W), round(y1 * POSTER_H)


# ------------------------------------------------------------------ the steps

def clean_reference() -> np.ndarray:
    if ENHANCED.exists():
        image = Image.open(ENHANCED).convert("RGB")
    else:
        print("note: art/reference-x4.png not found; run `npm run assets:enhance` for sharper layers")
        image = Image.open(REFERENCE).convert("RGB")
    f = image.width / REF_W
    for box in LOGOS:
        x0, y0, x1, y1 = (round(v * f) for v in box)
        # Copy the grass from beside the logo, from whichever side has room.
        w = x1 - x0
        sx = x1 if x1 + w <= image.width else x0 - w
        image.paste(image.crop((sx, y0, sx + w, y1)), (x0, y0))
        pad = round(2 * f)
        region = image.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad)).filter(ImageFilter.GaussianBlur(1.2 * f))
        image.paste(region, (x0 - pad, y0 - pad))
    return to_array(image.resize((POSTER_W, POSTER_H), Image.LANCZOS))


def clean_sky(reference: np.ndarray) -> np.ndarray:
    hole = np.maximum.reduce(
        [
            poly_mask(SHIP_LEFT, dilate=3),
            poly_mask(SHIP_RIGHT, dilate=3),
            *(box_mask(b) for b in BEAMS_AND_TEXT),
            box_mask(AIRCRAFT_AND_TRAILS),
            box_mask(DOME_LEFT_BOX),
            box_mask(DOME_RIGHT_BOX),
        ]
    )
    known = (hole < 0.5).astype(np.float32)
    filled = push_pull(reference, known)
    # Soften the filled areas a little so their edges do not show.
    soft = to_array(to_image(filled).filter(ImageFilter.GaussianBlur(2 * K)))
    blend = np.asarray(Image.fromarray((hole * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3 * K)),
                       dtype=np.float32)[..., None] / 255.0
    return filled * (1 - blend) + soft * blend


def blur(array: np.ndarray, radius: float) -> np.ndarray:
    """Gaussian blur in floating point (no 8-bit banding), via FFT with
    mirrored padding so the edges are not pulled toward the opposite side."""
    if radius <= 0:
        return array
    pad = int(np.ceil(3 * radius))
    h, w = array.shape[:2]
    padded = np.pad(array, ((pad, pad), (pad, pad), (0, 0)), mode="reflect")
    fy = np.fft.fftfreq(padded.shape[0])[:, None]
    fx = np.fft.rfftfreq(padded.shape[1])[None, :]
    transfer = np.exp(-2 * (np.pi * radius) ** 2 * (fx ** 2 + fy ** 2)).astype(np.float32)
    out = np.empty_like(array)
    for c in range(array.shape[2]):
        spectrum = np.fft.rfft2(padded[..., c]) * transfer
        out[..., c] = np.fft.irfft2(spectrum, s=padded.shape[:2])[pad:pad + h, pad:pad + w]
    return out


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)


# Softness of the extension by distance from the poster's edge, measured in
# pixels of a 1080-px-wide poster: (distance, blur radius), linear in between.
EXTENSION_SOFTNESS = [(0, 0.0), (50, 3.0), (180, 12.0), (420, 32.0), (900, 64.0)]
# Over this distance the extension changes from the poster's own mirror image
# (continuous at the edge) to the mirror of `margin_source`.
MARGIN_CROSSFADE = 15
# Terrain and grass layers fade out over this distance past the poster.
BAND_MARGIN_FADE = 70

# Blur radius (on a 1080-px-wide poster) that separates the static sky base
# from the moving clouds.
SKY_BASE_SCALE = 90.0
# Where the upper (mid), middle (near) and horizon (far) bands meet: each
# boundary is placed at the row with least cloud detail inside its range.
SKY_BAND_RANGES = ((0.17, 0.30), (0.36, 0.50))
SKY_BAND_SOFTNESS = 0.03


def poster_distance() -> tuple[np.ndarray, np.ndarray]:
    """Distance of every canvas pixel from the poster rectangle, and the
    distance below the poster's bottom edge (per row)."""
    px = np.arange(CANVAS_W, dtype=np.float32)
    py = np.arange(CANVAS_H, dtype=np.float32)
    dx = np.maximum.reduce([POSTER_X - px, np.zeros_like(px), px - (POSTER_X + POSTER_W - 1)])
    dy_above = np.maximum(POSTER_Y - py, 0)
    dy_below = np.maximum(py - (POSTER_Y + POSTER_H - 1), 0)
    dy = np.maximum(dy_above, dy_below)
    return np.sqrt(dx[None, :] ** 2 + dy[:, None] ** 2), dy_below


def extend_canvas(poster: np.ndarray, margin_source: np.ndarray | None = None, haze: float = 0.0) -> Image.Image:
    """Place the poster on the canvas and continue it past every edge as a
    mirror image (of `margin_source`, if given, so objects near the poster's
    edges are not repeated). Right at the edge the continuation is exact;
    with distance it gets progressively softer, optionally hazier, and below
    the poster darker, so the eye never finds the poster's border."""
    xs = np.arange(CANVAS_W) - POSTER_X
    xs = np.where(xs < 0, -xs - 1, xs)
    xs = np.where(xs >= POSTER_W, 2 * POSTER_W - 1 - xs, xs)
    xs = np.clip(xs, 0, POSTER_W - 1)
    ys = np.arange(CANVAS_H) - POSTER_Y
    ys = np.where(ys < 0, -ys - 1, ys)
    ys = np.where(ys >= POSTER_H, 2 * POSTER_H - 1 - ys, ys)
    ys = np.clip(ys, 0, POSTER_H - 1)
    canvas = poster[ys][:, xs]

    distance, dy_below = poster_distance()
    unit = POSTER_W / 1080

    if margin_source is not None:
        w = smoothstep(0, MARGIN_CROSSFADE * unit, distance)[..., None]
        canvas = canvas * (1 - w) + margin_source[ys][:, xs] * w
    canvas[POSTER_Y:POSTER_Y + POSTER_H, POSTER_X:POSTER_X + POSTER_W] = poster

    # Below the poster the softening comes on faster, so mirrored grass never reads.
    softness_distance = distance + 1.2 * dy_below[:, None]

    # Blend between progressively blurrier versions by distance.
    levels = [(d * unit, blur(canvas, r * unit)) for d, r in EXTENSION_SOFTNESS]
    out = levels[0][1].copy()
    for (d0, a), (d1, b) in zip(levels, levels[1:]):
        t = np.clip((softness_distance - d0) / (d1 - d0), 0, 1)[..., None]
        out = np.where((softness_distance >= d0)[..., None], a * (1 - t) + b * t, out)

    if haze > 0:
        tone = poster.reshape(-1, 3).mean(axis=0)
        h = smoothstep(0, 700 * unit, distance)[..., None] * haze
        out = out * (1 - h) + tone * h
    # Below the poster the ground falls away into shadow.
    below = CANVAS_H - POSTER_Y - POSTER_H
    out = out * (1 - 0.62 * smoothstep(0, below * 0.8, dy_below))[:, None, None]

    out[POSTER_Y:POSTER_Y + POSTER_H, POSTER_X:POSTER_X + POSTER_W] = poster
    return to_image(out)


def pingpong(i: np.ndarray, n: int) -> np.ndarray:
    i = np.mod(i, 2 * n)
    return np.where(i >= n, 2 * n - 1 - i, i)


def sky_keep_mask() -> np.ndarray:
    """Where the sky must not move: the sun's core and everything near the
    horizon (domes, terrain). Poster-sized, 1 = keep in the static base."""
    ys = (np.arange(POSTER_H, dtype=np.float32) / POSTER_H)[:, None]
    xs = (np.arange(POSTER_W, dtype=np.float32) / POSTER_W)[None, :]
    horizon = smoothstep(0.58, 0.66, ys) * np.ones_like(xs)
    aspect = POSTER_H / POSTER_W
    sun = 1 - smoothstep(0.06, 0.16, np.sqrt((xs - 0.98) ** 2 + ((ys - 0.60) * aspect) ** 2))
    return np.maximum(horizon, sun)


def unmix(top: np.ndarray, under: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Colour and alpha that, drawn over `under`, give `top`."""
    eps = 1e-4
    up = (top - under) / np.maximum(1 - under, eps)
    down = (under - top) / np.maximum(under, eps)
    need = np.where(top > under, up, down).max(axis=-1)
    alpha = np.clip(need * 2.5, 0, 1)
    safe = np.maximum(alpha, eps)[..., None]
    colour = np.clip((top - (1 - alpha[..., None]) * under) / safe, 0, 1)
    return colour, alpha


def split_sky_bands(alpha: np.ndarray) -> dict[str, np.ndarray]:
    """Divide cloud alpha between the mid (upper), near (middle) and far
    (horizon) layers. Drawn in the app's order (far, mid, near) with one
    colour, the three give back `alpha` exactly."""
    detail = alpha.mean(axis=1)
    ys = np.arange(POSTER_H, dtype=np.float32) / POSTER_H
    cuts = []
    for lo, hi in SKY_BAND_RANGES:
        rows = np.arange(round(lo * POSTER_H), round(hi * POSTER_H))
        cuts.append(float(rows[np.argmin(detail[rows])]) / POSTER_H)
    print(f"sky bands meet at y {cuts[0]:.3f} and {cuts[1]:.3f}")
    upper = 1 - smoothstep(cuts[0] - SKY_BAND_SOFTNESS, cuts[0] + SKY_BAND_SOFTNESS, ys)
    horizon = smoothstep(cuts[1] - SKY_BAND_SOFTNESS, cuts[1] + SKY_BAND_SOFTNESS, ys)
    middle = 1 - upper - horizon
    w_far, w_mid, w_near = (w[:, None] for w in (horizon, upper, middle))
    a_far = alpha * w_far
    a_far_mid = alpha * (w_far + w_mid)
    a_mid = (a_far_mid - a_far) / np.maximum(1 - a_far, 1e-4)
    a_near = (alpha - a_far_mid) / np.maximum(1 - a_far_mid, 1e-4)
    return {"clouds-far": a_far, "clouds-mid": a_mid, "clouds-near": np.clip(a_near, 0, 1)}


def cloud_tile(colour: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A seamless TILE_W x TILE_H cloud tile from a poster-sized layer. Its left
    edge sits at CLOUD_X on the canvas; past the poster the layer continues as
    its mirror, and the last stretch fades into what lies left of the start."""
    premult = np.concatenate([colour * alpha[..., None], alpha[..., None]], axis=-1)
    rows = pingpong(np.arange(TILE_H) - POSTER_Y, POSTER_H)

    def columns(offsets: np.ndarray) -> np.ndarray:
        return premult[rows][:, pingpong(CLOUD_X - POSTER_X + offsets, POSTER_W)]

    offsets = np.arange(TILE_W)
    tile = columns(offsets)
    overlap = round(TILE_W * 0.3)
    start = TILE_W - overlap
    t = smoothstep(0, 1, np.linspace(0, 1, overlap, dtype=np.float32))[None, :, None]
    tile[:, start:] = tile[:, start:] * (1 - t) + columns(offsets[start:] - TILE_W) * t
    a = tile[..., 3]
    return tile[..., :3] / np.maximum(a, 1e-4)[..., None], a


def band_alpha(height: int, origin: int, top: float, bottom: float, feather: float, opacity: float = 1.0) -> np.ndarray:
    """Vertical alpha band, positions given as poster fractions."""
    p = (np.arange(height, dtype=np.float32) - origin) / POSTER_H
    rise = np.clip((p - top) / feather + 0.5, 0, 1) if top > 0 else np.ones_like(p)
    fall = np.clip((bottom - p) / feather + 0.5, 0, 1) if bottom < 1 else np.ones_like(p)
    return np.minimum(rise, fall) * opacity


def save_rgba(rgb: np.ndarray, alpha: np.ndarray, name: str) -> None:
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)[..., None]], axis=-1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8)).save(OUT / f"{name}.png", optimize=True)


def cut_against_sky(reference: np.ndarray, sky: np.ndarray, region: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Alpha from the difference to the clean sky; colour un-mixed from it."""
    diff = np.abs(reference - sky).max(axis=-1)
    alpha = np.clip((diff - 0.035) / 0.09, 0, 1)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6 * K)),
                       dtype=np.float32) / 255.0
    alpha = alpha * region
    safe = np.maximum(alpha, 1e-3)[..., None]
    colour = (reference - (1 - alpha[..., None]) * sky) / safe
    return np.clip(colour, 0, 1), alpha


SHIP_EXTENSION = 0.25
SHIP_LIGHT_COUNT = 16


def running_lights(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """A light mask for the ship: the most light-like small bright points on
    its underside (bright against their surroundings), as soft round dots.
    The hull's top plate is left out so it never pulses."""
    lum = rgb.mean(axis=-1)
    tophat = lum - blur(lum[..., None], 3 * K)[..., 0]
    # Away from the top edge: the pixel a few rows above must be hull too.
    shift = round(6 * K)
    below_top = np.zeros_like(alpha)
    below_top[shift:] = alpha[:-shift]
    score = np.where((alpha > 0.9) & (below_top > 0.9) & (lum > 0.55), tophat, 0)
    yy, xx = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]].astype(np.float32)
    lights = np.zeros_like(alpha)
    radius = 14 * K
    for _ in range(SHIP_LIGHT_COUNT):
        y, x = np.unravel_index(int(np.argmax(score)), score.shape)
        if score[y, x] < 0.05:
            break
        d2 = (yy - y) ** 2 + (xx - x) ** 2
        lights = np.maximum(lights, np.exp(-d2 / (2 * (1.3 * K) ** 2)))
        score[d2 < radius ** 2] = 0
    return lights


def feathered_region(x0: int, y0: int, x1: int, y1: int, keep_left: bool = False) -> np.ndarray:
    """A cut-out box whose inside fades to nothing at its border."""
    margin = max(2, round(4 * K))
    region = np.zeros((POSTER_H, POSTER_W), np.float32)
    region[y0 + margin:y1 - margin, (x0 if keep_left else x0 + margin):x1 - margin] = 1.0
    region = np.asarray(
        Image.fromarray((region * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(margin / 2)), np.float32
    ) / 255.0
    if keep_left:
        region[y0 + margin:y1 - margin, x0:x0 + margin] = 1.0
    return region


def extend_wings(rgb: np.ndarray, alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Continue each wing past the poster edge as a straight plate: the hull's
    outermost columns are extruded outward, sharp where they join the wing and
    softening and fading as they disappear into the haze."""
    h, w, _ = rgb.shape
    ext = round(w * SHIP_EXTENSION)
    edge_cols = max(2, round(w * 0.004))
    ramp = np.linspace(0, 1, ext, dtype=np.float32)
    fade = (1 - smoothstep(0.0, 1.0, ramp))[None, :]

    def continue_side(rgb_edge: np.ndarray, a_edge: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        premult = (rgb_edge * a_edge[..., None]).mean(axis=1, keepdims=True)
        a = a_edge.mean(axis=1, keepdims=True)
        colour = premult / np.maximum(a, 1e-4)[..., None]
        out_rgb = np.repeat(colour, ext, axis=1)
        out_a = np.repeat(a, ext, axis=1)
        # Soften with distance: blur the plate and its outline more further out.
        soft_rgb = blur(out_rgb, 2.5 * K)
        soft_a = blur(out_a[..., None], 2.5 * K)[..., 0]
        mix = smoothstep(0.0, 0.6, ramp)[None, :]
        out_rgb = out_rgb * (1 - mix[..., None]) + soft_rgb * mix[..., None]
        out_a = out_a * (1 - mix) + soft_a * mix
        return out_rgb, out_a * fade

    left_rgb, left_a = continue_side(rgb[:, :edge_cols], alpha[:, :edge_cols])
    right_rgb, right_a = continue_side(rgb[:, w - edge_cols:], alpha[:, w - edge_cols:])
    full_rgb = np.concatenate([left_rgb[:, ::-1], rgb, right_rgb], axis=1)
    full_a = np.concatenate([left_a[:, ::-1], alpha, right_a], axis=1)
    return full_rgb, full_a


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    reference = clean_reference()
    sky = clean_sky(reference)

    holes = np.maximum(box_mask(BEAM_GROUND_BOX), box_mask(WRECK_BOX))
    sky_margins = push_pull(sky, (holes < 0.5).astype(np.float32))
    unit = POSTER_W / 1080
    keep = sky_keep_mask()[..., None]

    def soften(image: np.ndarray, radius: float) -> np.ndarray:
        return blur(image, radius * unit) * (1 - keep) + image * keep

    sky_base = soften(sky, SKY_BASE_SCALE)
    sky_canvas = extend_canvas(sky_base, soften(sky_margins, SKY_BASE_SCALE), haze=0.3)
    sky_canvas.save(OUT / "sky-base.png", optimize=True)

    # The wreck lives only in its own layer: it is painted out of the terrain,
    # which is what the terrain and grass bands are cut from.
    terrain = push_pull(reference, (box_mask(WRECK_BOX) < 0.5).astype(np.float32))

    # Terrain margins come from the terrain with the domes painted out.
    terrain_margins = terrain.copy()
    for box in (DOME_LEFT_BOX, DOME_RIGHT_BOX):
        mask = box_mask(box, feather=2)[..., None]
        terrain_margins = terrain_margins * (1 - mask) + sky * mask
    # ...and with the beam's glow on the terrain filled in from either side.
    # The wreck is removed from the margins the same way.
    holes = np.maximum(box_mask(BEAM_GROUND_BOX), box_mask(WRECK_BOX))
    terrain_margins = push_pull(terrain_margins, (holes < 0.5).astype(np.float32))
    ref_canvas = to_array(extend_canvas(terrain, terrain_margins))
    distance, _ = poster_distance()
    margin_fade = 1 - smoothstep(0, BAND_MARGIN_FADE * POSTER_W / 1080, distance)
    # The grass bands overlap the water band. Where they show pale water they
    # are left transparent, so the water layer beneath (the same pixels) shows
    # through and its shimmer and beam reflection are visible.
    water_top, water_bottom, water_feather = BANDS["water"]
    water_band = band_alpha(CANVAS_H, POSTER_Y, water_top, water_bottom, water_feather)[:, None]
    pale_water = water_band * smoothstep(WATER_PALE[0], WATER_PALE[1], luminance(ref_canvas))
    for name, (top, bottom, feather) in BANDS.items():
        alpha = band_alpha(CANVAS_H, POSTER_Y, top, bottom, feather)[:, None] * margin_fade
        if name.startswith("grass"):
            alpha = alpha * (1 - pale_water)
        save_rgba(ref_canvas, alpha, name)

    # Clouds: everything the base lacks, divided between three height bands.
    # Tiles keep the canvas's pixel scale; their left edge is
    # config.layers.clouds.originX (896 at 4K, times SCALE here).
    colour, alpha = unmix(sky, sky_base)
    for name, band_alpha_map in split_sky_bands(alpha).items():
        save_rgba(*cloud_tile(colour, band_alpha_map), name)

    # Ship: the traced outline, feathered by a pixel. The wings run off both
    # edges of the poster, so they are continued outward and dissolve into the
    # haze over SHIP_EXTENSION of the poster width on each side.
    ship_alpha = np.maximum(poly_mask(SHIP_LEFT, feather=0.4), poly_mask(SHIP_RIGHT, feather=0.4))
    x0, y0, x1, y1 = frac_box(OBJECTS["ship"])
    ship_rgb, ship_a = extend_wings(reference[y0:y1, x0:x1], ship_alpha[y0:y1, x0:x1])
    save_rgba(ship_rgb, ship_a, "ship")
    lights = running_lights(reference[y0:y1, x0:x1], ship_alpha[y0:y1, x0:x1])
    pad = (ship_rgb.shape[1] - lights.shape[1]) // 2
    lights = np.pad(lights, ((0, 0), (pad, ship_rgb.shape[1] - lights.shape[1] - pad)))
    save_rgba(np.ones_like(ship_rgb), lights, "ship-lights")

    # The left dome is cut by the poster's left edge. It is completed as a
    # symmetric dome around the middle of its flat top, which keeps the visible
    # part exactly as it is.
    x0, y0, x1, y1 = frac_box(OBJECTS["dome-left"])
    region = feathered_region(x0, y0, x1, y1, keep_left=True)
    colour, alpha = cut_against_sky(reference, sky, region)
    colour, alpha = colour[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    solid = alpha > 0.5
    tops = np.where(solid.any(axis=0), solid.argmax(axis=0), alpha.shape[0])
    highest = tops.min()
    flat = np.where(tops <= highest + max(2, round(0.004 * POSTER_H)))[0]
    centre = int(flat.mean())
    right_rgb, right_a = colour[:, centre:], alpha[:, centre:]
    dome_rgb = np.concatenate([right_rgb[:, ::-1], right_rgb], axis=1)
    dome_a = np.concatenate([right_a[:, ::-1], right_a], axis=1)
    save_rgba(dome_rgb, dome_a, "dome-left")
    left_edge = (x0 + centre - right_rgb.shape[1]) / POSTER_W
    print(f"dome-left placement: x {left_edge:.4f}, width {dome_rgb.shape[1] / POSTER_W:.4f}")

    for name in ("dome-right", "aircraft"):
        x0, y0, x1, y1 = frac_box(OBJECTS[name])
        region = feathered_region(x0, y0, x1, y1)
        colour, alpha = cut_against_sky(reference, sky, region)
        save_rgba(colour[y0:y1, x0:x1], alpha[y0:y1, x0:x1], name)

    # The wreck: cut against the terrain it was painted out of. It runs off the
    # poster's left edge, so it fades into the haze over its leftmost part.
    x0, y0, x1, y1 = frac_box(OBJECTS["wreck"])
    colour, alpha = cut_against_sky(reference, terrain, feathered_region(x0, y0, x1, y1, keep_left=True))
    colour, alpha = colour[y0:y1, x0:x1], alpha[y0:y1, x0:x1]
    alpha = alpha * smoothstep(0, 0.22, np.linspace(0, 1, alpha.shape[1], dtype=np.float32))[None, :]
    save_rgba(colour, alpha, "wreck")

    # Flowers: warm, bright specks in the grass band.
    r, g, b = ref_canvas[..., 0], ref_canvas[..., 1], ref_canvas[..., 2]
    warm = np.clip((r - b - 0.27) / 0.1, 0, 1) * np.clip((r - 0.59) / 0.1, 0, 1)
    warm *= band_alpha(CANVAS_H, POSTER_Y, 0.87, 1.0, 0.01)[:, None] * margin_fade
    save_rgba(ref_canvas, warm, "flowers")

    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as image:
            print(f"{path.name:22} {image.width} x {image.height}")


if __name__ == "__main__":
    main()
