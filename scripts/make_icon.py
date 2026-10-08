"""Makes a temporary app icon from the reference art until you supply your own.

    python scripts/make_icon.py

Writes art/app-icon.png (1024 x 1024, no transparency): the ship, the light
beams and the title, cropped from the reference so it stops just above the
time line. Replace art/app-icon.png with your own artwork, then run
`npx tauri icon art/app-icon.png` to regenerate every platform's icons.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "reference-x4.png"
TARGET = ROOT / "art" / "app-icon.png"
FAVICON = ROOT / "public" / "favicon.png"

# As fractions of the reference: horizontal centre of the title, and the
# top of the time line, which the crop must not reach.
CENTER_X = 0.489
TIME_TOP = 0.369


def main() -> None:
    with Image.open(SOURCE) as reference:
        width, height = reference.size
        side = int(TIME_TOP * height)
        left = int(CENTER_X * width - side / 2)
        icon = reference.convert("RGB").crop((left, 0, left + side, side)).resize((1024, 1024), Image.LANCZOS)
    icon.save(TARGET)
    icon.resize((64, 64), Image.LANCZOS).save(FAVICON)
    print(f"Wrote {TARGET.relative_to(ROOT)} and {FAVICON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
