"""AI-upscales the reference 4x with Real-ESRGAN (x4plus, GPU via Vulkan).

    npm run assets:enhance        (needs: pip install realesrgan-ncnn-py)

Writes art/reference-x4.png, which `npm run assets:temp` cuts the temporary
layers from. The 455 x 674 reference is too small to show full screen; the
upscale removes its JPEG blocking and restores clean edges. This only
improves the stand-in art: the real layers should still be supplied at the
sizes in ASSETS.md.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "reference" / "reference.png"
OUTPUT = ROOT / "art" / "reference-x4.png"


def main() -> None:
    try:
        from realesrgan_ncnn_py import Realesrgan
    except ImportError:
        sys.exit("Real-ESRGAN is not installed. Run: pip install realesrgan-ncnn-py")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    # Model 4 is realesrgan-x4plus, the general photographic model.
    # Test-time augmentation averages 8 passes for a cleaner result.
    upscaled = Realesrgan(gpuid=0, tta_mode=True, model=4).process_pil(source)
    upscaled.save(OUTPUT)
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({upscaled.width} x {upscaled.height})", flush=True)
    # The ncnn GPU runtime can crash while shutting down; the file is already
    # written, so leave without running its teardown.
    os._exit(0)


if __name__ == "__main__":
    main()
