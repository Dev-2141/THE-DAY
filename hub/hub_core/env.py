"""Loads hub/.env (API keys and other secrets). The file is never committed and
never bundled into the Android build."""

from __future__ import annotations

import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def load_env(path: Path = ENV_FILE) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def secret(name: str) -> str:
    value = os.environ.get(name)
    if value is None:
        raise KeyError(f"{name} is not set in hub/.env")
    return value
