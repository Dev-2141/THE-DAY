"""Makes the smaller texture sets for the medium and low quality levels.

    npm run assets:textures        (also runs as part of `npm run build`)

For every image in public/assets/layers/ it writes a compressed WebP copy at
half size to layers/medium/ and at a third of the size to layers/low/. The
app loads these on the lower quality levels (a quarter and a ninth of the
GPU memory of the full set) and falls back to the original image if a copy
is missing. A copy is only remade when its source image is newer, so after
replacing a layer just run the command again (or build).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

LAYERS = Path(__file__).resolve().parents[1] / "public" / "assets" / "layers"
SETS = {"medium": 0.5, "low": 1 / 3}
QUALITY = 86


def make(source: Path, set_name: str, scale: float) -> bool:
    target = LAYERS / set_name / f"{source.stem}.webp"
    if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
        return False
    target.parent.mkdir(exist_ok=True)
    with Image.open(source) as image:
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        small = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB").resize(size, Image.LANCZOS)
        small.save(target, "WEBP", quality=QUALITY, method=6, exact=True)
    return True


def main() -> None:
    sources = sorted(LAYERS.glob("*.png"))
    if not sources:
        sys.exit(f"No layer images found in {LAYERS}")
    made = 0
    for source in sources:
        for set_name, scale in SETS.items():
            made += make(source, set_name, scale)
    print(f"Texture sets up to date ({made} copies made) in {LAYERS.relative_to(LAYERS.parents[2])}/medium and /low")


if __name__ == "__main__":
    main()
