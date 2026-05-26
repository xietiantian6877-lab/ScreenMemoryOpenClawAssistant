# Screen Memory OpenClaw Assistant

Windows 本地桌面助手原型：定时识别当前活动窗口，写入每日记忆；当判断你可能不知道下一步怎么操作时，会在鼠标旁边逐字打出建议，并弹出轻量输入框。Electron 版本参考 Clicky 的“桌面伙伴”形态，支持悬浮入口、系统托盘、任务栏状态徽标、OpenAI 直连和记忆包导出。

## 启动

```powershell
cd E:\ScreenMemoryOpenClawAssistant
E:\ScreenMemoryOpenClawAssistant\start-electron.ps1
```

也可以双击：

```text
E:\ScreenMemoryOpenClawAssistant\open-app.vbs
```

开发日志：

```powershell
E:\ScreenMemoryOpenClawAssistant\start-electron-dev.ps1
```

## OpenAI 直连

根目录 `config.toml` 支持这组 Codex 风格配置，手动修改后重启 Electron 即生效。API key 不建议写进仓库文件，优先用 `OPENAI_API_KEY` 或在界面里保存到本地 `data/electron-config.json`。

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
wire_api = "responses"
requires_openai_auth = true
```

Electron 会使用 `wire_api = "responses"` 调用 `POST /v1/responses`。`model_reasoning_effort = "xhigh"` 会按配置原样发送；如果后端不接受，会自动回退到 `high` 再试一次。

## Clicky 风格指导

参考 Clicky 的虚拟鼠标和语音回复体验，但这里不启用语音/TTS：模型回复会显示成透明小气泡，并逐字打出来。设置里可以选择默认显示位置：

- `鼠标旁`：她默认在 Windows 鼠标旁说话。
- `右上角`：她默认在屏幕右上角说话。
- `关闭常驻`：平常不自动出现。

任何模式下都可以按 `Alt + \`` 明确召唤她，鼠标旁会出现 `打字` 和 `指引` 两个按钮。`打字` 用来告诉她你的目标，`指引` 会直接根据当前窗口和记忆给下一步操作建议。

## 记忆文件和记忆包

每日记忆写到：

```text
E:\ScreenMemoryOpenClawAssistant\data\memory\YYYY-MM-DD.jsonl
E:\ScreenMemoryOpenClawAssistant\data\memory\YYYY-MM-DD.md
```

界面里有多个打包按钮：

- `#`：打包今日记忆
- `7天包`：打包最近 7 天
- `全部包`：打包全部记忆
- `导入包`：把另一台 OpenClaw 电脑带回来的记忆包写入本机记忆目录

记忆包输出到：

```text
E:\ScreenMemoryOpenClawAssistant\data\memory_packages
```

## 可选隧穿

仍然保留 OpenClaw HTTP 隧穿接口：

```toml
[tunnel]
base_url = "https://你的隧穿地址"
```

接口为 `POST /observe`、`POST /chat`、`POST /memory/sync`。如果配置了 OpenAI 直连，会优先直连模型；否则使用隧穿；两者都没有时使用本地启发式判断。

## 注意

这个项目会读取活动窗口标题和可选截图上下文。默认不把截图写入磁盘；如启用截图发给模型，请只在你信任的电脑和网络配置下运行。
