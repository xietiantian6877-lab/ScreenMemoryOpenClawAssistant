from __future__ import annotations

import socket
from dataclasses import dataclass

import requests

from .config import TunnelConfig
from .memory import MemoryWrite
from .models import Observation


@dataclass(frozen=True)
class MemorySyncResult:
    ok: bool
    message: str


class MemoryTunnelClient:
    def __init__(self, config: TunnelConfig) -> None:
        self.config = config

    @property
    def enabled(self) -> bool:
        return bool(self.config.base_url)

    def sync_write(self, write: MemoryWrite, observation: Observation | None = None) -> MemorySyncResult:
        if not self.enabled:
            return MemorySyncResult(ok=False, message="记忆隧穿：未填写地址")

        payload = {
            "client": {"hostname": socket.gethostname()},
            "date": write.day,
            "latest_observation": observation.to_dict() if observation else None,
            "latest_json_line": write.json_line,
            "latest_markdown_line": write.markdown_line,
            "files": [
                {
                    "name": write.md_path.name,
                    "kind": "markdown",
                    "content": _read_text(write.md_path),
                },
                {
                    "name": write.jsonl_path.name,
                    "kind": "jsonl",
                    "content": _read_text(write.jsonl_path),
                },
            ],
        }
        try:
            response = self._post(self.config.memory_endpoint, payload)
            if response.status_code == 404 and self.config.memory_endpoint != "/memory":
                response = self._post("/memory", payload)
            response.raise_for_status()
            return MemorySyncResult(ok=True, message=f"记忆隧穿：已同步 {write.day}")
        except Exception as exc:
            return MemorySyncResult(ok=False, message=f"记忆隧穿：同步失败：{exc}")

    def _post(self, endpoint: str, payload: dict) -> requests.Response:
        endpoint = endpoint if endpoint.startswith("/") else f"/{endpoint}"
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return requests.post(
            f"{self.config.base_url}{endpoint}",
            json=payload,
            headers=headers,
            timeout=self.config.timeout_seconds,
        )


def _read_text(path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""
