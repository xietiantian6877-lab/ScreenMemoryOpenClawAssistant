from screen_memory_assistant.memory import DailyMemory
from screen_memory_assistant.models import Observation


def test_daily_memory_writes_jsonl_and_markdown(tmp_path):
    memory = DailyMemory(tmp_path)
    observation = Observation(
        timestamp="2026-05-26T10:00:00+08:00",
        active_window_title="测试窗口",
        active_process="demo.exe",
        summary="正在测试",
    )

    memory.append(observation)

    assert (tmp_path / "2026-05-26.jsonl").exists()
    markdown = (tmp_path / "2026-05-26.md").read_text(encoding="utf-8")
    assert "测试窗口" in markdown
    assert "正在测试" in markdown
