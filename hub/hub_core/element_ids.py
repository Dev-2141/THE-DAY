"""Reads the element ID list from src/hub/elementIds.ts, the single source of truth.

Used only to warn about typos in hub.py. When the TypeScript file is not
present (a packaged hub), validation is skipped.
"""

from __future__ import annotations

import re
from pathlib import Path

_IDS_FILE = Path(__file__).resolve().parents[2] / "src" / "hub" / "elementIds.ts"
_BLOCK = re.compile(r"export const (\w+) = \[(.*?)\] as const;", re.S)
_ITEM = re.compile(r"'([^']+)'")


def _read_lists() -> dict[str, frozenset[str]]:
    try:
        source = _IDS_FILE.read_text(encoding="utf-8")
    except OSError:
        return {}
    lists: dict[str, frozenset[str]] = {}
    for name, body in _BLOCK.findall(source):
        # Ignore comment lines inside the list.
        lines = (line.split("//", 1)[0] for line in body.splitlines())
        lists[name] = frozenset(_ITEM.findall("\n".join(lines)))
    return lists


_lists = _read_lists()
ELEMENT_IDS: frozenset[str] | None = _lists.get("ELEMENT_IDS")
HUB_EVENTS: frozenset[str] | None = _lists.get("HUB_EVENTS")
