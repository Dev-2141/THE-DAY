"""Fetches the Python that ships inside the Windows app.

    npm run python:fetch        (also runs before every Windows build)

Downloads the official embeddable Python for Windows from python.org (a
self-contained, about 11 MB build that needs no installation), checks it
against a pinned SHA-256 (python.org also publishes its MD5,
6d9aa08531d48fcc261ba667e2df17c4), and unpacks it to src-tauri/python/.
The installer and the portable build then run hub/server.py with it, so
nobody needs Python installed to use the app. The hub only uses Python's
standard library, which the embeddable build includes.

Nothing is downloaded if the folder is already in place.
"""

from __future__ import annotations

import hashlib
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

VERSION = "3.11.9"
URL = f"https://www.python.org/ftp/python/{VERSION}/python-{VERSION}-embed-amd64.zip"
SHA256 = "009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b"
TARGET = Path(__file__).resolve().parents[1] / "src-tauri" / "python"


def main() -> None:
    if (TARGET / "python.exe").is_file():
        print(f"Bundled Python already in {TARGET.relative_to(TARGET.parents[1])}")
        return
    print(f"Downloading {URL}")
    with urllib.request.urlopen(URL, timeout=120) as response:
        data = response.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != SHA256:
        sys.exit(f"Checksum mismatch for {URL}: got {digest}, expected {SHA256}. Not using it.")
    TARGET.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        archive.extractall(TARGET)
    print(f"Unpacked Python {VERSION} to {TARGET.relative_to(TARGET.parents[1])}")


if __name__ == "__main__":
    main()
