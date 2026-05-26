from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Observation:
    timestamp: str
    active_window_title: str
    active_process: str
    ocr_text: str = ""
    summary: str = ""
    blocked: bool = False
    source: str = "local"
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def now(cls, active_window_title: str, active_process: str, **kwargs: Any) -> "Observation":
        return cls(
            timestamp=datetime.now().astimezone().isoformat(timespec="seconds"),
            active_window_title=active_window_title,
            active_process=active_process,
            **kwargs,
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
