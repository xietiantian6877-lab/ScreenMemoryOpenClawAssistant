from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AssistantConfig:
    observe_interval_seconds: int = 20
    notify_interval_minutes: int = 15
    blocked_check_minutes: int = 6
    memory_dir: Path = Path("data/memory")
    language: str = "zh-CN"


@dataclass(frozen=True)
class ScreenConfig:
    enable_screenshot: bool = True
    enable_ocr: bool = False
    ocr_max_chars: int = 1200


@dataclass(frozen=True)
class OpenClawConfig:
    base_url: str = ""
    api_key: str = ""
    timeout_seconds: int = 12


@dataclass(frozen=True)
class TunnelConfig:
    base_url: str = ""
    api_key: str = ""
    memory_endpoint: str = "/memory/sync"
    timeout_seconds: int = 12


@dataclass(frozen=True)
class PrivacyConfig:
    store_screenshots: bool = False
    redact_window_titles: bool = False


@dataclass(frozen=True)
class AppConfig:
    root_dir: Path
    assistant: AssistantConfig
    screen: ScreenConfig
    openclaw: OpenClawConfig
    tunnel: TunnelConfig
    privacy: PrivacyConfig


def load_config(root_dir: Path | None = None) -> AppConfig:
    root = root_dir or Path.cwd()
    config_path = root / "config.toml"
    raw = {}
    if config_path.exists():
        raw = tomllib.loads(config_path.read_text(encoding="utf-8"))

    assistant_raw = raw.get("assistant", {})
    tunnel_raw = raw.get("tunnel", {})
    screen_raw = raw.get("screen", {})
    openclaw_raw = raw.get("openclaw", {})
    privacy_raw = raw.get("privacy", {})

    memory_dir = Path(assistant_raw.get("memory_dir", "data/memory"))
    if not memory_dir.is_absolute():
        memory_dir = root / memory_dir

    base_url = os.getenv(
        "TUNNEL_BASE_URL",
        os.getenv("OPENCLAW_BASE_URL", tunnel_raw.get("base_url") or openclaw_raw.get("base_url", "")),
    ).strip()
    api_key = os.getenv(
        "TUNNEL_API_KEY",
        os.getenv("OPENCLAW_API_KEY", tunnel_raw.get("api_key") or openclaw_raw.get("api_key", "")),
    ).strip()
    timeout_seconds = int(tunnel_raw.get("timeout_seconds", openclaw_raw.get("timeout_seconds", 12)))

    return AppConfig(
        root_dir=root,
        assistant=AssistantConfig(
            observe_interval_seconds=int(assistant_raw.get("observe_interval_seconds", 20)),
            notify_interval_minutes=int(assistant_raw.get("notify_interval_minutes", 15)),
            blocked_check_minutes=int(assistant_raw.get("blocked_check_minutes", 6)),
            memory_dir=memory_dir,
            language=str(assistant_raw.get("language", "zh-CN")),
        ),
        screen=ScreenConfig(
            enable_screenshot=bool(screen_raw.get("enable_screenshot", True)),
            enable_ocr=bool(screen_raw.get("enable_ocr", False)),
            ocr_max_chars=int(screen_raw.get("ocr_max_chars", 1200)),
        ),
        openclaw=OpenClawConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            timeout_seconds=timeout_seconds,
        ),
        tunnel=TunnelConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            memory_endpoint=str(tunnel_raw.get("memory_endpoint", "/memory/sync")),
            timeout_seconds=timeout_seconds,
        ),
        privacy=PrivacyConfig(
            store_screenshots=bool(privacy_raw.get("store_screenshots", False)),
            redact_window_titles=bool(privacy_raw.get("redact_window_titles", False)),
        ),
    )


def save_tunnel_address(config: AppConfig, base_url: str) -> None:
    base_url = base_url.strip().rstrip("/")
    memory_dir = _to_config_path(config.root_dir, config.assistant.memory_dir)
    content = f"""[assistant]
observe_interval_seconds = {config.assistant.observe_interval_seconds}
notify_interval_minutes = {config.assistant.notify_interval_minutes}
blocked_check_minutes = {config.assistant.blocked_check_minutes}
memory_dir = "{memory_dir}"
language = "{config.assistant.language}"

[tunnel]
base_url = "{base_url}"
api_key = "{config.tunnel.api_key}"
memory_endpoint = "{config.tunnel.memory_endpoint}"
timeout_seconds = {config.tunnel.timeout_seconds}

[screen]
enable_screenshot = {_toml_bool(config.screen.enable_screenshot)}
enable_ocr = {_toml_bool(config.screen.enable_ocr)}
ocr_max_chars = {config.screen.ocr_max_chars}

[openclaw]
base_url = "{base_url}"
api_key = "{config.openclaw.api_key}"
timeout_seconds = {config.openclaw.timeout_seconds}

[privacy]
store_screenshots = {_toml_bool(config.privacy.store_screenshots)}
redact_window_titles = {_toml_bool(config.privacy.redact_window_titles)}
"""
    (config.root_dir / "config.toml").write_text(content, encoding="utf-8")


def _toml_bool(value: bool) -> str:
    return "true" if value else "false"


def _to_config_path(root_dir: Path, path: Path) -> str:
    try:
        return path.relative_to(root_dir).as_posix()
    except ValueError:
        return path.as_posix()
