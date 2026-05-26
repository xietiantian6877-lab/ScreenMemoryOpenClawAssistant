from __future__ import annotations

import threading
import tkinter as tk
from tkinter import ttk


class Notifier:
    def __init__(self, app_name: str = "Screen Memory Assistant") -> None:
        self.app_name = app_name

    def toast(self, title: str, message: str) -> None:
        try:
            from winotify import Notification

            toast = Notification(app_id=self.app_name, title=title, msg=message)
            toast.show()
        except Exception:
            threading.Thread(target=self._tk_toast, args=(title, message), daemon=True).start()

    def _tk_toast(self, title: str, message: str) -> None:
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        width, height = 360, 96
        x = root.winfo_screenwidth() - width - 18
        y = root.winfo_screenheight() - height - 58
        root.geometry(f"{width}x{height}+{x}+{y}")
        frame = ttk.Frame(root, padding=12)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text=title, font=("Microsoft YaHei UI", 10, "bold")).pack(anchor="w")
        ttk.Label(frame, text=message, wraplength=330).pack(anchor="w", pady=(6, 0))
        root.after(5500, root.destroy)
        root.mainloop()
