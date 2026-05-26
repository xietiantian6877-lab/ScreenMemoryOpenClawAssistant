from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .models import Observation


@dataclass(frozen=True)
class MemoryWrite:
    day: str
    jsonl_path: Path
    md_path: Path
    json_line: str = ""
    markdown_line: str = ""


class DailyMemory:
    def __init__(self, memory_dir: Path) -> None:
        self.memory_dir = memory_dir
        self.memory_dir.mkdir(parents=True, exist_ok=True)

    def append(self, observation: Observation) -> MemoryWrite:
        day = datetime.fromisoformat(observation.timestamp).date().isoformat()
        jsonl_path = self.memory_dir / f"{day}.jsonl"
        md_path = self.memory_dir / f"{day}.md"
        json_line = json.dumps(observation.to_dict(), ensure_ascii=False)

        with jsonl_path.open("a", encoding="utf-8") as handle:
            handle.write(json_line + "\n")

        if not md_path.exists():
            md_path.write_text(f"# {day} 电脑记忆\n\n", encoding="utf-8")

        time_part = observation.timestamp[11:19]
        title = observation.active_window_title or "未知窗口"
        process = observation.active_process or "未知进程"
        summary = observation.summary or "正在观察，暂未形成摘要。"
        blocked = "，可能遇到阻碍" if observation.blocked else ""
        markdown_line = f"- {time_part} [{process}] {title}: {summary}{blocked}"
        with md_path.open("a", encoding="utf-8") as handle:
            handle.write(markdown_line + "\n")
        return MemoryWrite(day=day, jsonl_path=jsonl_path, md_path=md_path, json_line=json_line, markdown_line=markdown_line)

    def append_chat(self, user_text: str, assistant_text: str) -> MemoryWrite:
        now = datetime.now().astimezone()
        day = now.date().isoformat()
        jsonl_path = self.memory_dir / f"{day}.jsonl"
        md_path = self.memory_dir / f"{day}.md"
        payload = {
            "timestamp": now.isoformat(timespec="seconds"),
            "type": "chat",
            "user_text": user_text,
            "assistant_text": assistant_text,
        }
        json_line = json.dumps(payload, ensure_ascii=False)
        with jsonl_path.open("a", encoding="utf-8") as handle:
            handle.write(json_line + "\n")
        if not md_path.exists():
            md_path.write_text(f"# {day} 电脑记忆\n\n", encoding="utf-8")
        markdown_line = f"- {now.strftime('%H:%M:%S')} 对话: 你说「{user_text}」；助手回应「{assistant_text}」"
        with md_path.open("a", encoding="utf-8") as handle:
            handle.write(markdown_line + "\n")
        return MemoryWrite(day=day, jsonl_path=jsonl_path, md_path=md_path, json_line=json_line, markdown_line=markdown_line)

    def today_snapshot(self) -> MemoryWrite:
        now = datetime.now().astimezone()
        day = now.date().isoformat()
        jsonl_path = self.memory_dir / f"{day}.jsonl"
        md_path = self.memory_dir / f"{day}.md"
        jsonl_path.touch(exist_ok=True)
        if not md_path.exists():
            md_path.write_text(f"# {day} 电脑记忆\n\n", encoding="utf-8")
        return MemoryWrite(day=day, jsonl_path=jsonl_path, md_path=md_path)
