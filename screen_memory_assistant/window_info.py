from __future__ import annotations


def get_active_window() -> tuple[str, str]:
    try:
        import win32gui
        import win32process
        import psutil

        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid).name()
        return title, process
    except Exception:
        try:
            import win32gui

            hwnd = win32gui.GetForegroundWindow()
            return win32gui.GetWindowText(hwnd), ""
        except Exception:
            return "", ""
