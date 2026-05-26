from screen_memory_assistant.openclaw import local_observe


def test_local_observe_detects_blocked_by_keyword():
    result = local_observe(
        {
            "active_window_title": "Python Traceback error",
            "active_process": "python.exe",
            "same_context_minutes": 1,
        }
    )

    assert result.blocked is True
    assert "python.exe" in result.summary
