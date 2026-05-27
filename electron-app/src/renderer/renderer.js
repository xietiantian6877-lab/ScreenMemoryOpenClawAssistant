const appShell = document.getElementById("appShell");
const composerInput = document.getElementById("composerInput");
const tunnelInput = document.getElementById("tunnelInput");
const directBaseUrlInput = document.getElementById("directBaseUrlInput");
const directApiKeyInput = document.getElementById("directApiKeyInput");
const sendBtn = document.getElementById("sendBtn");
const saveTunnelBtn = document.getElementById("saveTunnelBtn");
const saveDirectBtn = document.getElementById("saveDirectBtn");
const refreshModelsBtn = document.getElementById("refreshModelsBtn");
const permissionBtn = document.getElementById("permissionBtn");
const homeProviderBtn = document.getElementById("homeProviderBtn");
const homeModelSelect = document.getElementById("homeModelSelect");
const homeReasoningSelect = document.getElementById("homeReasoningSelect");
const codexStatusText = document.getElementById("codexStatusText");
const codexSearchToggle = document.getElementById("codexSearchToggle");
const refreshCodexBtn = document.getElementById("refreshCodexBtn");
const connectionText = document.getElementById("connectionText");
const settingsStatus = document.getElementById("settingsStatus");
const windowText = document.getElementById("windowText");
const syncText = document.getElementById("syncText");
const packageText = document.getElementById("packageText");
const petFace = document.getElementById("petFace");
const petCard = document.getElementById("petCard");
const buddyModeSelect = document.getElementById("buddyModeSelect");
const chatFrequencyInput = document.getElementById("chatFrequencyInput");
const chatFrequencyText = document.getElementById("chatFrequencyText");
const guidanceToggle = document.getElementById("guidanceToggle");
const settingsTabs = Array.from(document.querySelectorAll(".settings-tab"));
const settingsPanes = {
  memory: document.getElementById("memoryPane"),
  model: document.getElementById("modelPane"),
  tunnel: document.getElementById("tunnelPane")
};

let isCollapsed = false;
let currentConfig = null;
let availableModels = ["gpt-5.5", "gpt-5.4"];
let codexBusy = false;

async function setCollapsed(collapsed) {
  isCollapsed = collapsed;
  appShell.classList.remove("settings-open");
  appShell.classList.toggle("collapsed", collapsed);
  await window.screenMemory.toggleCollapse(collapsed);
  if (!collapsed) composerInput.focus();
}

petCard.addEventListener("click", () => setCollapsed(!isCollapsed));

document.getElementById("openMemoryBtnSettings").addEventListener("click", () => window.screenMemory.openMemoryFolder());
document.getElementById("openPackagesBtn").addEventListener("click", () => window.screenMemory.openPackagesFolder());
document.getElementById("testPopupBtn").addEventListener("click", () => window.screenMemory.testBlockedPopup());
document.getElementById("settingsBtn").addEventListener("click", () => setSettingsOpen(true));
document.getElementById("settingsBackBtn").addEventListener("click", () => setSettingsOpen(false));
document.getElementById("packageTodayBtn").addEventListener("click", () => packageMemory("today"));
buddyModeSelect.addEventListener("change", async () => {
  const config = await window.screenMemory.saveBuddyMode(buddyModeSelect.value);
  renderConfig(config);
});
chatFrequencyInput.addEventListener("input", () => {
  renderChatFrequencyText(Number(chatFrequencyInput.value));
});
chatFrequencyInput.addEventListener("change", async () => {
  const config = await window.screenMemory.saveCasualChatFrequency(Number(chatFrequencyInput.value));
  renderConfig(config);
});
guidanceToggle.addEventListener("change", async () => {
  const config = await window.screenMemory.saveProactiveGuidance(guidanceToggle.checked);
  renderConfig(config);
});
homeProviderBtn.addEventListener("click", () => saveAssistantMode(currentConfig?.assistantMode === "codex" ? "api" : "codex"));
permissionBtn.addEventListener("click", async () => {
  const nextMode = currentConfig?.codexAccessMode === "ask" ? "full" : "ask";
  const config = await window.screenMemory.saveCodexSettings({ ...readCodexSettings(), codexAccessMode: nextMode });
  renderConfig(config);
});
homeModelSelect.addEventListener("change", saveHomeModel);
homeReasoningSelect.addEventListener("change", saveHomeModel);
codexSearchToggle.addEventListener("change", async () => {
  const config = await window.screenMemory.saveCodexSettings(readCodexSettings());
  renderConfig(config);
});
refreshModelsBtn.addEventListener("click", () => refreshModels(true));
refreshCodexBtn.addEventListener("click", refreshCodexStatus);
settingsTabs.forEach((tab) => tab.addEventListener("click", () => setSettingsTab(tab.dataset.tab)));

sendBtn.addEventListener("click", submitComposer);
composerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitComposer();
});

saveTunnelBtn.addEventListener("click", saveTunnel);
tunnelInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveTunnel();
});

saveDirectBtn.addEventListener("click", saveDirectModel);
directApiKeyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveDirectModel();
});

directBaseUrlInput.addEventListener("change", () => refreshModels(true));

document.getElementById("syncTodayBtn").addEventListener("click", async () => {
  syncText.textContent = "同步中";
  syncText.textContent = compactSyncText(await window.screenMemory.syncToday());
});

window.screenMemory.onStateUpdate(renderState);
window.screenMemory.getState().then((state) => {
  renderState(state);
  refreshModels(false);
  refreshCodexStatus();
});

async function submitComposer() {
  const value = composerInput.value.trim();
  if (!value) return;
  const isCodex = currentConfig?.assistantMode === "codex";
  sendBtn.disabled = true;
  sendBtn.textContent = "...";
  if (isCodex) setCodexBusy(true);
  petFace.textContent = "(•_•)";
  try {
    await window.screenMemory.submitChat(value);
    composerInput.value = "";
  } finally {
    petFace.textContent = "(•‿•)";
    sendBtn.textContent = "↑";
    sendBtn.disabled = false;
    if (isCodex) setCodexBusy(false);
  }
}

async function saveTunnel() {
  saveTunnelBtn.disabled = true;
  saveTunnelBtn.textContent = "保存中";
  const config = await window.screenMemory.saveTunnel(tunnelInput.value.trim());
  renderConfig(config);
  saveTunnelBtn.textContent = "保存隧穿";
  saveTunnelBtn.disabled = false;
}

async function saveDirectModel() {
  saveDirectBtn.disabled = true;
  saveDirectBtn.textContent = "保存中";
  const config = await window.screenMemory.saveDirectModel({
    directModelProvider: "OpenAI",
    assistantMode: currentConfig?.assistantMode || "api",
    directBaseUrl: directBaseUrlInput.value.trim(),
    directApiKey: directApiKeyInput.value.trim(),
    directModel: homeModelSelect.value || "gpt-5.5",
    directReviewModel: homeModelSelect.value || "gpt-5.4",
    directReasoningEffort: homeReasoningSelect.value || "xhigh",
    directWireApi: "auto",
    disableResponseStorage: true,
    networkAccess: "enabled",
    windowsWslSetupAcknowledged: true,
    modelContextWindow: 1000000,
    modelAutoCompactTokenLimit: 900000
  });
  directApiKeyInput.value = "";
  renderConfig(config);
  saveDirectBtn.textContent = "保存直连";
  saveDirectBtn.disabled = false;
}

async function packageMemory(scope) {
  packageText.textContent = "打包中";
  try {
    const result = await window.screenMemory.packageMemory(scope);
    packageText.textContent = result.message || "已打包";
  } catch (error) {
    packageText.textContent = "打包失败";
  }
}

async function importMemoryPackage() {
  packageText.textContent = "导入中";
  try {
    const result = await window.screenMemory.importMemoryPackage();
    packageText.textContent = result.message || "已导入";
  } catch (error) {
    packageText.textContent = "导入失败";
  }
}

function renderState(state) {
  renderConfig(state.config);
  if (state.syncMessage) syncText.textContent = compactSyncText(state.syncMessage);
  if (state.packageMessage) packageText.textContent = state.packageMessage;

  if (state.observation) {
    const process = state.observation.active_process || "未知进程";
    const title = state.observation.active_window_title || "未知窗口";
    windowText.textContent = `识别屏幕：${process} · ${title}`;
    petFace.textContent = state.observation.blocked ? "(•_•?)" : "(•‿•)";
  }
}

function renderConfig(config) {
  currentConfig = config || currentConfig || {};
  const tunnelUrl = config?.tunnelBaseUrl || "";
  if (document.activeElement !== tunnelInput) tunnelInput.value = tunnelUrl;
  if (document.activeElement !== directBaseUrlInput) directBaseUrlInput.value = config?.directBaseUrl || "";
  if (document.activeElement !== buddyModeSelect) buddyModeSelect.value = config?.buddyDefaultMode || "cursor";
  const frequency = Number(config?.casualChatFrequency ?? 70);
  if (document.activeElement !== chatFrequencyInput) chatFrequencyInput.value = String(frequency);
  renderChatFrequencyText(frequency);
  guidanceToggle.checked = Boolean(config?.proactiveGuidance);
  renderMode(config);

  if (config?.assistantMode === "codex" && config?.codexStatus?.connected) {
    connectionText.textContent = "Codex 已连接";
    settingsStatus.textContent = `${config.codexModel || config.directModel || "Codex"} · ${config.codexAccessMode === "ask" ? "确认权限" : "完全权限"}`;
  } else if (config?.directEnabled) {
    connectionText.textContent = "API 运行";
    settingsStatus.textContent = `${config.directModelProvider || "OpenAI"} ${getModelGroupName(config.directModel)}`;
  } else if (tunnelUrl) {
    connectionText.textContent = "隧穿已连接";
    settingsStatus.textContent = "OpenClaw 隧穿";
  } else {
    connectionText.textContent = "本地判断";
    settingsStatus.textContent = "未配置直连/隧穿";
  }
}

function renderMode(config = {}) {
  const mode = config.assistantMode === "codex" ? "codex" : "api";
  const codexConnected = Boolean(config.codexStatus?.connected);
  document.body.classList.toggle("codex-enabled", mode === "codex" && codexConnected);
  document.body.classList.toggle("codex-muted", !(mode === "codex" && codexConnected));
  homeProviderBtn.textContent = mode === "codex" ? "Codex" : "OpenAI";
  homeProviderBtn.classList.toggle("muted", mode !== "codex");
  homeProviderBtn.disabled = codexBusy || (mode !== "codex" && !codexConnected);
  homeProviderBtn.title = !codexConnected ? "Codex 未连接，不能切换" : "切换 API/Codex";
  permissionBtn.classList.toggle("codex-muted", mode !== "codex" || !codexConnected);
  permissionBtn.textContent = config.codexAccessMode === "ask" ? "每步确认" : "完全访问权限";
  permissionBtn.disabled = codexBusy || mode !== "codex" || !codexConnected;
  homeReasoningSelect.disabled = codexBusy;
  homeModelSelect.disabled = codexBusy;
  const selectedModel = mode === "codex" ? (config.codexModel || config.directModel || "gpt-5.5") : (config.directModel || "gpt-5.5");
  homeModelSelect.value = availableModels.includes(selectedModel) ? selectedModel : "";
  homeReasoningSelect.value = mode === "codex" ? (config.codexReasoningEffort || "xhigh") : (config.directReasoningEffort || "xhigh");
  codexStatusText.textContent = config.codexStatus?.message || "Codex 未检测";
  codexSearchToggle.checked = config.codexSearch !== false;
}

function readCodexSettings() {
  return {
    codexModel: homeModelSelect.value || currentConfig?.codexModel || currentConfig?.directModel || "gpt-5.5",
    codexReasoningEffort: homeReasoningSelect.value || currentConfig?.codexReasoningEffort || "xhigh",
    codexAccessMode: currentConfig?.codexAccessMode || "full",
    codexSearch: codexSearchToggle.checked
  };
}

async function saveAssistantMode(mode) {
  if (codexBusy) return;
  if (mode === "codex" && !currentConfig?.codexStatus?.connected) return;
  const config = await window.screenMemory.saveAssistantMode(mode);
  renderConfig(config);
}

async function saveHomeModel() {
  if (codexBusy) return;
  if (currentConfig?.assistantMode === "codex") {
    const config = await window.screenMemory.saveCodexSettings(readCodexSettings());
    renderConfig(config);
    return;
  }
  const config = await window.screenMemory.saveDirectModel({
    directModelProvider: "OpenAI",
    assistantMode: "api",
    directBaseUrl: directBaseUrlInput.value.trim(),
    directApiKey: "",
    directModel: homeModelSelect.value || "gpt-5.5",
    directReviewModel: homeModelSelect.value || "gpt-5.4",
    directReasoningEffort: homeReasoningSelect.value || "xhigh",
    directWireApi: "auto",
    disableResponseStorage: true,
    networkAccess: "enabled",
    windowsWslSetupAcknowledged: true,
    modelContextWindow: 1000000,
    modelAutoCompactTokenLimit: 900000
  });
  renderConfig(config);
}

async function refreshModels(force) {
  const result = await window.screenMemory.listModels(Boolean(force));
  if (result?.ok && result.models?.length) {
    availableModels = result.models;
    renderModelOptions();
    renderConfig(currentConfig);
  } else if (result?.message) {
    settingsStatus.textContent = result.message;
  }
}

async function refreshCodexStatus() {
  codexStatusText.textContent = "Codex 检测中";
  const status = await window.screenMemory.refreshCodexStatus();
  currentConfig = { ...(currentConfig || {}), codexStatus: status };
  renderConfig(currentConfig);
}

function renderModelOptions() {
  const selected = currentConfig?.assistantMode === "codex"
    ? currentConfig?.codexModel
    : currentConfig?.directModel;
  homeModelSelect.innerHTML = "";
  availableModels.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model.replace(/^gpt-/, "");
    homeModelSelect.appendChild(option);
  });
  homeModelSelect.value = availableModels.includes(selected) ? selected : "";
}

function setCodexBusy(busy) {
  codexBusy = Boolean(busy);
  document.body.classList.toggle("codex-busy", codexBusy);
  if (codexBusy) connectionText.textContent = "Codex 运行中";
  renderMode(currentConfig || {});
}

function setSettingsTab(name) {
  const tabName = settingsPanes[name] ? name : "memory";
  settingsTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  Object.entries(settingsPanes).forEach(([key, pane]) => {
    pane.classList.toggle("active", key === tabName);
  });
}

function getModelGroupName(model) {
  const value = String(model || "").trim();
  if (!value) return "未选模型";
  const match = value.match(/^([a-z]+-[0-9.]+)/i);
  return match ? match[1] : value;
}

function renderChatFrequencyText(value) {
  const frequency = Number.isFinite(Number(value)) ? Number(value) : 70;
  if (frequency <= 0) {
    chatFrequencyText.textContent = "关闭";
  } else if (frequency < 35) {
    chatFrequencyText.textContent = `低 ${frequency}%`;
  } else if (frequency < 70) {
    chatFrequencyText.textContent = `中 ${frequency}%`;
  } else {
    chatFrequencyText.textContent = `高 ${frequency}%`;
  }
}

function compactSyncText(text) {
  if (!text) return "未同步";
  if (text.includes("已同步")) return "已同步";
  if (text.includes("失败")) return "同步失败";
  if (text.includes("未填写")) return "未同步";
  return text.replace("记忆隧穿：", "");
}

async function setSettingsOpen(open) {
  appShell.classList.toggle("settings-open", open);
  if (window.screenMemory.setWindowMode) {
    await window.screenMemory.setWindowMode(open ? "settings" : "composer");
  }
  if (open) directApiKeyInput.focus();
  else composerInput.focus();
}
