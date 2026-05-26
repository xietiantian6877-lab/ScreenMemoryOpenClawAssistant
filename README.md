# Screen Memory OpenClaw Assistant

Windows desktop assistant inspired by [farzaa/clicky](https://github.com/farzaa/clicky). It watches the active window, writes a daily memory log, and gives short step-by-step guidance beside your mouse when you get stuck.

This is not a macOS Clicky port. It is an Electron Windows implementation that embeds Clicky-like behavior into a screen-memory/OpenClaw workflow: cursor-side typed guidance, summon buttons, optional screen pointing, taskbar/tray status, direct OpenAI-compatible API calls, and memory package export/import.

## Features

- Watch mode by default: the assistant quietly watches the screen, writes memory, and occasionally chats like a live-stream companion instead of proactively coaching every action.
- Cursor-side typewriter replies with a stable fixed width and adaptive height.
- Reply bubble follows the mouse smoothly; when the cursor becomes an I-beam over a text field, it moves down to avoid IME/input suggestions.
- Clicky-style virtual pointer appears only when the model returns a `[POINT:x,y:label:screen0]` marker.
- `Alt + Space`, `Ctrl + Shift + Space`, `F8`, `Alt + \`` or the `?` button summons `打字` / `指引`.
- Daily memory is written as both `.jsonl` and `.md`.
- Memory can be packaged as today / last 7 days / all, then imported on another OpenClaw computer.
- Supports OpenAI-compatible relays such as sub2api through `wire_api = "auto"`.
- Screenshots are kept in memory for model requests and are not saved by default.

## Quick Start

Run from PowerShell:

```powershell
cd E:\ScreenMemoryOpenClawAssistant
.\start-electron.ps1
```

Or double-click:

```text
E:\ScreenMemoryOpenClawAssistant\open-app.vbs
```

After code or config changes, restart the Electron process:

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process
cd E:\ScreenMemoryOpenClawAssistant
.\start-electron.ps1
```

First launch installs Electron dependencies automatically if `electron-app/node_modules` is missing.

## API Configuration

The app reads the project root `config.toml`. API keys should not be committed; save them in the app UI or set `OPENAI_API_KEY` / `SCREEN_MEMORY_OPENAI_API_KEY`.

Example:

```toml
model_provider = "OpenAI"
model = "gpt-5.5"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
windows_wsl_setup_acknowledged = true
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "https://fast.allincoding.cc"
wire_api = "auto"
requires_openai_auth = true
```

`wire_api` options:

- `responses`: use `POST /v1/responses`
- `chat`: use `POST /v1/chat/completions`
- `auto`: try Responses, then Chat Completions with a conservative text-only fallback

For sub2api-style relays, start with:

```toml
wire_api = "auto"
```

If a relay documents WebSocket-only Codex CLI support, this Electron app still needs the HTTP-compatible gateway (`/v1/responses` or `/v1/chat/completions`) unless WebSocket support is implemented separately.

## Using The Assistant

- Type in the bottom-right main bar and press send to actively reply to her or ask a question.
- Press `F8` or click `?` to show summon buttons near the mouse.
- Use `打字` to tell her your current goal.
- Use `指引` to get an immediate next-step hint from the current window and memory.
- Click the right-side pet to collapse/expand the bar. If collapsed from Settings, it reopens to the main composer.

The right-side pet is the dock control. The small blue cursor is only a temporary pointer, not a permanent follower.

Default companion mode:

```toml
[assistant]
observe_interval_min_seconds = 10
observe_interval_max_seconds = 60
companion_mode = "watch"
proactive_guidance = false
casual_chat = true
```

In this mode, the assistant observes at a random interval between 10 and 60 seconds, avoids automatic guidance popups, and only occasionally comments. You can still actively talk to her through the bottom-right input.

## Memory

Daily files:

```text
data/memory/YYYY-MM-DD.jsonl
data/memory/YYYY-MM-DD.md
```

Memory packages:

```text
data/memory_packages
```

Package buttons:

- `#`: today
- `7天包`: last 7 days
- `全部包`: all memory
- `导入包`: import a memory package from another machine

## Optional OpenClaw Tunnel

You can still use an OpenClaw HTTP tunnel:

```toml
[tunnel]
base_url = "https://your-tunnel.example"
memory_endpoint = "/memory/sync"
```

Expected endpoints:

- `POST /observe`
- `POST /chat`
- `POST /memory/sync`

Direct OpenAI-compatible mode has priority. If no direct API and no tunnel is configured, the app falls back to local heuristics.

## Troubleshooting

Restart after every config/code change:

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process
.\start-electron.ps1
```

Test a relay:

```powershell
curl.exe -I https://fast.allincoding.cc/v1/models
```

If GitHub cannot connect on Windows and you use Clash Verge / Mihomo:

```powershell
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
git ls-remote origin HEAD
```

Common API errors:

- `ECONNRESET`: relay/network closed the connection. Check proxy, relay availability, or `base_url`.
- `ERR_INVALID_ARGUMENT`: Electron request or relay rejected parameters. The app now avoids protected headers and has conservative fallback requests.
- `401`: API key is missing or invalid.
- `404`: wrong `base_url`, unsupported path, or unsupported model.

## Development

Syntax checks:

```powershell
node --check electron-app\src\main.js
node --check electron-app\src\typewriter\typewriter.js
```

Tests:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Dev launch:

```powershell
.\start-electron-dev.ps1
```

Logs:

```text
data/logs/electron.out.log
data/logs/electron.err.log
```

## Privacy

The app reads the active window title/process and can send an in-memory screenshot to the configured model. Screenshots are not written to disk by default:

```toml
[privacy]
store_screenshots = false
```

Run it only on machines and networks you trust.
