from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable

try:
    import customtkinter as ctk
except Exception:
    ctk = None


class MouseChatPopup:
    def __init__(self, root: tk.Tk, on_submit: Callable[[str], str]) -> None:
        self.root = root
        self.on_submit = on_submit
        self.window: tk.Toplevel | None = None

    def show(self, prompt: str) -> None:
        if self.window and self.window.winfo_exists():
            return
        if ctk is not None:
            self._show_modern(prompt)
        else:
            self._show_basic(prompt)

    def _position(self) -> str:
        x = self.root.winfo_pointerx() + 18
        y = self.root.winfo_pointery() + 18
        return f"390x210+{x}+{y}"

    def _show_modern(self, prompt: str) -> None:
        self.window = ctk.CTkToplevel(self.root)
        self.window.title("遇到阻碍了吗？")
        self.window.attributes("-topmost", True)
        self.window.geometry(self._position())
        self.window.resizable(False, False)
        self.window.configure(fg_color="#11131A")

        frame = ctk.CTkFrame(self.window, corner_radius=20, fg_color="#191E2A")
        frame.pack(fill="both", expand=True, padx=10, pady=10)

        header = ctk.CTkFrame(frame, fg_color="#25304D", corner_radius=16)
        header.pack(fill="x", padx=14, pady=(14, 10))
        ctk.CTkLabel(
            header,
            text="遇到阻碍了吗？",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color="#E8EDF8",
        ).pack(anchor="w", padx=12, pady=10)

        ctk.CTkLabel(
            frame,
            text=prompt,
            justify="left",
            wraplength=360,
            font=ctk.CTkFont(size=13),
            text_color="#BFC7D8",
        ).pack(anchor="w", padx=14)

        entry = ctk.CTkEntry(
            frame,
            placeholder_text="说一句你卡在哪里",
            height=42,
            corner_radius=14,
            fg_color="#111820",
            text_color="#EDF2FF",
            placeholder_text_color="#6E7B9B",
            border_width=1,
            border_color="#2C3A59",
        )
        entry.pack(fill="x", padx=14, pady=(12, 8))

        response = ctk.CTkLabel(
            frame,
            text="",
            justify="left",
            wraplength=360,
            text_color="#9AA3B8",
        )
        response.pack(anchor="w", fill="x", padx=14)

        def submit() -> None:
            text = entry.get().strip()
            if not text:
                self.window.destroy()
                return
            reply = self.on_submit(text)
            response.configure(text=reply)
            self.window.after(5000, self.window.destroy)

        buttons = ctk.CTkFrame(frame, fg_color="transparent")
        buttons.pack(fill="x", padx=14, pady=(10, 14))
        ctk.CTkButton(
            buttons,
            text="没事",
            width=84,
            fg_color="#11131A",
            text_color="#9AA3B8",
            hover_color="#1E263C",
            border_width=1,
            border_color="#2C3A59",
            command=self.window.destroy,
        ).pack(side="right", padx=(8, 0))
        ctk.CTkButton(
            buttons,
            text="发送",
            width=84,
            fg_color="#4D84FF",
            hover_color="#4B6FEF",
            command=submit,
        ).pack(side="right")

        entry.bind("<Return>", lambda _event: submit())
        entry.focus_set()

    def _show_basic(self, prompt: str) -> None:
        self.window = tk.Toplevel(self.root)
        self.window.title("遇到阻碍了吗？")
        self.window.attributes("-topmost", True)
        self.window.geometry(self._position())
        self.window.resizable(False, False)

        frame = ttk.Frame(self.window, padding=12)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text=prompt, wraplength=340).pack(anchor="w")
        entry = ttk.Entry(frame)
        entry.pack(fill="x", pady=(10, 8))
        response = ttk.Label(frame, text="", wraplength=340)
        response.pack(anchor="w", fill="x")

        def submit() -> None:
            text = entry.get().strip()
            if not text:
                self.window.destroy()
                return
            reply = self.on_submit(text)
            response.configure(text=reply)
            self.window.after(5000, self.window.destroy)

        buttons = ttk.Frame(frame)
        buttons.pack(fill="x", pady=(8, 0))
        ttk.Button(buttons, text="发送", command=submit).pack(side="right")
        ttk.Button(buttons, text="没事", command=self.window.destroy).pack(side="right", padx=(0, 8))
        entry.bind("<Return>", lambda _event: submit())
        entry.focus_set()
