# Screen Memory OpenClaw Assistant

一个 Windows 本地桌面助手原型：定时识别屏幕和当前活动窗口，写入每天的记忆；如果判断你可能卡住，会在鼠标旁边弹出一个输入框；也会周期性在右下角弹出状态消息。

OpenClaw 目前预留为 HTTP 接口。你只需要在界面里填写一个隧穿地址，助手会用它连接 OpenClaw，并把每天的记忆文件同步回去。

## 快速启动

```powershell
cd E:\ScreenMemoryOpenClawAssistant
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy config.example.toml config.toml
python -m screen_memory_assistant
```

运行后会在后台每隔一段时间观察一次屏幕。记忆默认写到：

```text
E:\ScreenMemoryOpenClawAssistant\data\memory\YYYY-MM-DD.jsonl
E:\ScreenMemoryOpenClawAssistant\data\memory\YYYY-MM-DD.md
```

## 填写隧穿地址

打开软件界面后，在“隧穿地址”里填写：

```text
https://你的隧穿地址
```

或者编辑 `config.toml`：

```toml
[tunnel]
base_url = "https://你的隧穿地址"
```

也可以启动时传入：

```powershell
.\run.ps1 -TunnelBaseUrl "https://你的隧穿地址"
```

助手会尝试调用：

- `POST /observe`：发送屏幕上下文，期望返回 `summary`、`blocked`、`message`
- `POST /chat`：发送你在弹窗里输入的内容，期望返回 `reply`
- `POST /memory/sync`：同步当天的 `.md` 和 `.jsonl` 记忆文件

如果 OpenClaw 不在线，程序会自动使用本地启发式判断，不会中断。

## 注意

- 截图默认只保存在内存里，不落盘；写入记忆的是窗口标题、进程名、OCR 文本摘要和 OpenClaw/本地判断。
- OCR 依赖本机 Tesseract。没安装也能运行，只是不会识别截图文字。
- 这个项目会读取屏幕内容，请只在你信任的电脑和配置下运行。
