# Screen Memory OpenClaw Assistant

Windows 桌面屏幕记忆助手，参考 [farzaa/clicky](https://github.com/farzaa/clicky) 的陪伴和引导体验，但实现方式是 Windows Electron 应用。她会观察当前窗口、写入每日记忆、在鼠标旁逐字回复，也可以通过 OpenAI 兼容中转站或本机 Codex 工作。

## 当前定位

- 默认是陪看模式：低频观察屏幕、写记忆、偶尔聊天，不主动挡住操作。
- 需要时可主动输入问题，回复会出现在鼠标旁。
- 指导模式可开关，打开后才会主动给操作建议。
- 支持记忆打包，方便把今天或全部记忆带到 OpenClaw 所在电脑。
- 主要面向 Windows；不是 macOS Clicky 的直接移植。

## 启动

PowerShell:

```powershell
cd E:\ScreenMemoryOpenClawAssistant
.\start-electron.ps1
```

双击启动:

```text
E:\ScreenMemoryOpenClawAssistant\open-app.vbs
```

重启 Electron:

```powershell
$electron = Join-Path (Get-Location) 'electron-app\node_modules\electron\dist\electron.exe'
Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electron } | Stop-Process -Force
.\start-electron.ps1
```

首次启动如果缺少 `electron-app/node_modules`，脚本会自动运行 `npm install`。

## 主要操作

- 首页输入框：主动和她聊天或让她帮你判断当前任务。
- `Alt + ``：只弹出鼠标旁输入框。
- 首页 `OpenAI/Codex`：切换 API 模式或 Codex 模式。
- 模型和推理强度下拉：用独立浮层显示，不再拉动主框。
- 设置页：分为 `记忆`、`模型`、`隧穿`。
- 说话位置：鼠标旁、右上角、关闭常驻。
- 操作指导：关闭时只陪看聊天，打开后才主动指导操作。
- 点击右侧宠物：收起或展开主栏。

## API 配置

项目根目录的 `config.toml` 会被读取。密钥不要提交到 Git；可以在设置页保存，或使用环境变量：

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:SCREEN_MEMORY_OPENAI_API_KEY = "sk-..."
```

示例:

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

`wire_api`:

- `responses`: 请求 `/v1/responses`
- `chat`: 请求 `/v1/chat/completions`
- `auto`: 先试 Responses，失败后自动降级 Chat Completions

中转站或 sub2api 建议先用:

```toml
wire_api = "auto"
```

## Codex 模式

应用会检测本机是否有 `codex` 命令或 ChatGPT/Codex 扩展里的 Windows Codex 可执行文件。

Codex 可用时：

- 首页显示 `Codex`
- 输入内容可以走 Codex
- 模型可选 `gpt-5.5`、`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.3-codex`、`gpt-5.2`
- 权限可在 `完全访问权限` 和 `每步确认` 间切换

Codex 不可用时，首页 Codex 切换会保持灰色或回到 API 模式。

## 记忆

每日记忆位置:

```text
data/memory/YYYY-MM-DD.jsonl
data/memory/YYYY-MM-DD.md
```

记忆包位置:

```text
data/memory_packages
```

设置页可操作：

- 今日包
- 打开记忆
- 打开记忆包
- 导入记忆包

## 隧穿

如果 OpenClaw 在另一台电脑，可填 HTTP 隧穿地址：

```toml
[tunnel]
base_url = "https://your-tunnel.example"
memory_endpoint = "/memory/sync"
```

预期接口:

- `POST /observe`
- `POST /chat`
- `POST /memory/sync`

直连 API 优先；没有直连也没有隧穿时，会使用本地规则做轻量判断。

## 文件结构

```text
electron-app/
  src/
    main.js                 Electron 主进程入口
    main/constants.js        路径、默认配置、窗口尺寸常量
    preload.js              安全暴露给渲染层的 IPC
    renderer/               右下角主界面
    chat/                   Alt+` 鼠标旁输入框
    typewriter/             鼠标旁逐字回复框
    cursor-buddy/           蓝色指引光标/宠物
    dropdown/               统一下拉浮层
    summon/                 召唤按钮
    toast/                  启动提示
data/
  memory/                   每日记忆
  memory_packages/          导出的记忆包
  logs/                     运行日志
```

## 闪烁优化说明

Windows 上透明置顶 Electron 窗口在频繁 `setBounds` 时容易闪烁或拖影。当前策略：

- 主窗口伸缩不做逐帧动画。
- 设置页切换尽量在窗口内部完成。
- 下拉选项使用独立透明小窗，不撑开主界面。
- 主窗口关闭原生阴影，使用 CSS 阴影减少系统合成压力。
- 透明空白区域尽量设置鼠标穿透，避免挡住后面的软件。

## 开发

语法检查:

```powershell
node --check electron-app\src\main.js
node --check electron-app\src\renderer\renderer.js
node --check electron-app\src\preload.js
node --check electron-app\src\chat\chat.js
node --check electron-app\src\typewriter\typewriter.js
node --check electron-app\src\dropdown\dropdown.js
```

测试:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

开发启动:

```powershell
.\start-electron-dev.ps1
```

## 排障

测试模型接口:

```powershell
curl.exe -I https://fast.allincoding.cc/v1/models
```

GitHub 连接失败且使用本机代理时:

```powershell
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
git ls-remote origin HEAD
```

常见错误:

- `ECONNRESET`: 中转站、网络代理或当前模型参数被服务端断开。
- `ERR_INVALID_ARGUMENT`: 请求参数或 Electron net 约束不兼容，建议用 `wire_api = "auto"`。
- `401`: 密钥缺失或无效。
- `404`: `base_url`、路径或模型不可用。

## 隐私

应用会读取当前窗口标题、进程名，并可按配置把内存中的屏幕截图发给模型。默认不把截图写入磁盘：

```toml
[privacy]
store_screenshots = false
```

只在你信任的电脑和网络环境中运行。
