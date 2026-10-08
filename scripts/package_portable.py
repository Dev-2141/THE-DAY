"""Packs the portable Windows build after `tauri build`.

    npm run windows:build        (tauri build, then this script)

Writes release/THE-DAY-<version>-portable-x64.zip: one folder holding
THE DAY.exe, the hub (hub/hub.py stays editable) and the bundled Python.
Unzip it anywhere and run THE DAY.exe; nothing is installed. The installer
from the same build is copied to release/ too.
"""

from __future__ import annotations

import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAURI = ROOT / "src-tauri"
RELEASE = ROOT / "release"

README = """THE DAY {version} (portable)

Run "THE DAY.exe". Nothing is installed; delete this folder to remove it.
Settings are kept for your Windows user in %LOCALAPPDATA%\\dev.theday.app.

hub\\hub.py decides what every button does. Edit it with any text editor and
restart the app to apply the change. Put API keys in hub\\.env (see the
project README).

Needs the Microsoft Edge WebView2 Runtime, which Windows 10 and 11 include.
F11 toggles full screen, Escape leaves it.
"""


def main() -> None:
    version = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    exe = TAURI / "target" / "release" / "the-day.exe"
    python = TAURI / "python"
    if not exe.is_file():
        sys.exit(f"{exe} not found: run `npm run tauri build` first.")
    if not (python / "python.exe").is_file():
        sys.exit(f"{python} not found: run `npm run python:fetch` first.")

    RELEASE.mkdir(exist_ok=True)
    folder = "THE DAY"
    target = RELEASE / f"THE-DAY-{version}-portable-x64.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(exe, f"{folder}/THE DAY.exe")
        for source in [ROOT / "hub" / "server.py", ROOT / "hub" / "hub.py", *sorted((ROOT / "hub" / "hub_core").glob("*.py"))]:
            archive.write(source, f"{folder}/{source.relative_to(ROOT).as_posix()}")
        archive.write(ROOT / "hub" / ".env.example", f"{folder}/hub/.env.example")
        for source in sorted(python.iterdir()):
            archive.write(source, f"{folder}/python/{source.name}")
        archive.writestr(f"{folder}/README.txt", README.format(version=version))
    print(f"Wrote {target.relative_to(ROOT)} ({target.stat().st_size / 1e6:.1f} MB)")

    for installer in (TAURI / "target" / "release" / "bundle" / "nsis").glob(f"*_{version}_*-setup.exe"):
        shutil.copy2(installer, RELEASE / installer.name)
        print(f"Copied {installer.name} to release/ ({installer.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
