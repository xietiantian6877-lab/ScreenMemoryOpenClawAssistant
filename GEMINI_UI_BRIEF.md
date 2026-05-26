# 给 Gemini 的界面设计说明

这个项目现在有一套 Electron 无边框界面。外部系统标题栏已经关闭：

```js
new BrowserWindow({
  frame: false,
  transparent: true,
  backgroundColor: "#00000000"
})
```

## 只改这些界面文件

主窗口：

- `electron-app/src/renderer/index.html`
- `electron-app/src/renderer/styles.css`
- `electron-app/src/renderer/renderer.js`

鼠标旁聊天框：

- `electron-app/src/chat/chat.html`
- `electron-app/src/chat/chat.css`
- `electron-app/src/chat/chat.js`

## 不要改核心逻辑

核心逻辑在：

- `electron-app/src/main.js`

它负责：

- 每隔一段时间读取当前活动窗口
- 调用隧穿地址的 `POST /observe`
- 写入 `data/memory/YYYY-MM-DD.md` 和 `.jsonl`
- 把当天记忆同步到 `POST /memory/sync`
- 阻碍时在鼠标旁打开无边框聊天框
- 聊天输入发送到 `POST /chat`

## 前端可用 API

Renderer 里可以通过 `window.screenMemory` 调用：

```js
window.screenMemory.getState()
window.screenMemory.saveTunnel(url)
window.screenMemory.syncToday()
window.screenMemory.openMemoryFolder()
window.screenMemory.testBlockedPopup()
window.screenMemory.minimize()
window.screenMemory.hide()
window.screenMemory.close()
window.screenMemory.onStateUpdate((state) => {})
```

聊天框里可以调用：

```js
window.screenMemory.getPrompt()
window.screenMemory.submitChat(text)
window.screenMemory.closeChat()
```

## 状态数据结构

```js
{
  config: {
    tunnelBaseUrl: "https://...",
    observeIntervalSeconds: 20,
    memoryEndpoint: "/memory/sync"
  },
  observation: {
    timestamp: "2026-05-26T10:00:00.000Z",
    active_window_title: "当前窗口标题",
    active_process: "Code.exe",
    summary: "用户正在...",
    blocked: false,
    source: "openclaw"
  },
  statusMessage: "运行中：...",
  syncMessage: "记忆隧穿：已同步 2026-05-26",
  memoryDir: "E:\\ScreenMemoryOpenClawAssistant\\data\\memory"
}
```
