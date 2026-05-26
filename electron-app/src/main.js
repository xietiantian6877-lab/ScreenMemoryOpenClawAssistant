const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, dialog, desktopCapturer, globalShortcut, net } = require("electron");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const os = require("os");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const MEMORY_DIR = path.join(DATA_DIR, "memory");
const PACKAGES_DIR = path.join(DATA_DIR, "memory_packages");
const CONFIG_PATH = path.join(DATA_DIR, "electron-config.json");
const ROOT_CONFIG_PATH = path.join(PROJECT_ROOT, "config.toml");

const DEFAULT_CONFIG = {
  tunnelBaseUrl: "",
  apiKey: "",
  observeIntervalSeconds: 60,
  observeIntervalMinSeconds: 10,
  observeIntervalMaxSeconds: 60,
  notifyIntervalMinutes: 60,
  blockedCheckMinutes: 6,
  memoryEndpoint: "/memory/sync",
  directModelProvider: "OpenAI",
  directBaseUrl: "https://fast.allincoding.cc",
  directApiKey: "",
  directModel: "gpt-5.5",
  directReviewModel: "gpt-5.4",
  directReasoningEffort: "xhigh",
  directWireApi: "responses",
  disableResponseStorage: true,
  networkAccess: "enabled",
  windowsWslSetupAcknowledged: true,
  directTimeoutMs: 60000,
  modelContextWindow: 1000000,
  modelAutoCompactTokenLimit: 900000,
  sendScreenshotsToModel: false,
  buddyDefaultMode: "cursor",
  companionMode: "watch",
  proactiveGuidance: false,
  casualChat: true
};

const TYPEWRITER_WIDTH = 300;
const TYPEWRITER_HEIGHT = 112;
const TYPEWRITER_POINTER_PAD = 18;
const TYPEWRITER_MAX_WIDTH = 540;
const TYPEWRITER_MAX_HEIGHT_RATIO = 0.58;

let mainWindow = null;
let chatWindow = null;
let toastWindow = null;
let typewriterWindow = null;
let cursorBuddyWindow = null;
let summonWindow = null;
let cursorBuddyTimer = null;
let typewriterFollowTimer = null;
let cursorBuddyHideTimer = null;
let cursorBuddyMode = "cursor";
let cursorBuddyPoint = null;
let tray = null;
let observeTimer = null;
let config = loadConfig();
let lastObservation = null;
let lastContextKey = "";
let contextStartedAt = Date.now();
let lastNotifyAt = 0;
let lastCasualChatAt = 0;
let lastBlockPromptAt = 0;
let lastSyncMessage = "";
let lastPackageMessage = "";
let cursorProbeProcess = null;
let cursorProbeBuffer = "";
let isIBeamActive = false;

app.whenReady().then(() => {
  app.setAppUserModelId("ScreenMemory.OpenClawAssistant");
  setupCursorDetection();
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  createMainWindow();
  createTray();
  registerShortcuts();
  startObserver();
});

app.on("window-all-closed", () => {
  stopObserver();
  stopCursorBuddy();
  stopCursorDetection();
  globalShortcut.unregisterAll();
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
    icon: iconPath(),
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
  observeOnce({ light: true });
  scheduleNextObserve();
}

function stopObserver() {
  if (observeTimer) clearTimeout(observeTimer);
  observeTimer = null;
}

function scheduleNextObserve() {
  const minSeconds = Math.max(5, Number(config.observeIntervalMinSeconds || 10));
  const maxSeconds = Math.max(minSeconds, Number(config.observeIntervalMaxSeconds || config.observeIntervalSeconds || 60));
  const nextSeconds = minSeconds + Math.random() * (maxSeconds - minSeconds);
  observeTimer = setTimeout(async () => {
    await observeOnce({ light: true });
    scheduleNextObserve();
  }, Math.round(nextSeconds * 1000));
}

async function observeOnce(options = {}) {
  try {
    const active = await getActiveWindowInfo();
    const lightMode = options.light || config.companionMode === "watch";
    const screenshot = !lightMode && config.sendScreenshotsToModel ? await capturePrimaryScreenDataUrl() : "";
    const contextKey = `${active.process}|${active.title}`;
    const now = Date.now();
    if (contextKey !== lastContextKey) {
      lastContextKey = contextKey;
      contextStartedAt = now;
    }

    const sameContextMinutes = Number(((now - contextStartedAt) / 60000).toFixed(2));
    const recentMemory = buildRecentMemoryContext(40);
    const payload = {
      active_window_title: active.title,
      active_process: active.process,
      screenshot_data_url: screenshot,
      same_context_minutes: sameContextMinutes,
      recent_memory: recentMemory,
      language: "zh-CN"
    };

    const result = lightMode ? localObserveReadable(payload) : await observeWithOpenClaw(payload);
    const observation = {
      timestamp: new Date().toISOString(),
      active_window_title: active.title,
      active_process: active.process,
      summary: result.summary,
      blocked: result.blocked,
      source: result.source,
      metadata: {
        same_context_minutes: sameContextMinutes,
        message: result.message || "",
        model: result.model || "",
        confidence: result.confidence || ""
      }
    };

    lastObservation = observation;
    const write = appendMemory(observation);
    publishState({ observation });
    syncMemory(write, observation).then((message) => {
      lastSyncMessage = message;
      updateTray();
      publishState({ syncMessage: message });
    });
    maybeNotify(observation);
    maybeAskBlocked(observation);
    maybeCasualChat(observation);
    updateTaskbarOverlay(observation);
    updateTray();
  } catch (error) {
    updateTaskbarOverlay(null, true);
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
  if (directModelEnabled()) {
    return observeWithDirectModel(payload);
  }
  if (!config.tunnelBaseUrl) return localObserveReadable(payload);

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
    const fallback = localObserveReadable(payload);
    fallback.message = `OpenClaw 暂不可用，已使用本地判断：${error.message}`;
    return fallback;
  }
}

function localObserveReadable(payload) {
  const title = String(payload.active_window_title || "");
  const processName = String(payload.active_process || "");
  const text = `${title}`.toLowerCase();
  const troubleWords = ["不会", "怎么", "教程", "设置", "权限", "配置", "登录", "向导", "help", "docs", "guide", "setup", "wizard"];
  const errorWords = ["error", "failed", "exception", "traceback", "错误", "失败", "无法", "卡住", "blocked"];
  const stayedLong = Number(payload.same_context_minutes || 0) >= config.blockedCheckMinutes;
  const blocked = stayedLong || troubleWords.some((word) => text.includes(word)) || errorWords.some((word) => text.includes(word));
  const hint = inferNextStepHint(title, processName);
  return {
    summary: title ? `你正在使用 ${processName || "某个程序"}，当前窗口是「${title}」。${hint ? ` 估计下一步：${hint}` : ""}` : "当前没有识别到明确的活动窗口。",
    blocked,
    message: blocked ? (hint ? `我猜你可能不确定下一步：${hint}` : "我猜你可能不确定下一步怎么操作，要不要我根据当前窗口帮你拆一下？") : "",
    source: "local"
  };
}

function inferNextStepHint(title, processName) {
  const text = `${processName} ${title}`.toLowerCase();
  if (text.includes("chrome") || text.includes("edge") || text.includes("browser")) return "先确认页面里的主要按钮、表单或错误提示，再按当前任务目标继续。";
  if (text.includes("code") || text.includes("cursor") || text.includes("visual studio")) return "先看终端/问题面板的最后一条提示，再打开对应文件修改。";
  if (text.includes("powershell") || text.includes("terminal") || text.includes("cmd")) return "先看最后一行输出，如果是等待输入就输入下一条命令，如果报错就从第一条错误开始处理。";
  if (text.includes("settings") || text.includes("设置")) return "先找到与当前目标同名的设置项，改完后保存或返回上一层确认状态。";
  return "";
}

async function observeWithDirectModel(payload) {
  const system = [
    "你是 Windows 上贴在鼠标旁边的 Clicky 风格工作学习伙伴。",
    "这里的“用户卡住”指用户不会操作、不知道下一步该点哪里或怎么继续，不只是程序报错。",
    "请根据当前活动窗口、进程、停留时间、可选截图和已有上下文，估算用户正在工作或学习什么以及下一步怎么操作。",
    "不要编造键盘快捷键；除非截图或窗口文本里明确出现快捷键，否则优先描述按钮、菜单、输入框、文件名或可见文字。",
    "只返回 JSON，格式为 {\"summary\":\"...\",\"blocked\":false,\"message\":\"...\",\"confidence\":\"...\"}。",
    "summary 写一条简短中文记忆摘要；如果可能不会操作、停留太久、或适合主动指导，blocked 为 true，message 给一句像老师一样具体的下一步建议。",
    "message 要短、可执行，优先告诉用户该看哪里、点哪里、改哪里或如何拆解任务。"
  ].join("\n");
  const userText = [
    `活动进程：${payload.active_process || "未知"}`,
    `窗口标题：${payload.active_window_title || "未知"}`,
    `同一上下文停留分钟：${payload.same_context_minutes || 0}`,
    "",
    getScreenGeometryText(),
    "",
    "今日近期记忆：",
    payload.recent_memory || "暂无",
    "",
    "如果用户可能不知道下一步怎么操作，message 给一句很短、具体、可执行的建议；否则 message 为空。"
  ].join("\n");

  try {
    const data = await callOpenAIResponses({
      model: config.directReviewModel || config.directModel,
      input: buildResponsesInput(system, userText, payload.screenshot_data_url)
    });
    const parsed = parseJsonFromModel(extractResponseText(data));
    return {
      summary: String(parsed.summary || localObserveReadable(payload).summary),
      blocked: Boolean(parsed.blocked),
      message: String(parsed.message || ""),
      confidence: String(parsed.confidence || ""),
      source: "openai-direct",
      model: config.directReviewModel || config.directModel
    };
  } catch (error) {
    const fallback = localObserveReadable(payload);
    fallback.message = `OpenAI 直连暂不可用，已使用本地判断：${formatDirectModelError(error)}`;
    fallback.source = "local";
    return fallback;
  }
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

function ensureDayFiles(day) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const jsonlPath = path.join(MEMORY_DIR, `${day}.jsonl`);
  const mdPath = path.join(MEMORY_DIR, `${day}.md`);
  if (!fs.existsSync(mdPath)) fs.writeFileSync(mdPath, `# ${day} 电脑记忆\n\n`, "utf8");
  if (!fs.existsSync(jsonlPath)) fs.writeFileSync(jsonlPath, "", "utf8");
  return { day, jsonlPath, mdPath, jsonLine: "", markdownLine: "" };
}

function createMemoryPackage(scope = "today") {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  const days = selectMemoryDays(scope);
  if (!days.length) {
    const today = localDay();
    ensureDayFiles(today);
    days.push(today);
  }

  const files = [];
  for (const day of days) {
    for (const kind of ["md", "jsonl"]) {
      const filePath = path.join(MEMORY_DIR, `${day}.${kind}`);
      files.push({
        name: `${day}.${kind}`,
        kind: kind === "md" ? "markdown" : "jsonl",
        content: readText(filePath)
      });
    }
  }

  const packageData = {
    format: "screen-memory-openclaw-package",
    version: 1,
    exported_at: new Date().toISOString(),
    scope,
    source: {
      hostname: os.hostname(),
      platform: process.platform,
      app: "ScreenMemoryOpenClawAssistant"
    },
    config: {
      model_provider: config.directModelProvider,
      model: config.directModel,
      review_model: config.directReviewModel,
      model_reasoning_effort: config.directReasoningEffort,
      disable_response_storage: config.disableResponseStorage,
      network_access: config.networkAccess,
      windows_wsl_setup_acknowledged: config.windowsWslSetupAcknowledged,
      model_context_window: config.modelContextWindow,
      model_auto_compact_token_limit: config.modelAutoCompactTokenLimit,
      model_providers: {
        OpenAI: {
          name: "OpenAI",
          base_url: config.directBaseUrl,
          wire_api: config.directWireApi,
          requires_openai_auth: true
        }
      }
    },
    days,
    latest_observation: lastObservation,
    digest_markdown: buildPackageDigest(days),
    files
  };
  const fileName = `memory-pack-${scope}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const packagePath = path.join(PACKAGES_DIR, fileName);
  fs.writeFileSync(packagePath, JSON.stringify(packageData, null, 2), "utf8");
  lastPackageMessage = `已打包 ${days.length} 天记忆`;
  updateTray();
  publishState({ packageMessage: lastPackageMessage });
  return { ok: true, path: packagePath, message: lastPackageMessage, days };
}

function selectMemoryDays(scope) {
  const allDays = listMemoryDays();
  if (scope === "today") return allDays.includes(localDay()) ? [localDay()] : [];
  if (scope === "week") return allDays.slice(-7);
  return allDays;
}

function listMemoryDays() {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  return Array.from(
    new Set(
      fs
        .readdirSync(MEMORY_DIR)
        .map((name) => name.match(/^(\d{4}-\d{2}-\d{2})\.(md|jsonl)$/)?.[1])
        .filter(Boolean)
    )
  ).sort();
}

function buildPackageDigest(days) {
  return days
    .map((day) => {
      const md = readText(path.join(MEMORY_DIR, `${day}.md`)).trim();
      return md || `# ${day} 电脑记忆\n\n暂无内容`;
    })
    .join("\n\n---\n\n");
}

async function importMemoryPackage() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择记忆包",
    properties: ["openFile"],
    filters: [{ name: "OpenClaw 记忆包", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, message: "已取消导入" };

  const packagePath = result.filePaths[0];
  const data = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (data.format !== "screen-memory-openclaw-package" || !Array.isArray(data.files)) {
    throw new Error("不是有效的 OpenClaw 记忆包");
  }

  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  for (const file of data.files) {
    const safeName = path.basename(String(file.name || ""));
    if (!/^\d{4}-\d{2}-\d{2}\.(md|jsonl)$/.test(safeName)) continue;
    const target = path.join(MEMORY_DIR, safeName);
    fs.writeFileSync(target, String(file.content || ""), "utf8");
  }
  lastPackageMessage = `已导入 ${data.days?.length || 0} 天记忆`;
  updateTray();
  publishState({ packageMessage: lastPackageMessage });
  return { ok: true, path: packagePath, message: lastPackageMessage };
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

function directModelEnabled() {
  return config.directModelProvider === "OpenAI" && Boolean(config.directBaseUrl) && Boolean(config.directApiKey);
}

async function chatWithDirectModel(text) {
  const memory = buildRecentMemoryContext(80);
  const current = lastObservation ? JSON.stringify(lastObservation, null, 2) : "暂无观察";
  const system = [
    "你是一个能看懂 Windows 当前任务上下文的 Clicky 风格桌面伙伴。",
    "用户卡住通常是不会操作、不知道下一步，而不只是报错。",
    "请像工作学习教练一样，结合当前窗口和今日记忆，给出简短、具体、可执行的下一步建议。",
    "不要编造键盘快捷键；除非当前观察或截图明确出现快捷键，否则优先给鼠标可操作路径。",
    "如果能根据截图确定要指的位置，可以在回复末尾附加 [POINT:x,y:label:screen0]，x/y 必须使用真实 Windows 屏幕坐标，不是缩略图坐标。用户可见回复里不要解释这个标记。",
    "如果需要用户补充信息，只问一个问题。"
  ].join("\n");
  const userText = [
    `用户输入：${text}`,
    "",
    getScreenGeometryText(),
    "",
    "当前观察：",
    current,
    "",
    "今日近期记忆：",
    memory || "暂无"
  ].join("\n");
  const data = await callOpenAIResponses({
    model: config.directModel,
    input: buildResponsesInput(system, userText, config.sendScreenshotsToModel ? await capturePrimaryScreenDataUrl() : "")
  });
  return extractResponseText(data) || "我看到了。建议先确认当前窗口里的主要提示，再按目标继续下一步。";
}

function buildResponsesInput(systemText, userText, screenshotDataUrl = "") {
  const content = [{ type: "input_text", text: userText }];
  if (screenshotDataUrl) {
    content.push({ type: "input_image", image_url: screenshotDataUrl });
  }
  return [
    { role: "system", content: [{ type: "input_text", text: systemText }] },
    { role: "user", content }
  ];
}

function getScreenGeometryText() {
  const displays = screen.getAllDisplays();
  const lines = displays.map((display, index) => {
    const width = display.size?.width || display.bounds.width;
    const height = display.size?.height || display.bounds.height;
    const scale = Math.min(1, 1600 / Math.max(width, 1));
    const imageWidth = Math.max(1, Math.round(width * scale));
    const imageHeight = Math.max(1, Math.round(height * scale));
    return `screen${index}: bounds=(${display.bounds.x},${display.bounds.y},${display.bounds.width},${display.bounds.height}), image=${imageWidth}x${imageHeight}, point坐标请输出真实Windows屏幕坐标`;
  });
  return ["屏幕坐标信息：", ...lines].join("\n");
}

async function callOpenAIResponses(body) {
  const wireApi = normalizeWireApi(config.directWireApi);
  if (wireApi === "chat") return callOpenAIChatCompletions(body);
  if (wireApi === "auto") return callOpenAIAuto(body);
  return callOpenAIResponsesOnly(body);
}

async function callOpenAIAuto(body) {
  try {
    return await callOpenAIResponsesOnly(body);
  } catch (responsesError) {
    if (isConnectionReset(responsesError)) throw responsesError;
    try {
      return await callOpenAIChatCompletions(body);
    } catch (chatError) {
      try {
        return await callOpenAIChatCompletions(body, { textOnly: true });
      } catch (compatError) {
        compatError.message = `Responses 失败：${responsesError.message}; Chat Completions 失败：${chatError.message}; 兼容 Chat 失败：${compatError.message}`;
        throw compatError;
      }
    }
  }
}

async function callOpenAIResponsesOnly(body) {
  const url = buildOpenAIUrl("/responses");
  const effort = normalizeReasoningEffort(config.directReasoningEffort);
  const normalized = splitResponsesInput(body.input);
  const payload = {
    model: body.model || config.directModel,
    input: normalized.input,
    reasoning: { effort },
    store: !config.disableResponseStorage
  };
  if (normalized.instructions) payload.instructions = normalized.instructions;
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.directApiKey}`
    },
    body: JSON.stringify(payload),
    timeoutMs: config.directTimeoutMs || 60000
  };
  try {
    return await requestJsonWithRetry(url, requestOptions);
  } catch (error) {
    if (isInvalidArgumentError(error)) {
      const compatPayload = {
        model: payload.model,
        input: textOnlyResponsesInput(normalized.input)
      };
      if (normalized.instructions) compatPayload.instructions = normalized.instructions;
      return requestJsonWithRetry(url, { ...requestOptions, body: JSON.stringify(compatPayload) });
    }
    if (effort !== "xhigh") throw error;
    if (isUnsupportedResponsesError(error)) throw error;
    const fallbackPayload = { ...payload, reasoning: { effort: "high" } };
    return requestJsonWithRetry(url, { ...requestOptions, body: JSON.stringify(fallbackPayload) });
  }
}

function splitResponsesInput(input) {
  const messages = Array.isArray(input) ? input : [{ role: "user", content: [{ type: "input_text", text: String(input || "") }] }];
  const instructions = messages
    .filter((message) => message.role === "system")
    .flatMap((message) => Array.isArray(message.content) ? message.content : [{ type: "input_text", text: String(message.content || "") }])
    .map((part) => String(part.text || part.value || ""))
    .filter(Boolean)
    .join("\n");
  return {
    instructions,
    input: messages.filter((message) => message.role !== "system")
  };
}

async function callOpenAIChatCompletions(body, options = {}) {
  const payload = {
    model: body.model || config.directModel,
    messages: responsesInputToChatMessages(body.input, options),
    stream: false
  };
  const requestOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.directApiKey}`
    },
    body: JSON.stringify(payload),
    timeoutMs: config.directTimeoutMs || 60000
  };
  return requestJsonWithRetry(buildOpenAIUrl("/chat/completions"), requestOptions);
}

function responsesInputToChatMessages(input, options = {}) {
  return (Array.isArray(input) ? input : [{ role: "user", content: [{ type: "input_text", text: String(input || "") }] }]).map((message) => {
    const role = message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user";
    const parts = Array.isArray(message.content) ? message.content : [{ type: "input_text", text: String(message.content || "") }];
    const hasImage = parts.some((part) => part.type === "input_image" && part.image_url);
    if (!hasImage || options.textOnly) {
      return {
        role,
        content: parts
          .filter((part) => part.type !== "input_image")
          .map((part) => String(part.text || part.value || ""))
          .filter(Boolean)
          .join("\n")
      };
    }
    return {
      role,
      content: parts
        .map((part) => {
          if (part.type === "input_image" && part.image_url) return { type: "image_url", image_url: { url: part.image_url } };
          return { type: "text", text: String(part.text || part.value || "") };
        })
        .filter((part) => part.type === "image_url" || part.text)
    };
  });
}

function textOnlyResponsesInput(input) {
  return (Array.isArray(input) ? input : [{ role: "user", content: [{ type: "input_text", text: String(input || "") }] }]).map((message) => ({
    role: message.role || "user",
    content: (Array.isArray(message.content) ? message.content : [{ type: "input_text", text: String(message.content || "") }])
      .filter((part) => part.type !== "input_image")
      .map((part) => ({ type: "input_text", text: String(part.text || part.value || "") }))
      .filter((part) => part.text)
  }));
}

function buildOpenAIUrl(endpoint) {
  const base = String(config.directBaseUrl || "").replace(/\/+$/, "");
  const normalizedEndpoint = `/${String(endpoint || "").replace(/^\/+/, "")}`;
  if (/\/v1$/i.test(base)) return new URL(`${base}${normalizedEndpoint}`);
  return new URL(`${base}/v1${normalizedEndpoint}`);
}

function normalizeWireApi(value) {
  const wireApi = String(value || "responses").toLowerCase().replace(/[-_\s]+/g, "_");
  if (["chat", "chat_completions", "completions"].includes(wireApi)) return "chat";
  if (["auto", "both", "compat"].includes(wireApi)) return "auto";
  return "responses";
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "high").toLowerCase();
  if (["minimal", "low", "medium", "high", "xhigh", "extra_high"].includes(effort)) return effort;
  return "high";
}

function extractResponseText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text.trim();
  const chatText = data.choices?.[0]?.message?.content;
  if (typeof chatText === "string") return chatText.trim();
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.value === "string") parts.push(content.value);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonFromModel(text) {
  const source = String(text || "").trim();
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    const match = source.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function formatDirectModelError(error) {
  const message = String(error?.message || error || "");
  if (message.includes("ECONNRESET")) {
    return "连接被服务端重置了。密钥已保存时，这通常是 base_url 服务、网络代理或当前模型/参数不可用；请稍后重试，或换一个可用的 base_url/model。";
  }
  if (message.includes("401") || message.toLowerCase().includes("unauthorized")) {
    return "密钥认证失败，请重新保存 OpenAI API key。";
  }
  if (message.includes("404")) {
    return "接口路径或模型不可用，请检查 base_url、wire_api 和 model。";
  }
  return `错误：${message}`;
}

async function requestJsonWithRetry(url, options, retries = 1) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestJson(url, options);
    } catch (error) {
      lastError = error;
      if (!isConnectionReset(error) || attempt >= retries) break;
      await delay(450);
    }
  }
  throw lastError;
}

function isConnectionReset(error) {
  const message = String(error?.message || error || "");
  return error?.code === "ECONNRESET" || message.includes("ECONNRESET");
}

function isInvalidArgumentError(error) {
  const message = String(error?.message || error || "");
  return message.includes("ERR_INVALID_ARGUMENT") || message.includes("400") || message.toLowerCase().includes("invalid argument");
}

function isUnsupportedResponsesError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("use /v1/responses") || message.includes("/v1/chat/completions is not supported") || message.includes("responses is not supported");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, options) {
  if (net && app.isReady()) return requestJsonWithElectronNet(url, options);
  const target = url instanceof URL ? url : new URL(url);
  const client = target.protocol === "https:" ? https : http;
  const body = options.body || "";
  const headers = { ...(options.headers || {}) };
  if (body && !headers["Content-Length"]) headers["Content-Length"] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    const request = client.request(
      target,
      {
        method: options.method || "GET",
        headers,
        timeout: options.timeoutMs || 60000
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`${response.statusCode} ${response.statusMessage}: ${raw.slice(0, 300)}`));
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("请求超时")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function requestJsonWithElectronNet(url, options) {
  const target = url instanceof URL ? url.toString() : String(url);
  const body = options.body || "";
  const headers = { ...(options.headers || {}) };
  delete headers["Content-Length"];
  delete headers["content-length"];

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method || "GET",
      url: target,
      redirect: "follow"
    });
    for (const [key, value] of Object.entries(headers)) {
      request.setHeader(key, String(value));
    }
    const timer = setTimeout(() => request.abort(), options.timeoutMs || 60000);
    request.on("response", (response) => {
      let raw = "";
      response.on("data", (chunk) => {
        raw += chunk.toString("utf8");
      });
      response.on("end", () => {
        clearTimeout(timer);
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`${response.statusCode} ${response.statusMessage}: ${raw.slice(0, 300)}`));
          return;
        }
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("abort", () => {
      clearTimeout(timer);
      reject(new Error("请求超时"));
    });
    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    if (body) request.write(body);
    request.end();
  });
}

function buildRecentMemoryContext(maxLines = 80) {
  const todayPath = path.join(MEMORY_DIR, `${localDay()}.md`);
  const text = readText(todayPath);
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(-maxLines)
    .join("\n");
}

function extractPointCommands(reply) {
  const points = [];
  const text = String(reply || "").replace(/\[POINT\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*:\s*([^:\]]{0,60})\s*:\s*screen(\d+)\s*\]/gi, (_match, x, y, label, screenIndex) => {
    points.push({
      x: Number(x),
      y: Number(y),
      label: String(label || "").trim(),
      screenIndex: Number(screenIndex || 0)
    });
    return "";
  });
  return { text: text.replace(/\s{2,}/g, " ").trim(), points };
}

async function handleChat(text) {
  let reply = "我先把这条反馈写进今天的记忆里。接上 OpenClaw 或 OpenAI 直连后，这里会返回它的建议。";
  if (directModelEnabled()) {
    try {
      reply = await chatWithDirectModel(text);
    } catch (error) {
      reply = `OpenAI 直连暂时没有响应，我已记录你的输入。${formatDirectModelError(error)}`;
    }
  } else if (config.tunnelBaseUrl) {
    try {
      const response = await postJson("/chat", { message: text, last_observation: lastObservation });
      const data = await response.json();
      reply = String(data.reply || "OpenClaw 已收到。");
    } catch (error) {
      reply = `OpenClaw 暂时没有响应，我已记录你的输入。错误：${error.message}`;
    }
  }

  const write = appendChatMemory(text, reply);
  syncMemory(write, lastObservation).then((message) => {
    lastSyncMessage = message;
    updateTray();
    publishState({ syncMessage: message });
  });
  const guidance = extractPointCommands(reply);
  if (guidance.points.length) pointCursorBuddy(guidance.points[0]);
  showTypewriterNearCursor(guidance.text, {
    autoCloseMs: 18000,
    force: true,
    persist: false,
    mode: "cursor",
    showBuddy: false
  });
  return reply;
}

function maybeNotify(observation) {
  if (config.companionMode === "watch") return;
  const now = Date.now();
  if (now - lastNotifyAt < config.notifyIntervalMinutes * 60000) return;
  lastNotifyAt = now;
  showToast("电脑记忆已更新", observation.summary.slice(0, 160));
}

function maybeAskBlocked(observation) {
  if (!config.proactiveGuidance) return;
  const now = Date.now();
  if (!observation.blocked || now - lastBlockPromptAt < config.blockedCheckMinutes * 60000) return;
  lastBlockPromptAt = now;
  const prompt = observation.metadata.message || "我猜你可能不确定下一步怎么操作，要不要我根据当前窗口帮你拆一下？";
  showTypewriterNearCursor(prompt, { autoCloseMs: 12000 });
  createChatWindow(prompt);
}

function maybeCasualChat(observation) {
  if (!config.casualChat) return;
  const now = Date.now();
  if (now - lastCasualChatAt < 3 * 60000) return;
  if (Math.random() > 0.22) return;
  lastCasualChatAt = now;
  const message = casualCommentForObservation(observation);
  if (message) {
    showTypewriterNearCursor(message, {
      autoCloseMs: 9000,
      force: true,
      persist: false,
      mode: "cursor",
      showBuddy: false
    });
  }
}

function casualCommentForObservation(observation) {
  const title = String(observation?.active_window_title || "");
  const processName = String(observation?.active_process || "").toLowerCase();
  if (!title && !processName) return "";
  if (processName.includes("code") || processName.includes("cursor") || title.toLowerCase().includes("visual studio")) {
    return "我在旁边看着，你现在像是在改代码。慢慢来，别急着一次全解决。";
  }
  if (processName.includes("chrome") || processName.includes("edge") || processName.includes("browser")) {
    return "我看到你在浏览页面。需要我插话时我会轻一点，不抢屏。";
  }
  if (processName.includes("powershell") || processName.includes("terminal") || processName.includes("cmd")) {
    return "终端这边我也看着，输出有变化我会记下来。";
  }
  if (title.includes("设置") || title.toLowerCase().includes("settings")) {
    return "你在设置里转悠，我先安静看着。";
  }
  return "我在看着你的屏幕，先不指导你，就陪你工作一会儿。";
}

function createChatWindow(prompt) {
  if (chatWindow && !chatWindow.isDestroyed()) {
    positionNearCursor(chatWindow, 12);
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    ...getCursorBuddyBounds(380, 106),
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
    positionNearCursor(chatWindow, 12);
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

function showTypewriterNearCursor(message, options = {}) {
  const text = String(message || "").trim();
  if (!text) return;
  const configuredMode = normalizeBuddyMode(config.buddyDefaultMode);
  const mode = options.mode || (configuredMode === "off" && options.force ? "cursor" : configuredMode);
  if (mode === "off" && !options.force) return;
  const autoCloseMs = Math.max(2600, options.autoCloseMs || 14000);
  const persist = options.persist ?? (mode !== "off" && !options.force);
  if (mode !== "off" && options.showBuddy === true) {
    showCursorBuddy(options.mood || "speaking", persist ? 24 * 60 * 60 * 1000 : autoCloseMs, mode);
  }
  if (typewriterWindow && !typewriterWindow.isDestroyed()) {
    typewriterWindow.close();
  }
  stopTypewriterFollow();

  const bounds = mode === "corner"
    ? getCornerBuddyBounds(TYPEWRITER_WIDTH + TYPEWRITER_POINTER_PAD, TYPEWRITER_HEIGHT)
    : getCursorBuddyBounds(TYPEWRITER_WIDTH + TYPEWRITER_POINTER_PAD, TYPEWRITER_HEIGHT, { avoidIme: shouldAvoidIme(), pointerPad: TYPEWRITER_POINTER_PAD });
  typewriterWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });
  typewriterWindow.setIgnoreMouseEvents(true, { forward: true });

  const query = new URLSearchParams({
    text,
    autoCloseMs: String(persist ? 0 : options.autoCloseMs || 14000)
  });
  typewriterWindow.loadFile(path.join(__dirname, "typewriter", "typewriter.html"), { query: Object.fromEntries(query) });
  typewriterWindow.once("ready-to-show", () => {
    if (typewriterWindow && !typewriterWindow.isDestroyed()) {
      if (mode === "cursor") startTypewriterFollow();
      try {
        typewriterWindow.showInactive();
      } catch {
        typewriterWindow.show();
      }
    }
  });
  typewriterWindow.on("closed", () => {
    stopTypewriterFollow();
    typewriterWindow = null;
  });
}

function getCursorBuddyBounds(preferredWidth, preferredHeight, options = {}) {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  const width = Math.min(preferredWidth, Math.max(280, area.width - 24));
  const height = Math.min(preferredHeight, Math.max(120, area.height - 24));
  const pointerPad = options.pointerPad || 0;
  const nearOffsetX = options.avoidIme ? 18 : 12;
  const nearOffsetY = options.avoidIme ? 92 : 12;
  let x = cursor.x + nearOffsetX - pointerPad;
  let y = cursor.y + nearOffsetY;
  if (x + width > area.x + area.width - 10) x = cursor.x - width - nearOffsetX + pointerPad;
  if (y + height > area.y + area.height - 10) y = cursor.y - height - (options.avoidIme ? 44 : 12);
  return {
    x: Math.max(area.x + 10, Math.min(x, area.x + area.width - width - 10)),
    y: Math.max(area.y + 10, Math.min(y, area.y + area.height - height - 10)),
    width,
    height
  };
}

function getCornerBuddyBounds(preferredWidth, preferredHeight) {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.min(preferredWidth, Math.max(280, area.width - 24));
  const height = Math.min(preferredHeight, Math.max(120, area.height - 24));
  return {
    x: area.x + area.width - width - 18,
    y: area.y + 18,
    width,
    height
  };
}

function positionNearCursor(window, margin = 12, options = {}) {
  if (!window || window.isDestroyed()) return;
  const current = window.getBounds();
  const bounds = getCursorBuddyBounds(current.width, current.height, options);
  window.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: current.width,
    height: current.height
  });
}

function resizeTypewriterWindow(bounds = {}) {
  if (!typewriterWindow || typewriterWindow.isDestroyed()) return false;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const width = typewriterWindow.getBounds().width;
  const height = Math.max(
    84,
    Math.min(Number(bounds.height || TYPEWRITER_HEIGHT), Math.floor(area.height * TYPEWRITER_MAX_HEIGHT_RATIO))
  );
  typewriterWindow.setSize(Math.round(width), Math.round(height), false);
  positionNearCursor(typewriterWindow, 12, { avoidIme: shouldAvoidIme(), pointerPad: TYPEWRITER_POINTER_PAD });
  return true;
}

function startTypewriterFollow() {
  stopTypewriterFollow();
  typewriterFollowTimer = setInterval(() => {
    if (!typewriterWindow || typewriterWindow.isDestroyed()) {
      stopTypewriterFollow();
      return;
    }
    positionNearCursor(typewriterWindow, 12, { avoidIme: shouldAvoidIme(), pointerPad: TYPEWRITER_POINTER_PAD });
  }, 0);
}

function stopTypewriterFollow() {
  if (typewriterFollowTimer) clearInterval(typewriterFollowTimer);
  typewriterFollowTimer = null;
}

function shouldAvoidIme() {
  return isIBeamCursor();
}

function setupCursorDetection() {
  if (process.platform !== "win32" || cursorProbeProcess) return;
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CursorProbe {
  [StructLayout(LayoutKind.Sequential)] public struct CURSORINFO { public int cbSize; public int flags; public IntPtr hCursor; public POINT ptScreenPos; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x; public int y; }
  [DllImport("user32.dll")] public static extern bool GetCursorInfo(out CURSORINFO pci);
  [DllImport("user32.dll")] public static extern IntPtr LoadCursor(IntPtr hInstance, int lpCursorName);
}
"@ -ErrorAction SilentlyContinue
$ibeam = [CursorProbe]::LoadCursor([IntPtr]::Zero, 32513)
$last = $null
while ($true) {
  $info = New-Object CursorProbe+CURSORINFO
  $info.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
  [void][CursorProbe]::GetCursorInfo([ref]$info)
  $active = ($info.hCursor -eq $ibeam)
  if ($active -ne $last) {
    if ($active) { [Console]::Out.WriteLine("ibeam=1") } else { [Console]::Out.WriteLine("ibeam=0") }
    [Console]::Out.Flush()
    $last = $active
  }
  Start-Sleep -Milliseconds 80
}
`;
  cursorProbeProcess = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true });
  cursorProbeProcess.stdout.on("data", (chunk) => {
    cursorProbeBuffer += chunk.toString("utf8");
    const lines = cursorProbeBuffer.split(/\r?\n/);
    cursorProbeBuffer = lines.pop() || "";
    for (const line of lines) {
      if (line.includes("ibeam=1")) isIBeamActive = true;
      if (line.includes("ibeam=0")) isIBeamActive = false;
    }
  });
  cursorProbeProcess.on("exit", () => {
    cursorProbeProcess = null;
    isIBeamActive = false;
  });
}

function stopCursorDetection() {
  if (cursorProbeProcess) {
    cursorProbeProcess.kill();
    cursorProbeProcess = null;
  }
  isIBeamActive = false;
}

function isIBeamCursor() {
  return isIBeamActive;
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
  const height = mode === "settings" ? 252 : 108;
  const bounds = getAnchoredBounds(760, height, "bottom-right", 18);
  mainWindow.setMinimumSize(520, mode === "settings" ? 232 : 92);
  mainWindow.setBounds(bounds, false);
}

function toggleMainWindowCollapse(collapsed) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  
  if (collapsed) {
    // 收起到只显示宠物，放在右下角
    const petSize = 92;
    mainWindow.setMinimumSize(92, 92);
    // 不设置最大值，让窗口可以自由调整
    const x = Math.max(area.x, area.x + area.width - petSize - 18);
    const y = Math.max(area.y, area.y + area.height - petSize - 18);
    mainWindow.setBounds({ x, y, width: petSize, height: petSize }, false);
  } else {
    // 展开回原来大小
    mainWindow.setMinimumSize(92, 92);
    const bounds = getAnchoredBounds(760, 108, "bottom-right", 18);
    mainWindow.setBounds(bounds, false);
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (!mainWindow) return;
  positionWindow(mainWindow, "bottom-right", 18);
  mainWindow.show();
  mainWindow.focus();
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const shortcuts = ["Alt+`", "Alt+Space", "CommandOrControl+Shift+Space", "F8"];
  for (const accelerator of shortcuts) {
    const ok = globalShortcut.register(accelerator, () => {
      showSummonButtonsNearCursor();
    });
    if (!ok) {
      console.warn(`${accelerator} shortcut registration failed.`);
    }
  }
}

function showSummonButtonsNearCursor() {
  if (summonWindow && !summonWindow.isDestroyed()) {
    summonWindow.close();
  }
  const bounds = getCursorBuddyBounds(216, 72);
  summonWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  summonWindow.loadFile(path.join(__dirname, "summon", "summon.html"));
  summonWindow.once("ready-to-show", () => {
    if (!summonWindow || summonWindow.isDestroyed()) return;
    try {
      summonWindow.showInactive();
    } catch {
      summonWindow.show();
    }
  });
  summonWindow.on("blur", () => {
    if (summonWindow && !summonWindow.isDestroyed()) summonWindow.close();
  });
  summonWindow.on("closed", () => {
    summonWindow = null;
  });
}

function closeSummonWindow() {
  if (summonWindow && !summonWindow.isDestroyed()) summonWindow.close();
}

function requestTypingNearCursor() {
  closeSummonWindow();
  createChatWindow("告诉我你现在想完成什么，我会按当前窗口给你下一步。");
}

function requestGuidanceNearCursor() {
  closeSummonWindow();
  const hint = buildImmediateGuidance();
  showTypewriterNearCursor(hint, { autoCloseMs: 16000, force: true, persist: false, showBuddy: false });
}

function buildImmediateGuidance() {
  if (lastObservation?.metadata?.message) return lastObservation.metadata.message;
  if (lastObservation?.summary) {
    const title = lastObservation.active_window_title || "当前窗口";
    return `我先按「${title}」来带你：看窗口里最明显的按钮、错误提示或输入框，先处理最靠近任务目标的那一项。你也可以按“打字”告诉我目标。`;
  }
  return "我还没识别到足够上下文。先把你要完成的目标打给我，我会一步一步带你操作。";
}

function createCursorBuddy() {
  if (cursorBuddyWindow && !cursorBuddyWindow.isDestroyed()) return;
  cursorBuddyWindow = new BrowserWindow({
    width: 52,
    height: 52,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });
  cursorBuddyWindow.setIgnoreMouseEvents(true, { forward: true });
  cursorBuddyWindow.loadFile(path.join(__dirname, "cursor-buddy", "cursor-buddy.html"));
  cursorBuddyWindow.once("ready-to-show", () => {
    startCursorBuddy();
  });
  cursorBuddyWindow.on("closed", () => {
    cursorBuddyWindow = null;
    stopCursorBuddy();
  });
}

function showCursorBuddy(mood = "ready", autoHideMs = 12000, mode = "cursor") {
  if (!cursorBuddyWindow || cursorBuddyWindow.isDestroyed()) {
    createCursorBuddy();
  }
  const reveal = () => {
    if (!cursorBuddyWindow || cursorBuddyWindow.isDestroyed()) return;
    cursorBuddyMode = mode;
    if (mode !== "point") cursorBuddyPoint = null;
    moveCursorBuddy(mode);
    setCursorBuddyMood(mood);
    try {
      cursorBuddyWindow.showInactive();
    } catch {
      cursorBuddyWindow.show();
    }
    if (cursorBuddyHideTimer) clearTimeout(cursorBuddyHideTimer);
    cursorBuddyHideTimer = setTimeout(hideCursorBuddy, autoHideMs);
  };
  if (cursorBuddyWindow?.webContents.isLoading()) {
    cursorBuddyWindow.once("ready-to-show", reveal);
  } else {
    reveal();
  }
}

function pointCursorBuddy(point, autoHideMs = 8000) {
  const normalized = normalizePoint(point);
  if (!normalized) return;
  cursorBuddyMode = "point";
  cursorBuddyPoint = normalized;
  if (!cursorBuddyWindow || cursorBuddyWindow.isDestroyed()) {
    createCursorBuddy();
  }
  const reveal = () => {
    if (!cursorBuddyWindow || cursorBuddyWindow.isDestroyed()) return;
    moveCursorBuddy("point");
    setCursorBuddyMood("pointing");
    try {
      cursorBuddyWindow.showInactive();
    } catch {
      cursorBuddyWindow.show();
    }
    if (cursorBuddyHideTimer) clearTimeout(cursorBuddyHideTimer);
    cursorBuddyHideTimer = setTimeout(hideCursorBuddy, autoHideMs);
  };
  if (cursorBuddyWindow?.webContents.isLoading()) {
    cursorBuddyWindow.once("ready-to-show", reveal);
  } else {
    reveal();
  }
}

function hideCursorBuddy() {
  if (cursorBuddyHideTimer) clearTimeout(cursorBuddyHideTimer);
  cursorBuddyHideTimer = null;
  if (cursorBuddyWindow && !cursorBuddyWindow.isDestroyed()) {
    cursorBuddyWindow.webContents.send("buddy:mood", "leaving");
    setTimeout(() => {
      if (cursorBuddyWindow && !cursorBuddyWindow.isDestroyed()) cursorBuddyWindow.hide();
      cursorBuddyPoint = null;
      cursorBuddyMode = "cursor";
    }, 180);
  }
}

function startCursorBuddy() {
  stopCursorBuddy();
  cursorBuddyTimer = setInterval(() => moveCursorBuddy(cursorBuddyMode || config.buddyDefaultMode || "cursor"), 0);
}

function stopCursorBuddy() {
  if (cursorBuddyTimer) clearInterval(cursorBuddyTimer);
  cursorBuddyTimer = null;
  if (cursorBuddyHideTimer) clearTimeout(cursorBuddyHideTimer);
  cursorBuddyHideTimer = null;
}

function moveCursorBuddy(mode = "cursor") {
  if (!cursorBuddyWindow || cursorBuddyWindow.isDestroyed()) return;
  if (mode === "point" && cursorBuddyPoint) {
    const bounds = getPointBuddyBounds(cursorBuddyPoint, 52, 52);
    cursorBuddyWindow.setBounds(bounds);
    return;
  }
  if (mode === "corner") {
    const bounds = getCornerBuddyBounds(52, 52);
    cursorBuddyWindow.setBounds({ x: bounds.x, y: bounds.y + 70, width: 52, height: 52 });
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const area = display.workArea;
  const size = 52;
  let x = cursor.x + 12;
  let y = cursor.y + 12;
  if (x + size > area.x + area.width - 8) x = cursor.x - size - 12;
  if (y + size > area.y + area.height - 8) y = cursor.y - size - 12;
  cursorBuddyWindow.setBounds({
    x: Math.max(area.x + 8, Math.min(x, area.x + area.width - size - 8)),
    y: Math.max(area.y + 8, Math.min(y, area.y + area.height - size - 8)),
    width: size,
    height: size
  });
}

function setCursorBuddyMood(mood) {
  if (!cursorBuddyWindow || cursorBuddyWindow.isDestroyed()) return;
  cursorBuddyWindow.webContents.send("buddy:mood", mood);
}

function normalizePoint(point) {
  if (!point) return null;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, label: String(point.label || ""), screenIndex: Number(point.screenIndex || 0) };
}

function getPointBuddyBounds(point, width, height) {
  const displays = screen.getAllDisplays();
  const display = displays[point.screenIndex] || screen.getDisplayNearestPoint({ x: point.x, y: point.y });
  const area = display.workArea;
  let x = Math.round(point.x) - 10;
  let y = Math.round(point.y) - 10;
  if (x + width > area.x + area.width - 8) x = Math.round(point.x) - width + 10;
  if (y + height > area.y + area.height - 8) y = Math.round(point.y) - height + 10;
  return {
    x: Math.max(area.x + 8, Math.min(x, area.x + area.width - width - 8)),
    y: Math.max(area.y + 8, Math.min(y, area.y + area.height - height - 8)),
    width,
    height
  };
}

function createTray() {
  if (tray) return;
  tray = new Tray(createTrayImage("#2f7df6"));
  tray.setToolTip("屏幕记忆 OpenClaw 助手");
  tray.on("click", showMainWindow);
  updateTray();
}

function updateTray() {
  if (!tray) return;
  const observed = lastObservation ? `${lastObservation.active_process || "未知"} | ${lastObservation.active_window_title || "未知窗口"}` : "等待第一次识别";
  const modelText = directModelEnabled() ? `${config.directModelProvider} ${config.directModel}` : config.tunnelBaseUrl ? "OpenClaw 隧穿" : "本地判断";
  tray.setToolTip(`屏幕记忆 OpenClaw 助手\n${modelText}\n${observed}`);
  tray.setImage(createTrayImage(lastObservation?.blocked ? "#d94841" : directModelEnabled() ? "#2f7df6" : "#7b8494"));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开助手", click: showMainWindow },
      { label: lastObservation?.blocked ? "可能不会操作" : "观察中", enabled: false },
      { label: modelText, enabled: false },
      { type: "separator" },
      { label: "打包今日记忆", click: () => createMemoryPackage("today") },
      { label: "打包最近 7 天", click: () => createMemoryPackage("week") },
      { label: "打包全部记忆", click: () => createMemoryPackage("all") },
      { label: "导入记忆包", click: () => importMemoryPackage().catch((error) => showToast("导入失败", error.message)) },
      { label: "打开记忆文件夹", click: () => shell.openPath(MEMORY_DIR) },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    ])
  );
}

function createTrayImage(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <rect width="32" height="32" rx="8" fill="${color}"/>
    <path d="M8 17c3-8 13-8 16 0" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>
    <circle cx="12" cy="14" r="2" fill="white"/>
    <circle cx="20" cy="14" r="2" fill="white"/>
    <path d="M12 22h8" stroke="white" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function iconPath() {
  const candidate = path.join(__dirname, "icon.png");
  return fs.existsSync(candidate) ? candidate : undefined;
}

function updateTaskbarOverlay(observation, error = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (error) {
    mainWindow.setOverlayIcon(createTaskbarBadge("#d94841", "!"), "观察失败");
    return;
  }
  if (!observation) {
    mainWindow.setOverlayIcon(null, "");
    return;
  }
  if (observation.blocked) {
    mainWindow.setOverlayIcon(createTaskbarBadge("#d94841", "?"), "可能不知道下一步怎么操作");
  } else if (directModelEnabled()) {
    mainWindow.setOverlayIcon(createTaskbarBadge("#2f7df6", "AI"), "OpenAI 直连观察中");
  } else {
    mainWindow.setOverlayIcon(createTaskbarBadge("#7b8494", "M"), "本地记忆观察中");
  }
}

function createTaskbarBadge(color, label) {
  const text = String(label).slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <circle cx="32" cy="32" r="30" fill="${color}"/>
    <text x="32" y="40" text-anchor="middle" font-family="Segoe UI, Arial" font-size="${text.length > 1 ? 22 : 32}" font-weight="700" fill="white">${text}</text>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
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
    syncMessage: lastSyncMessage || (config.tunnelBaseUrl ? "记忆隧穿：等待下一次写入后同步" : "记忆隧穿：未填写地址"),
    packageMessage: lastPackageMessage,
    memoryDir: MEMORY_DIR,
    packagesDir: PACKAGES_DIR,
    ...extra
  };
}

function publicConfig() {
  return {
    tunnelBaseUrl: config.tunnelBaseUrl,
    observeIntervalSeconds: config.observeIntervalSeconds,
    observeIntervalMinSeconds: config.observeIntervalMinSeconds,
    observeIntervalMaxSeconds: config.observeIntervalMaxSeconds,
    memoryEndpoint: config.memoryEndpoint,
    directModelProvider: config.directModelProvider,
    directBaseUrl: config.directBaseUrl,
    directModel: config.directModel,
    directReviewModel: config.directReviewModel,
    directReasoningEffort: config.directReasoningEffort,
    directWireApi: config.directWireApi,
    disableResponseStorage: config.disableResponseStorage,
    networkAccess: config.networkAccess,
    windowsWslSetupAcknowledged: config.windowsWslSetupAcknowledged,
    modelContextWindow: config.modelContextWindow,
    modelAutoCompactTokenLimit: config.modelAutoCompactTokenLimit,
    directEnabled: directModelEnabled(),
    sendScreenshotsToModel: config.sendScreenshotsToModel,
    buddyDefaultMode: config.buddyDefaultMode,
    companionMode: config.companionMode,
    proactiveGuidance: config.proactiveGuidance,
    casualChat: config.casualChat
  };
}

function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const rootConfig = readRootTomlConfig();
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG, ...rootConfig };
  try {
    const electronConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const merged = { ...DEFAULT_CONFIG, ...electronConfig, ...rootConfig };
    if (!rootConfig.directApiKey && electronConfig.directApiKey) merged.directApiKey = electronConfig.directApiKey;
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG, ...rootConfig };
  }
}

function saveConfig(nextConfig) {
  const merged = { ...config, ...nextConfig };
  config = {
    ...merged,
  tunnelBaseUrl: String(merged.tunnelBaseUrl || "").trim().replace(/\/+$/, ""),
  directBaseUrl: String(merged.directBaseUrl || "").trim().replace(/\/+$/, ""),
    directApiKey: String(merged.directApiKey || "").trim(),
    buddyDefaultMode: normalizeBuddyMode(merged.buddyDefaultMode)
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  updateTray();
  startObserver();
  return publicConfig();
}

function saveDirectModelToRootConfig(nextConfig) {
  const existing = readText(ROOT_CONFIG_PATH);
  const assistantBlock = getTomlSectionRaw(existing, "assistant") || `[assistant]
observe_interval_seconds = ${config.observeIntervalSeconds}
observe_interval_min_seconds = ${config.observeIntervalMinSeconds || 10}
observe_interval_max_seconds = ${config.observeIntervalMaxSeconds || 60}
notify_interval_minutes = ${config.notifyIntervalMinutes}
blocked_check_minutes = ${config.blockedCheckMinutes}
companion_mode = "${config.companionMode || "watch"}"
proactive_guidance = ${config.proactiveGuidance ? "true" : "false"}
casual_chat = ${config.casualChat === false ? "false" : "true"}
memory_dir = "data/memory"
language = "zh-CN"
`;
  const tunnelBlock = getTomlSectionRaw(existing, "tunnel") || `[tunnel]
base_url = "${config.tunnelBaseUrl || ""}"
api_key = ""
memory_endpoint = "${config.memoryEndpoint || "/memory/sync"}"
timeout_seconds = 12
`;
  const screenBlock = getTomlSectionRaw(existing, "screen") || `[screen]
enable_screenshot = true
enable_ocr = false
ocr_max_chars = 1200
`;
  const openclawBlock = getTomlSectionRaw(existing, "openclaw") || `[openclaw]
base_url = "${config.tunnelBaseUrl || ""}"
api_key = ""
timeout_seconds = 12
`;
  const privacyBlock = getTomlSectionRaw(existing, "privacy") || `[privacy]
store_screenshots = false
redact_window_titles = false
`;
  const directBlock = formatDirectToml({
    modelProvider: nextConfig.directModelProvider || "OpenAI",
    model: nextConfig.directModel || "gpt-5.5",
    reviewModel: nextConfig.directReviewModel || "gpt-5.4",
    reasoningEffort: nextConfig.directReasoningEffort || "xhigh",
    disableResponseStorage:
      nextConfig.disableResponseStorage === undefined ? true : Boolean(nextConfig.disableResponseStorage),
    networkAccess: nextConfig.networkAccess || "enabled",
    windowsWslSetupAcknowledged:
      nextConfig.windowsWslSetupAcknowledged === undefined ? true : Boolean(nextConfig.windowsWslSetupAcknowledged),
    modelContextWindow: Number(nextConfig.modelContextWindow || 1000000),
    modelAutoCompactTokenLimit: Number(nextConfig.modelAutoCompactTokenLimit || 900000),
    baseUrl: nextConfig.directBaseUrl || "https://fast.allincoding.cc",
    wireApi: nextConfig.directWireApi || "auto"
  });
  const content = [directBlock, assistantBlock, tunnelBlock, screenBlock, openclawBlock, privacyBlock]
    .map((block) => block.trim())
    .join("\n\n") + "\n";
  fs.writeFileSync(ROOT_CONFIG_PATH, content, "utf8");
}

function formatDirectToml(values) {
  return `model_provider = "${escapeTomlString(values.modelProvider)}"
model = "${escapeTomlString(values.model)}"
review_model = "${escapeTomlString(values.reviewModel)}"
model_reasoning_effort = "${escapeTomlString(values.reasoningEffort)}"
disable_response_storage = ${values.disableResponseStorage ? "true" : "false"}
network_access = "${escapeTomlString(values.networkAccess)}"
windows_wsl_setup_acknowledged = ${values.windowsWslSetupAcknowledged ? "true" : "false"}
model_context_window = ${values.modelContextWindow}
model_auto_compact_token_limit = ${values.modelAutoCompactTokenLimit}

[model_providers.OpenAI]
name = "OpenAI"
base_url = "${escapeTomlString(values.baseUrl)}"
wire_api = "${escapeTomlString(values.wireApi)}"
requires_openai_auth = true`;
}

function escapeTomlString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function localDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function capturePrimaryScreenDataUrl() {
  try {
    const primary = screen.getPrimaryDisplay();
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / Math.max(primary.size.width, 1));
    const thumbnailSize = {
      width: Math.max(1, Math.round(primary.size.width * scale)),
      height: Math.max(1, Math.round(primary.size.height * scale))
    };
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize
    });
    const source = sources.find((item) => String(item.display_id) === String(primary.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) return "";
    return source.thumbnail.toDataURL();
  } catch {
    return "";
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readRootTomlConfig() {
  const result = {};
  const text = readText(ROOT_CONFIG_PATH);
  if (!text) return result;
  const directBlock = readTomlBlock(text, "direct_model");
  const providerBlock = readTomlBlock(text, "model_providers.OpenAI");
  const topLevel = readTomlTopLevel(text);
  const directApiKey = process.env.OPENAI_API_KEY || process.env.SCREEN_MEMORY_OPENAI_API_KEY || directBlock.api_key || providerBlock.api_key || "";
  if (topLevel.model_provider) result.directModelProvider = topLevel.model_provider;
  if (topLevel.model) result.directModel = topLevel.model;
  if (topLevel.review_model) result.directReviewModel = topLevel.review_model;
  if (topLevel.model_reasoning_effort) result.directReasoningEffort = topLevel.model_reasoning_effort;
  if (topLevel.disable_response_storage !== undefined) result.disableResponseStorage = parseTomlBool(topLevel.disable_response_storage);
  if (topLevel.network_access) result.networkAccess = topLevel.network_access;
  if (topLevel.windows_wsl_setup_acknowledged !== undefined) result.windowsWslSetupAcknowledged = parseTomlBool(topLevel.windows_wsl_setup_acknowledged);
  if (topLevel.model_context_window) result.modelContextWindow = Number(topLevel.model_context_window);
  if (topLevel.model_auto_compact_token_limit) result.modelAutoCompactTokenLimit = Number(topLevel.model_auto_compact_token_limit);
  if (providerBlock.base_url) result.directBaseUrl = providerBlock.base_url;
  if (providerBlock.wire_api) result.directWireApi = providerBlock.wire_api;
  const assistantBlock = readTomlBlock(text, "assistant");
  if (assistantBlock.observe_interval_seconds) result.observeIntervalSeconds = Number(assistantBlock.observe_interval_seconds);
  if (assistantBlock.observe_interval_min_seconds) result.observeIntervalMinSeconds = Number(assistantBlock.observe_interval_min_seconds);
  if (assistantBlock.observe_interval_max_seconds) result.observeIntervalMaxSeconds = Number(assistantBlock.observe_interval_max_seconds);
  if (assistantBlock.notify_interval_minutes) result.notifyIntervalMinutes = Number(assistantBlock.notify_interval_minutes);
  if (assistantBlock.blocked_check_minutes) result.blockedCheckMinutes = Number(assistantBlock.blocked_check_minutes);
  if (assistantBlock.companion_mode) result.companionMode = String(assistantBlock.companion_mode);
  if (assistantBlock.proactive_guidance !== undefined) result.proactiveGuidance = parseTomlBool(assistantBlock.proactive_guidance);
  if (assistantBlock.casual_chat !== undefined) result.casualChat = parseTomlBool(assistantBlock.casual_chat);
  const screenBlock = readTomlBlock(text, "screen");
  if (screenBlock.enable_screenshot !== undefined) result.sendScreenshotsToModel = parseTomlBool(screenBlock.enable_screenshot);
  if (directApiKey) result.directApiKey = directApiKey;
  return result;
}

function readTomlTopLevel(text) {
  const beforeFirstSection = text.split(/\n\[/)[0] || "";
  return parseTomlAssignments(beforeFirstSection);
}

function readTomlBlock(text, section) {
  const block = getTomlSectionRaw(text, section);
  return block ? parseTomlAssignments(block.replace(/^\[[^\]]+\]\s*\n/, "")) : {};
}

function getTomlSectionRaw(text, section) {
  const lines = String(text || "").split(/\r?\n/);
  const header = `[${section}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return "";
  const collected = [header];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) break;
    collected.push(line);
  }
  return `${collected.join("\n").trim()}\n`;
}

function parseTomlAssignments(block) {
  const values = {};
  for (const rawLine of String(block || "").split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = parseTomlValue(rest.join("=").trim());
  }
  return values;
}

function parseTomlValue(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true" || trimmed === "false") return trimmed;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function parseTomlBool(value) {
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

function normalizeBuddyMode(value) {
  const mode = String(value || "cursor").toLowerCase();
  return ["cursor", "corner", "off"].includes(mode) ? mode : "cursor";
}

ipcMain.handle("state:get", () => getState());
ipcMain.handle("config:saveTunnel", (_event, tunnelBaseUrl) => {
  const next = saveConfig({ tunnelBaseUrl });
  publishState({ syncMessage: tunnelBaseUrl ? "隧穿地址已保存" : "记忆隧穿：未填写地址" });
  return next;
});
ipcMain.handle("config:saveDirectModel", (_event, nextConfig) => {
  const normalized = {
    directBaseUrl: String(nextConfig?.directBaseUrl || config.directBaseUrl || ""),
    directApiKey: String(nextConfig?.directApiKey || config.directApiKey || ""),
    directModelProvider: String(nextConfig?.directModelProvider || config.directModelProvider || "OpenAI"),
    directModel: String(nextConfig?.directModel || config.directModel || "gpt-5.5"),
    directReviewModel: String(nextConfig?.directReviewModel || config.directReviewModel || "gpt-5.4"),
    directReasoningEffort: String(nextConfig?.directReasoningEffort || config.directReasoningEffort || "xhigh"),
    directWireApi: String(nextConfig?.directWireApi || config.directWireApi || "auto"),
    disableResponseStorage: nextConfig?.disableResponseStorage === undefined ? config.disableResponseStorage : Boolean(nextConfig.disableResponseStorage),
    networkAccess: String(nextConfig?.networkAccess || config.networkAccess || "enabled"),
    windowsWslSetupAcknowledged:
      nextConfig?.windowsWslSetupAcknowledged === undefined ? config.windowsWslSetupAcknowledged : Boolean(nextConfig.windowsWslSetupAcknowledged),
    modelContextWindow: Number(nextConfig?.modelContextWindow || config.modelContextWindow || 1000000),
    modelAutoCompactTokenLimit: Number(nextConfig?.modelAutoCompactTokenLimit || config.modelAutoCompactTokenLimit || 900000),
    sendScreenshotsToModel: Boolean(nextConfig?.sendScreenshotsToModel)
  };
  saveDirectModelToRootConfig(normalized);
  const next = saveConfig(normalized);
  publishState({ statusMessage: directModelEnabled() ? "OpenAI 直连已启用" : "OpenAI 直连未完整配置" });
  return next;
});
ipcMain.handle("config:saveBuddyMode", (_event, mode) => {
  const buddyDefaultMode = normalizeBuddyMode(mode);
  const next = saveConfig({ buddyDefaultMode });
  if (buddyDefaultMode === "off") {
    hideCursorBuddy();
    if (typewriterWindow && !typewriterWindow.isDestroyed()) typewriterWindow.close();
  }
  publishState({ config: next });
  return next;
});
ipcMain.handle("memory:syncToday", async () => {
  const write = ensureDayFiles(localDay());
  const message = await syncMemory(write, lastObservation);
  lastSyncMessage = message;
  updateTray();
  publishState({ syncMessage: message });
  return message;
});
ipcMain.handle("memory:package", (_event, scope) => createMemoryPackage(String(scope || "today")));
ipcMain.handle("memory:openPackagesFolder", () => shell.openPath(PACKAGES_DIR));
ipcMain.handle("memory:importPackage", () => importMemoryPackage());
ipcMain.handle("chat:submit", async (_event, text) => handleChat(String(text || "")));
ipcMain.handle("chat:close", () => {
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.close();
});
ipcMain.handle("buddy:typewriter", (_event, text) => showTypewriterNearCursor(String(text || ""), { autoCloseMs: 12000 }));
ipcMain.handle("buddy:typewriterResize", (_event, bounds) => resizeTypewriterWindow(bounds));
ipcMain.handle("buddy:summonMenu", () => showSummonButtonsNearCursor());
ipcMain.handle("buddy:summonType", () => requestTypingNearCursor());
ipcMain.handle("buddy:summonGuide", () => requestGuidanceNearCursor());
ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:hide", () => mainWindow?.hide());
ipcMain.handle("window:close", () => app.quit());
ipcMain.handle("window:setMode", (_event, mode) => setMainWindowMode(mode));
ipcMain.handle("window:toggleCollapse", (_event, collapsed) => toggleMainWindowCollapse(collapsed));
ipcMain.handle("memory:openFolder", () => shell.openPath(MEMORY_DIR));
ipcMain.handle("debug:testBlockedPopup", () => createChatWindow("我猜你可能不确定下一步怎么操作，要不要我根据当前窗口帮你拆一下？"));
