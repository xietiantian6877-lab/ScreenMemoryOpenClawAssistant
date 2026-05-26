请帮我重新设计一个 Windows 桌面软件窗口 UI。项目是一个 Electron 应用，必须是无边框窗口，不要系统自带外部标题栏/边框/白框。

产品名称：屏幕记忆助手

核心用途：
- 本地观察用户当前活动窗口，判断用户在做什么
- 定时写入每日记忆
- 通过用户填写的“隧穿地址”把每日记忆同步回远端
- OpenClaw 交互也共用这个隧穿地址
- 如果判断用户卡住，在鼠标旁弹出一个小聊天框询问是否遇到阻碍

我的设计要求：
- 用 Electron 写，不要 Tkinter、不要系统原生外框
- BrowserWindow 必须 `frame: false`
- 窗口外观要现代化、简洁、高级，不像传统表单
- 主界面只需要用户填写一个关键输入：隧穿地址
- 隧穿地址保存后显示连接状态和记忆同步状态
- 主窗口要有自定义标题栏、最小化、隐藏、退出按钮
- 内容区域显示：当前识别窗口、摘要、运行状态、每日记忆路径、同步按钮、测试阻碍弹窗按钮
- 鼠标旁聊天框也要无边框、轻量、像浮层气泡，不要系统外框
- 不要做营销落地页，打开就是实际可用的软件界面
- 不要大面积紫蓝渐变，不要太花；希望是安静、科技感、工具感
- 中文界面

现有文件结构：

主窗口：
- `electron-app/src/renderer/index.html`
- `electron-app/src/renderer/styles.css`
- `electron-app/src/renderer/renderer.js`

鼠标旁聊天框：
- `electron-app/src/chat/chat.html`
- `electron-app/src/chat/chat.css`
- `electron-app/src/chat/chat.js`

核心逻辑：
- `electron-app/src/main.js`

请主要重写/优化这些前端文件：
- `index.html`
- `styles.css`
- `renderer.js`
- `chat.html`
- `chat.css`
- `chat.js`

核心逻辑 API 不要破坏。Renderer 可用：

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

聊天框可用：

```js
window.screenMemory.getPrompt()
window.screenMemory.submitChat(text)
window.screenMemory.closeChat()
```

状态数据结构：

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

请输出一套完整可替换的前端代码，包含：
1. `index.html`
2. `styles.css`
3. `renderer.js`
4. `chat.html`
5. `chat.css`
6. `chat.js`

额外注意：
- 所有按钮和输入框尺寸要稳定，窗口缩放时不能挤坏
- 文字不能溢出或重叠
- 自定义标题栏可拖动，按钮区不可拖动
- 保持无边框透明窗口的圆角阴影效果
- 如果要用图标，直接用字符或 CSS 即可，不要依赖外部图标库
