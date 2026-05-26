# Screen Memory OpenClaw Assistant

Windows 本地桌面助手原型：定时识别当前活动窗口，写入每日记忆；当判断你可能不知道下一步怎么操作时，会在鼠标旁边逐字打出建议，并弹出轻量输入框。Electron 版本参考 [farzaa/clicky](https://github.com/farzaa/clicky) 的“AI teacher that lives as a buddy next to your cursor”形态，但这里做成 Windows 可用的鼠标旁文字指导，不依赖 macOS 菜单栏、语音转写或 TTS。

它适合这种场景：你卡住不是因为题太难，而是不知道下一步点哪里、填什么、怎么继续。助手会结合当前窗口标题、屏幕上下文和今日记忆，像一个小小的学习/工作教练一样在鼠标旁提示下一步。

## 启动

```powershell
cd E:\ScreenMemoryOpenClawAssistant
E:\ScreenMemoryOpenClawAssistant\start-electron.ps1
```

新进程的启动路径就是：

```text
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

如果你刚刚改了代码或 `config.toml`，先关掉旧 Electron 进程，再启动新进程：

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process
E:\ScreenMemoryOpenClawAssistant\start-electron.ps1
```

如果想直接从 Electron 可执行文件启动：

```powershell
$env:ELECTRON_RUN_AS_NODE = $null
Start-Process `
  -FilePath "E:\ScreenMemoryOpenClawAssistant\electron-app\node_modules\electron\dist\electron.exe" `
  -ArgumentList "." `
  -WorkingDirectory "E:\ScreenMemoryOpenClawAssistant\electron-app"
```

首次启动如果没有 `node_modules`，`start-electron.ps1` 会自动执行 `npm install`。

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
wire_api = "auto"
requires_openai_auth = true
```

Electron 支持 `wire_api = "responses"`、`"chat"` 或 `"auto"`。`responses` 调用 `POST /v1/responses`，`chat` 调用 `POST /v1/chat/completions`，`auto` 会先试 Responses，失败后再试 Chat Completions，适合 sub2api 这类中转站。

如果界面提示 `read ECONNRESET`，通常不是 API key 没保存，而是 `base_url` 服务或网络代理中途重置连接。应用会对连接重置自动重试一次；如果持续失败，先重启旧 Electron 进程，再确认 `https://fast.allincoding.cc/v1/responses` 当前是否可用，或换一个可用的 `base_url/model`。

## Clicky 风格指导

这是把 Clicky 的核心交互改成 Windows/Electron 内嵌版，而不是直接运行它原来的 macOS Swift 项目。已移植/适配的能力包括：屏幕截图上下文、鼠标旁 AI 伙伴、快捷召唤、逐字文字回复、可选屏幕指向，以及 OpenClaw 每日记忆。这里不启用语音/TTS：模型回复会显示成透明小气泡，并逐字打出来。设置里可以选择默认显示位置：

- `鼠标旁`：她默认在 Windows 鼠标旁说话。
- `右上角`：她默认在屏幕右上角说话。
- `关闭常驻`：平常不自动出现。

任何模式下都可以明确召唤她，鼠标旁会出现 `打字` 和 `指引` 两个按钮。`打字` 用来告诉她你的目标，`指引` 会直接根据当前窗口和记忆给下一步操作建议。

可用召唤方式：

- 主窗口里的 `?` 按钮
- `Alt + Space`
- `Ctrl + Shift + Space`
- `F8`
- `Alt + \``，如果你的键盘/输入法支持这个组合

当前 Windows 行为：

- 小虚拟鼠标只在需要指屏幕位置时短暂出现，不会在普通文字回复时贴着回复框跑。
- 鼠标旁逐字回复框跟随鼠标移动，刷新间隔为 `0ms`。
- 右侧主悬浮栏的小宠物可以点击收起/展开。
- 输入框和 `打字`/`指引` 按钮会出现在鼠标旁，保持可点击，避免鼠标移动时追着跑导致点不到。
- 如果模型回复带有 Clicky 风格 `[POINT:x,y:label:screen0]` 标记，应用会隐藏这段标记，并让 Windows 虚拟鼠标短暂移动到该坐标附近指示。

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
