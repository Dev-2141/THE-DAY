"""Exports the declarative connections in hub.py to public/hub.json.

    npm run hub:export        (also runs as part of `npm run build`)

The Android app runs these directly, with no Python. Connections that need
Python (custom functions, API calls with secret keys) are exported as
{"type": "remote"} and listed at the end, so you know which ones need the
hub running on a server address set in config.hub.remoteUrl.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from hub_core import hub  # noqa: E402

OUTPUT = HERE.parent / "public" / "hub.json"


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[hub] %(message)s")
    import hub as _connections  # noqa: E402,F401  registers every connection

    data = hub.export()
    needs_server = data.pop("needs_server")
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(HERE.parent)}")
    if needs_server:
        print("These connections need the hub on a server to work on Android:")
        for line in needs_server:
            print(f"  - {line}")
    else:
        print("Every connection works on Android without a server.")


if __name__ == "__main__":
    main()
