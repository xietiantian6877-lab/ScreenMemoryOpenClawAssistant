from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests

from .config import OpenClawConfig
from .models import Observation


@dataclass
class OpenClawResult:
    summary: str
    blocked: bool = False
    message: str = ""
    source: str = "local"


class OpenClawClient:
    def __init__(self, config: OpenClawConfig) -> None:
        self.config = config

    @property
    def enabled(self) -> bool:
        return bool(self.config.base_url)

    def observe(self, payload: dict[str, Any]) -> OpenClawResult:
        if not self.enabled:
            return local_observe(payload)

        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        try:
            response = requests.post(
                f"{self.config.base_url}/observe",
                json=payload,
                headers=headers,
                timeout=self.config.timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            return OpenClawResult(
                summary=str(data.get("summary", "")),
                blocked=bool(data.get("blocked", False)),
                message=str(data.get("message", "")),
                source="openclaw",
            )
        except Exception as exc:
            result = local_observe(payload)
            result.message = f"OpenClaw 暂不可用，已使用本地判断：{exc}"
            return result

    def chat(self, text: str, last_observation: Observation | None) -> str:
        if not self.enabled:
            return "我先把这条反馈写进今天的记忆里。OpenClaw 接上后，这里会返回它的建议。"

        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        payload = {
            "message": text,
            "last_observation": last_observation.to_dict() if last_observation else None,
        }
        try:
            response = requests.post(
                f"{self.config.base_url}/chat",
                json=payload,
                headers=headers,
                timeout=self.config.timeout_seconds,
            )
            response.raise_for_status()
            data = response.json()
            return str(data.get("reply", "OpenClaw 已收到。"))
        except Exception as exc:
            return f"OpenClaw 暂时没有响应，我已记录你的输入。错误：{exc}"


def local_observe(payload: dict[str, Any]) -> OpenClawResult:
    title = str(payload.get("active_window_title", ""))
    process = str(payload.get("active_process", ""))
    ocr_text = str(payload.get("ocr_text", ""))
    same_context_minutes = float(payload.get("same_context_minutes", 0))

    text_for_check = f"{title} {ocr_text}".lower()
    blocked_keywords = ["error", "failed", "exception", "traceback", "错误", "失败", "无法", "卡住", "blocked"]
    blocked = same_context_minutes >= 6 or any(word in text_for_check for word in blocked_keywords)

    if title:
        summary = f"你大概率正在使用 {process or '某个程序'}，当前窗口是「{title}」。"
    else:
        summary = "当前没有识别到明确的活动窗口。"

    message = "看起来你可能停在同一个上下文里一段时间了，要不要说说卡在哪里？" if blocked else ""
    return OpenClawResult(summary=summary, blocked=blocked, message=message)
