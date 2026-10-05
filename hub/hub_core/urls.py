"""The hub's own list of web addresses.

Every URL written in hub.py is recorded when hub.py is loaded. After that the
list is sealed: an address built at run time (for example from text an API
returned) is refused, so the interface only ever opens addresses you defined.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse

log = logging.getLogger("hub")


class UrlRegistry:
    def __init__(self) -> None:
        self._allowed: set[str] = set()
        self._sealed = False

    def register(self, url: str) -> None:
        if urlparse(url).scheme not in ("https", "http"):
            raise ValueError(f"Only http and https addresses are allowed: {url!r}")
        if self._sealed:
            # Recorded as refused; is_allowed() will reject it at dispatch.
            return
        self._allowed.add(url)

    def allow(self, url: str) -> None:
        """Explicitly allow an address that hub.py builds at run time."""
        self._allowed.add(url)

    def seal(self) -> None:
        self._sealed = True

    def is_allowed(self, url: str) -> bool:
        if url in self._allowed:
            return True
        log.warning("Refused an address that is not defined in hub.py: %s", url)
        return False


url_registry = UrlRegistry()
