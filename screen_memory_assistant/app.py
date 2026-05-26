from __future__ import annotations

import os
import queue
import threading
import time
from pathlib import Path

import customtkinter as ctk

from .config import load_config, save_tunnel_address
from .memory import DailyMemory, MemoryWrite
from .memory_tunnel import MemoryTunnelClient
from .models import Observation
from .notifier import Notifier
from .openclaw import OpenClawClient
from .popup import MouseChatPopup
from .screen import capture_primary_monitor, ocr_image
from .window_info import get_active_window


class AssistantApp:
    def __init__(self, root_dir: Path) -> None:
        self.config = load_config(root_dir)
        self.memory = DailyMemory(self.config.assistant.memory_dir)
        self.openclaw = OpenClawClient(self.config.openclaw)
        self.memory_tunnel = MemoryTunnelClient(self.config.tunnel)
        self.notifier = Notifier()
        self.events: queue.Queue[tuple[str, object]] = queue.Queue()
        self.stop_event = threading.Event()
        self.last_observation: Observation | None = None
        self.last_context_key = ""
        self.context_started = time.monotonic()
        self.last_notify = 0.0
        self.last_block_prompt = 0.0

        ctk.set_appearance_mode("System")
        ctk.set_default_color_theme("blue")
        self.root = ctk.CTk()
        self.root.title("屏幕记忆助手")
        self.root.geometry("780x560")
        self.root.minsize(700, 500)
        self.root.protocol("WM_DELETE_WINDOW", self.hide_window)

        self.popup = MouseChatPopup(self.root, self.handle_chat)
        self.status_var = ctk.StringVar(value="正在启动")
        self.connection_var = ctk.StringVar(value=self.connection_status_text())
        self.sync_var = ctk.StringVar(value=self.memory_sync_status_text())
        self.window_var = ctk.StringVar(value="等待第一次识别")
        self.summary_var = ctk.StringVar(value="还没有写入记忆。")
        self.memory_var = ctk.StringVar(value=str(self.config.assistant.memory_dir))
        self.build_main_window()

    def start(self) -> None:
        worker = threading.Thread(target=self.observe_loop, daemon=True)
        worker.start()
        self.root.after(250, self.process_events)
        self.notifier.toast("屏幕记忆助手已启动", "正在观察屏幕，并写入每天的记忆。")
        self.root.mainloop()
        self.stop_event.set()

    def build_main_window(self) -> None:
        self.root.grid_rowconfigure(0, weight=1)
        self.root.grid_columnconfigure(0, weight=1)

        shell = ctk.CTkFrame(self.root, corner_radius=0, fg_color=("#F3F5FA", "#101114"))
        shell.grid(row=0, column=0, sticky="nsew")
        shell.grid_rowconfigure(2, weight=1)
        shell.grid_columnconfigure(0, weight=1)

        header = ctk.CTkFrame(shell, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=24, pady=(22, 12))
        header.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(header, text="屏幕记忆助手", font=ctk.CTkFont(size=24, weight="bold")).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(header, text="本地观察、每日记忆、隧穿同步", text_color=("#5D6678", "#A8B0BE")).grid(
            row=1, column=0, sticky="w", pady=(4, 0)
        )
        ctk.CTkButton(header, text="隐藏", width=76, command=self.hide_window).grid(row=0, column=1, rowspan=2, padx=(12, 0))

        tunnel_card = self.card(shell)
        tunnel_card.grid(row=1, column=0, sticky="ew", padx=24, pady=(0, 14))
        tunnel_card.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(tunnel_card, text="隧穿地址", font=ctk.CTkFont(size=15, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=18, pady=(16, 8)
        )
        self.tunnel_entry = ctk.CTkEntry(tunnel_card, placeholder_text="https://你的隧穿地址", height=38)
        self.tunnel_entry.grid(row=0, column=1, sticky="ew", padx=(10, 10), pady=(16, 8))
        if self.config.tunnel.base_url:
            self.tunnel_entry.insert(0, self.config.tunnel.base_url)
        ctk.CTkButton(tunnel_card, text="保存并连接", width=104, height=38, command=self.save_tunnel_from_ui).grid(
            row=0, column=2, sticky="e", padx=(0, 18), pady=(16, 8)
        )
        ctk.CTkLabel(tunnel_card, textvariable=self.connection_var, text_color=("#5D6678", "#A8B0BE")).grid(
            row=1, column=0, columnspan=3, sticky="w", padx=18, pady=(0, 6)
        )
        ctk.CTkLabel(tunnel_card, textvariable=self.sync_var, text_color=("#5D6678", "#A8B0BE")).grid(
            row=2, column=0, columnspan=3, sticky="w", padx=18, pady=(0, 16)
        )

        body = ctk.CTkFrame(shell, fg_color="transparent")
        body.grid(row=2, column=0, sticky="nsew", padx=24, pady=(0, 14))
        body.grid_columnconfigure(0, weight=2)
        body.grid_columnconfigure(1, weight=1)
        body.grid_rowconfigure(0, weight=1)

        activity = self.card(body)
        activity.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        activity.grid_rowconfigure(3, weight=1)
        activity.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(activity, text="当前识别", font=ctk.CTkFont(size=18, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=18, pady=(18, 8)
        )
        ctk.CTkLabel(activity, textvariable=self.status_var, text_color=("#5D6678", "#A8B0BE")).grid(
            row=1, column=0, sticky="w", padx=18
        )
        ctk.CTkLabel(activity, textvariable=self.window_var, font=ctk.CTkFont(size=15, weight="bold"), wraplength=430).grid(
            row=2, column=0, sticky="w", padx=18, pady=(18, 6)
        )
        ctk.CTkLabel(activity, textvariable=self.summary_var, justify="left", wraplength=430).grid(
            row=3, column=0, sticky="nw", padx=18, pady=(0, 18)
        )

        side = ctk.CTkFrame(body, fg_color="transparent")
        side.grid(row=0, column=1, sticky="nsew")
        side.grid_columnconfigure(0, weight=1)

        memory_card = self.card(side)
        memory_card.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        memory_card.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(memory_card, text="每日记忆", font=ctk.CTkFont(size=18, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=18, pady=(18, 8)
        )
        ctk.CTkLabel(memory_card, textvariable=self.memory_var, wraplength=220, text_color=("#5D6678", "#A8B0BE")).grid(
            row=1, column=0, sticky="w", padx=18, pady=(0, 14)
        )
        ctk.CTkButton(memory_card, text="打开记忆文件夹", command=self.open_memory_folder).grid(
            row=2, column=0, sticky="ew", padx=18, pady=(0, 10)
        )
        ctk.CTkButton(memory_card, text="同步今天记忆", fg_color=("#2F6FDB", "#2F6FDB"), command=self.sync_today).grid(
            row=3, column=0, sticky="ew", padx=18, pady=(0, 18)
        )

        action_card = self.card(side)
        action_card.grid(row=1, column=0, sticky="ew")
        action_card.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(action_card, text="操作", font=ctk.CTkFont(size=18, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=18, pady=(18, 8)
        )
        ctk.CTkButton(action_card, text="测试阻碍弹窗", command=self.show_test_popup).grid(
            row=1, column=0, sticky="ew", padx=18, pady=(0, 10)
        )
        ctk.CTkButton(action_card, text="退出助手", fg_color=("#D64545", "#B93A3A"), hover_color=("#B93A3A", "#9E3030"), command=self.quit_app).grid(
            row=2, column=0, sticky="ew", padx=18, pady=(0, 18)
        )

    def card(self, parent) -> ctk.CTkFrame:
        return ctk.CTkFrame(parent, corner_radius=18, border_width=1, fg_color=("#FFFFFF", "#1B1D22"), border_color=("#E4E8F0", "#2A2D35"))

    def connection_status_text(self) -> str:
        if self.config.tunnel.base_url:
            return f"隧穿地址：{self.config.tunnel.base_url}"
        return "隧穿地址：未填写，OpenClaw 和记忆同步暂不启用"

    def memory_sync_status_text(self) -> str:
        if self.config.tunnel.base_url:
            return "记忆隧穿：等待下一次写入后同步"
        return "记忆隧穿：未填写地址"

    def save_tunnel_from_ui(self) -> None:
        address = self.tunnel_entry.get().strip()
        save_tunnel_address(self.config, address)
        self.config = load_config(self.config.root_dir)
        self.openclaw = OpenClawClient(self.config.openclaw)
        self.memory_tunnel = MemoryTunnelClient(self.config.tunnel)
        self.connection_var.set(self.connection_status_text())
        self.sync_var.set("记忆隧穿：已保存，正在同步今天记忆" if address else "记忆隧穿：未填写地址")
        if address:
            self.sync_today()

    def hide_window(self) -> None:
        self.root.withdraw()
        self.notifier.toast("屏幕记忆助手仍在运行", "主窗口已隐藏，观察和记忆写入会继续。")

    def open_memory_folder(self) -> None:
        self.config.assistant.memory_dir.mkdir(parents=True, exist_ok=True)
        os.startfile(str(self.config.assistant.memory_dir))

    def show_test_popup(self) -> None:
        self.popup.show("看起来你可能遇到了阻碍，要不要说说卡在哪里？")

    def quit_app(self) -> None:
        self.stop_event.set()
        self.root.destroy()

    def observe_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                observation = self.observe_once()
                write = self.memory.append(observation)
                self.last_observation = observation
                self.queue_memory_sync(write, observation)
                self.events.put(("observation", observation))
            except Exception as exc:
                self.events.put(("status", f"观察失败：{exc}"))
            self.stop_event.wait(self.config.assistant.observe_interval_seconds)

    def observe_once(self) -> Observation:
        title, process = get_active_window()
        if self.config.privacy.redact_window_titles:
            title = "[已隐藏窗口标题]"

        image = capture_primary_monitor() if self.config.screen.enable_screenshot else None
        ocr_text = ocr_image(image, self.config.screen.ocr_max_chars) if self.config.screen.enable_ocr else ""

        context_key = f"{process}|{title}"
        now = time.monotonic()
        if context_key != self.last_context_key:
            self.last_context_key = context_key
            self.context_started = now
        same_context_minutes = (now - self.context_started) / 60

        payload = {
            "active_window_title": title,
            "active_process": process,
            "ocr_text": ocr_text,
            "same_context_minutes": round(same_context_minutes, 2),
            "language": self.config.assistant.language,
        }
        result = self.openclaw.observe(payload)
        return Observation.now(
            active_window_title=title,
            active_process=process,
            ocr_text=ocr_text,
            summary=result.summary,
            blocked=result.blocked,
            source=result.source,
            metadata={"same_context_minutes": round(same_context_minutes, 2), "message": result.message},
        )

    def queue_memory_sync(self, write: MemoryWrite, observation: Observation | None) -> None:
        if not self.memory_tunnel.enabled:
            return
        threading.Thread(target=self.sync_memory_worker, args=(write, observation), daemon=True).start()

    def sync_memory_worker(self, write: MemoryWrite, observation: Observation | None) -> None:
        result = self.memory_tunnel.sync_write(write, observation)
        self.events.put(("memory_sync", result.message))

    def sync_today(self) -> None:
        if not self.memory_tunnel.enabled:
            self.sync_var.set("记忆隧穿：请先填写隧穿地址")
            return
        self.sync_var.set("记忆隧穿：正在同步今天记忆")
        self.queue_memory_sync(self.memory.today_snapshot(), self.last_observation)

    def process_events(self) -> None:
        try:
            while True:
                event_name, payload = self.events.get_nowait()
                if event_name == "observation":
                    self.handle_observation(payload)  # type: ignore[arg-type]
                elif event_name == "memory_sync":
                    self.sync_var.set(str(payload))
                elif event_name == "status":
                    self.status_var.set(str(payload))
        except queue.Empty:
            pass
        self.root.after(250, self.process_events)

    def handle_observation(self, observation: Observation) -> None:
        now = time.monotonic()
        self.status_var.set(f"运行中：{observation.timestamp}")
        self.window_var.set(f"{observation.active_process or '未知进程'} | {observation.active_window_title or '未知窗口'}")
        self.summary_var.set(observation.summary or "已写入一次观察，但暂时没有摘要。")
        self.connection_var.set(self.connection_status_text())

        notify_seconds = self.config.assistant.notify_interval_minutes * 60
        if now - self.last_notify >= notify_seconds:
            self.last_notify = now
            self.notifier.toast("电脑记忆已更新", observation.summary[:180])

        block_seconds = self.config.assistant.blocked_check_minutes * 60
        if observation.blocked and now - self.last_block_prompt >= block_seconds:
            self.last_block_prompt = now
            prompt = observation.metadata.get("message") or "看起来你可能遇到了阻碍，要不要说说卡在哪里？"
            self.popup.show(str(prompt))

    def handle_chat(self, text: str) -> str:
        reply = self.openclaw.chat(text, self.last_observation)
        write = self.memory.append_chat(text, reply)
        self.queue_memory_sync(write, self.last_observation)
        return reply


def main() -> None:
    AssistantApp(Path.cwd()).start()
