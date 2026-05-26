# 隧穿与 OpenClaw 接口契约

助手只需要填写一个隧穿地址。这个地址会同时用于 OpenClaw 交互和每日记忆同步。

配置位置：

```toml
[tunnel]
base_url = "https://your-tunnel.example.com"
```

也可以启动时传入：

```powershell
.\run.ps1 -TunnelBaseUrl "https://your-tunnel.example.com"
```

## POST /observe

请求：

```json
{
  "active_window_title": "当前窗口标题",
  "active_process": "Code.exe",
  "ocr_text": "可选 OCR 文本",
  "same_context_minutes": 6.2,
  "language": "zh-CN"
}
```

响应：

```json
{
  "summary": "用户正在编辑 Python 项目，可能在处理测试失败。",
  "blocked": true,
  "message": "看起来你可能遇到了阻碍，要不要说说卡在哪里？"
}
```

## POST /memory/sync

每次写入每日记忆后，助手会把当天的 `md` 和 `jsonl` 文件内容同步回隧穿地址。

请求：

```json
{
  "client": {
    "hostname": "DESKTOP-NAME"
  },
  "date": "2026-05-26",
  "latest_observation": {
    "timestamp": "2026-05-26T10:00:00+08:00",
    "active_window_title": "PowerShell",
    "active_process": "WindowsTerminal.exe",
    "summary": "用户可能正在运行测试",
    "blocked": false
  },
  "latest_json_line": "{\"timestamp\":\"...\"}",
  "latest_markdown_line": "- 10:00:00 [WindowsTerminal.exe] PowerShell: ...",
  "files": [
    {
      "name": "2026-05-26.md",
      "kind": "markdown",
      "content": "# 2026-05-26 电脑记忆\n..."
    },
    {
      "name": "2026-05-26.jsonl",
      "kind": "jsonl",
      "content": "{\"timestamp\":\"...\"}\n"
    }
  ]
}
```

如果 `/memory/sync` 返回 404，助手会自动再试一次 `POST /memory`。

## POST /chat

请求：

```json
{
  "message": "我这里测试一直失败",
  "last_observation": {
    "timestamp": "2026-05-26T10:00:00+08:00",
    "active_window_title": "PowerShell",
    "active_process": "WindowsTerminal.exe",
    "summary": "用户可能正在运行测试",
    "blocked": true
  }
}
```

响应：

```json
{
  "reply": "我看到你刚才在测试窗口。建议先看第一条失败栈，再定位断言差异。"
}
```

## 隧穿示例

```powershell
$env:TUNNEL_BASE_URL = "https://your-tunnel.example.com"
python -m screen_memory_assistant
```

或者：

```powershell
.\run.ps1 -TunnelBaseUrl "https://your-tunnel.example.com"
```
