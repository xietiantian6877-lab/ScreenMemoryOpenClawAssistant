const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const os = require("os");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const MEMORY_DIR = path.join(DATA_DIR, "memory");
const CONFIG_PATH = path.join(DATA_DIR, "electron-config.json");

const DEFAULT_CONFIG = {
  tunnelBaseUrl: "",
  apiKey: "",
  observeIntervalSeconds: 20,
  notifyIntervalMinutes: 15,
  blockedCheckMinutes: 6,
  memoryEndpoint: "/memory/sync"
};

let mainWindow = null;
let chatWindow = null;
let toastWindow = null;
let observeTimer = null;
let config = loadConfig();
let lastObservation = null;
let lastContextKey = "";
let contextStartedAt = Date.now();
let lastNotifyAt = 0;
let lastBlockPromptAt = 0;

app.whenReady().then(() => {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  createMainWindow();
  startObserver();
});

app.on("window-all-closed", () => {
  stopObserver();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!mainWindow) createMainWindow();
});

function createMainWindow() {
  const bounds = getAnchoredBounds(760, 108, "bottom-right", 18);
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 92,
    minHeight: 92,
    frame: false,
    transparent: true,
    hasShadow: true,
    show: false,
    skipTaskbar: false,
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#00000000",
    title: "屏幕记忆助手",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    positionWindow(mainWindow, "bottom-right", 18);
    mainWindow.show();
    showToast("屏幕记忆助手已启动", "后台观察和每日记忆写入已开启。");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function startObserver() {
  stopObserver();
  observeOnce();
  observeTimer = setInterval(observeOnce, config.observeIntervalSeconds * 1000);
}

function stopObserver() {
  if (observeTimer) clearInterval(observeTimer);
  observeTimer = null;
}

async function observeOnce() {
  try {
    const active = await getActiveWindowInfo();
    const contextKey = `${active.process}|${active.title}`;
    const now = Date.now();
    if (contextKey !== lastContextKey) {
      lastContextKey = contextKey;
      contextStartedAt = now;
    }

    const sameContextMinutes = Number(((now - contextStartedAt) / 60000).toFixed(2));
    const payload = {
      active_window_title: active.title,
      active_process: active.process,
      same_context_minutes: sameContextMinutes,
      language: "zh-CN"
    };

    const result = await observeWithOpenClaw(payload);
    const observation = {
      timestamp: new Date().toISOString(),
      active_window_title: active.title,
      active_process: active.process,
      summary: result.summary,
      blocked: result.blocked,
      source: result.source,
      metadata: {
        same_context_minutes: sameContextMinutes,
        message: result.message || ""
      }
    };

    lastObservation = observation;
    const write = appendMemory(observation);
    publishState({ observation });
    syncMemory(write, observation).then((message) => publishState({ syncMessage: message }));
    maybeNotify(observation);
    maybeAskBlocked(observation);
  } catch (error) {
    publishState({ statusMessage: `观察失败：${error.message}` });
  }
}

function getActiveWindowInfo() {
  const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class ActiveWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
Add-Type $code -ErrorAction SilentlyContinue
$hwnd = [ActiveWin32]::GetForegroundWindow()
$builder = New-Object System.Text.StringBuilder 1024
[void][ActiveWin32]::GetWindowText($hwnd, $builder, $builder.Capacity)
$pidValue = 0
[void][ActiveWin32]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)
$processName = ""
try { $processName = (Get-Process -Id $pidValue).ProcessName + ".exe" } catch {}
[PSCustomObject]@{ title = $builder.ToString(); process = $processName; pid = $pidValue } | ConvertTo-Json -Compress
`;

  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve({ title: "", process: "", pid: 0 });
        return;
      }
      try {
        const data = JSON.parse(stdout.trim() || "{}");
        resolve({
          title: String(data.title || ""),
          process: String(data.process || ""),
          pid: Number(data.pid || 0)
        });
      } catch {
        resolve({ title: "", process: "", pid: 0 });
      }
    });
  });
}

async function observeWithOpenClaw(payload) {
  if (!config.tunnelBaseUrl) return localObserve(payload);

  try {
    const response = await postJson("/observe", payload);
    const data = await response.json();
    return {
      summary: String(data.summary || ""),
      blocked: Boolean(data.blocked),
      message: String(data.message || ""),
      source: "openclaw"
    };
  } catch (error) {
    const fallback = localObserve(payload);
    fallback.message = `OpenClaw 暂不可用，已使用本地判断：${error.message}`;
    return fallback;
  }
}

function localObserve(payload) {
  const title = String(payload.active_window_title || "");
  const processName = String(payload.active_process || "");
  const text = `${title}`.toLowerCase();
  const blockedWords = ["error", "failed", "exception", "traceback", "错误", "失败", "无法", "卡住", "blocked"];
  const blocked = Number(payload.same_context_minutes || 0) >= config.blockedCheckMinutes || blockedWords.some((word) => text.includes(word));

  return {
    summary: title ? `你大概率正在使用 ${processName || "某个程序"}，当前窗口是「${title}」。` : "当前没有识别到明确的活动窗口。",
    blocked,
    message: blocked ? "看起来你可能停在同一个上下文里一段时间了，要不要说说卡在哪里？" : "",
    source: "local"
  };
}

function appendMemory(observation) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const day = localDay();
  const jsonlPath = path.join(MEMORY_DIR, `${day}.jsonl`);
  const mdPath = path.join(MEMORY_DIR, `${day}.md`);
  const jsonLine = JSON.stringify(observation);
  const timePart = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const markdownLine = `- ${timePart} [${observation.active_process || "未知进程"}] ${observation.active_window_title || "未知窗口"}: ${observation.summary || "正在观察，暂未形成摘要。"}${observation.blocked ? "，可能遇到阻碍" : ""}`;

  fs.appendFileSync(jsonlPath, `${jsonLine}\n`, "utf8");
  if (!fs.existsSync(mdPath)) fs.writeFileSync(mdPath, `# ${day} 电脑记忆\n\n`, "utf8");
  fs.appendFileSync(mdPath, `${markdownLine}\n`, "utf8");

  return { day, jsonlPath, mdPath, jsonLine, markdownLine };
}

function appendChatMemory(userText, assistantText) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const day = localDay();
  const jsonlPath = path.join(MEMORY_DIR, `${day}.jsonl`);
  const mdPath = path.join(MEMORY_DIR, `${day}.md`);
  const payload = {
    timestamp: new Date().toISOString(),
    type: "chat",
    user_text: userText,
    assistant_text: assistantText
  };
  const jsonLine = JSON.stringify(payload);
  const timePart = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const markdownLine = `- ${timePart} 对话: 你说「${userText}」；助手回应「${assistantText}」`;

  fs.appendFileSync(jsonlPath, `${jsonLine}\n`, "utf8");
  if (!fs.existsSync(mdPath)) fs.writeFileSync(mdPath, `# ${day} 电脑记忆\n\n`, "utf8");
  fs.appendFileSync(mdPath, `${markdownLine}\n`, "utf8");

  return { day, jsonlPath, mdPath, jsonLine, markdownLine };
}

async function syncMemory(write, observation) {
  if (!config.tunnelBaseUrl) return "记忆隧穿：未填写地址";

  const payload = {
    client: { hostname: os.hostname() },
    date: write.day,
    latest_observation: observation || null,
    latest_json_line: write.jsonLine || "",
    latest_markdown_line: write.markdownLine || "",
    files: [
      { name: path.basename(write.mdPath), kind: "markdown", content: readText(write.mdPath) },
      { name: path.basename(write.jsonlPath), kind: "jsonl", content: readText(write.jsonlPath) }
    ]
  };

  try {
    let response = await postJson(config.memoryEndpoint || "/memory/sync", payload);
    if (response.status === 404 && config.memoryEndpoint !== "/memory") response = await postJson("/memory", payload);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return `记忆隧穿：已同步 ${write.day}`;
  } catch (error) {
    return `记忆隧穿：同步失败：${error.message}`;
  }
}

async function postJson(endpoint, body) {
  const url = new URL(endpoint.startsWith("/") ? endpoint : `/${endpoint}`, config.tunnelBaseUrl);
  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const requestBody = JSON.stringify(body);
  headers["Content-Length"] = Buffer.byteLength(requestBody);
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
      method: "POST",
      headers,
        timeout: 12000
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            statusText: response.statusMessage,
            json: async () => (raw ? JSON.parse(raw) : {})
          });
        });
      }
    );

    request.on("timeout", () => request.destroy(new Error("请求超时")));
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

async function handleChat(text) {
  let reply = "我先把这条反馈写进今天的记忆里。OpenClaw 接上后，这里会返回它的建议。";
  if (config.tunnelBaseUrl) {
    try {
      const response = await postJson("/chat", { message: text, last_observation: lastObservation });
      const data = await response.json();
      reply = String(data.reply || "OpenClaw 已收到。");
    } catch (error) {
      reply = `OpenClaw 暂时没有响应，我已记录你的输入。错误：${error.message}`;
    }
  }

  const write = appendChatMemory(text, reply);
  syncMemory(write, lastObservation).then((message) => publishState({ syncMessage: message }));
  showToast("屏幕记忆助手", reply);
  return reply;
}

function maybeNotify(observation) {
  const now = Date.now();
  if (now - lastNotifyAt < config.notifyIntervalMinutes * 60000) return;
  lastNotifyAt = now;
  showToast("电脑记忆已更新", observation.summary.slice(0, 160));
}

function maybeAskBlocked(observation) {
  const now = Date.now();
  if (!observation.blocked || now - lastBlockPromptAt < config.blockedCheckMinutes * 60000) return;
  lastBlockPromptAt = now;
  createChatWindow(observation.metadata.message || "看起来你可能遇到了阻碍，要不要说说卡在哪里？");
}

function createChatWindow(prompt) {
  if (chatWindow && !chatWindow.isDestroyed()) {
    showToast("屏幕记忆助手", prompt);
    chatWindow.focus();
    return;
  }

  showToast("屏幕记忆助手", prompt);
  chatWindow = new BrowserWindow({
    width: 460,
    height: 118,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--prompt=${encodeURIComponent(prompt)}`]
    }
  });
  chatWindow.loadFile(path.join(__dirname, "chat", "chat.html"));
  chatWindow.once("ready-to-show", () => {
    positionWindow(chatWindow, "bottom-right", 18, true);
    chatWindow.show();
  });
  chatWindow.on("closed", () => {
    chatWindow = null;
  });
}

function showToast(title, message) {
  if (toastWindow && !toastWindow.isDestroyed()) {
    toastWindow.close();
  }

  toastWindow = new BrowserWindow({
    width: 386,
    height: 106,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const query = new URLSearchParams({
    title: title || "消息",
    message: message || ""
  });
  toastWindow.loadFile(path.join(__dirname, "toast", "toast.html"), { query: Object.fromEntries(query) });
  toastWindow.once("ready-to-show", () => {
    positionWindow(toastWindow, "top-right", 18);
    if (toastWindow && !toastWindow.isDestroyed()) {
      try {
        toastWindow.showInactive();
      } catch (e) {
        toastWindow.show();
      }
    }
  });
  toastWindow.on("closed", () => {
    toastWindow = null;
  });
}

function positionWindow(window, corner, margin = 18, nearCursor = false) {
  if (!window || window.isDestroyed()) return;
  const display = nearCursor ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) : screen.getPrimaryDisplay();
  const area = display.workArea;
  const current = window.getBounds();
  const width = Math.min(current.width, Math.max(360, area.width - margin * 2));
  const height = Math.min(current.height, Math.max(80, area.height - margin * 2));
  const x = area.x + area.width - width - margin;
  const y = corner === "top-right" ? area.y + margin : area.y + area.height - height - margin;
  window.setBounds({
    x: Math.max(area.x + margin, x),
    y: Math.max(area.y + margin, y),
    width,
    height
  });
}

function getAnchoredBounds(preferredWidth, preferredHeight, corner, margin = 18) {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(preferredWidth, Math.max(360, area.width - margin * 2));
  const height = Math.min(preferredHeight, Math.max(80, area.height - margin * 2));
  return {
    x: area.x + area.width - width - margin,
    y: corner === "top-right" ? area.y + margin : area.y + area.height - height - margin,
    width,
    height
  };
}

function setMainWindowMode(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const height = mode === "settings" ? 168 : 108;
  const bounds = getAnchoredBounds(760, height, "bottom-right", 18);
  mainWindow.setMinimumSize(520, mode === "settings" ? 148 : 92);
  mainWindow.setBounds(bounds, true);
}

function toggleMainWindowCollapse(collapsed) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  
  if (collapsed) {
    // 收起到只显示宠物
    const petSize = 92;
    mainWindow.setMinimumSize(92, 92);
    mainWindow.setMaximumSize(92, 92);
    const x = area.x + area.width - petSize - 18;
    const y = area.y + area.height - petSize - 18;
    mainWindow.setBounds({ x, y, width: petSize, height: petSize }, true);
  } else {
    // 展开回原来大小
    mainWindow.setMinimumSize(92, 92);
    mainWindow.setMaximumSize(0, 0); // 移除最大限制
    const bounds = getAnchoredBounds(760, 108, "bottom-right", 18);
    mainWindow.setBounds(bounds, true);
  }
}

function publishState(partial) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:update", getState(partial));
  }
}

function getState(extra = {}) {
  return {
    config: publicConfig(),
    observation: lastObservation,
    statusMessage: lastObservation ? `运行中：${lastObservation.timestamp}` : "正在启动",
    syncMessage: config.tunnelBaseUrl ? "记忆隧穿：等待下一次写入后同步" : "记忆隧穿：未填写地址",
    memoryDir: MEMORY_DIR,
    ...extra
  };
}

function publicConfig() {
  return {
    tunnelBaseUrl: config.tunnelBaseUrl,
    observeIntervalSeconds: config.observeIntervalSeconds,
    memoryEndpoint: config.memoryEndpoint
  };
}

function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(nextConfig) {
  config = { ...config, ...nextConfig, tunnelBaseUrl: String(nextConfig.tunnelBaseUrl || "").trim().replace(/\/+$/, "") };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  startObserver();
  return publicConfig();
}

function localDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

ipcMain.handle("state:get", () => getState());
ipcMain.handle("config:saveTunnel", (_event, tunnelBaseUrl) => {
  const next = saveConfig({ tunnelBaseUrl });
  publishState({ syncMessage: tunnelBaseUrl ? "隧穿地址已保存" : "记忆隧穿：未填写地址" });
  return next;
});
ipcMain.handle("memory:syncToday", async () => {
  const day = localDay();
  const write = {
    day,
    jsonlPath: path.join(MEMORY_DIR, `${day}.jsonl`),
    mdPath: path.join(MEMORY_DIR, `${day}.md`),
    jsonLine: "",
    markdownLine: ""
  };
  if (!fs.existsSync(write.mdPath)) fs.writeFileSync(write.mdPath, `# ${day} 电脑记忆\n\n`, "utf8");
  if (!fs.existsSync(write.jsonlPath)) fs.writeFileSync(write.jsonlPath, "", "utf8");
  const message = await syncMemory(write, lastObservation);
  publishState({ syncMessage: message });
  return message;
});
ipcMain.handle("chat:submit", async (_event, text) => handleChat(String(text || "")));
ipcMain.handle("chat:close", () => {
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.close();
});
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:hide", () => mainWindow?.hide());
ipcMain.handle("window:close", () => app.quit());
ipcMain.handle("window:setMode", (_event, mode) => setMainWindowMode(mode));
ipcMain.handle("window:toggleCollapse", (_event, collapsed) => toggleMainWindowCollapse(collapsed));
ipcMain.handle("memory:openFolder", () => shell.openPath(MEMORY_DIR));
ipcMain.handle("debug:testBlockedPopup", () => createChatWindow("看起来你可能遇到了阻碍，要不要说说卡在哪里？"));
