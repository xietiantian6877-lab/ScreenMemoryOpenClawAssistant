from __future__ import annotations

from PIL import Image


def capture_primary_monitor() -> Image.Image | None:
    try:
        import mss

        with mss.mss() as sct:
            monitor = sct.monitors[1]
            raw = sct.grab(monitor)
            return Image.frombytes("RGB", raw.size, raw.rgb)
    except Exception:
        return None


def ocr_image(image: Image.Image | None, max_chars: int) -> str:
    if image is None:
        return ""
    try:
        import pytesseract

        text = pytesseract.image_to_string(image, lang="chi_sim+eng")
        return " ".join(text.split())[:max_chars]
    except Exception:
        return ""
