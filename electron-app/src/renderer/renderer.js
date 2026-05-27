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
const homeModelMenuWrap = document.getElementById("homeModelMenuWrap");
const homeModelMenuBtn = document.getElementById("homeModelMenuBtn");
const homeModelMenu = document.getElementById("homeModelMenu");
const homeReasoningSelect = document.getElementById("homeReasoningSelect");
const homeReasoningMenuWrap = document.getElementById("homeReasoningMenuWrap");
const homeReasoningMenuBtn = document.getElementById("homeReasoningMenuBtn");
const homeReasoningMenu = document.getElementById("homeReasoningMenu");
const codexStatusText = document.getElementById("codexStatusText");
const codexSearchToggle = document.getElementById("codexSearchToggle");
const refreshCodexBtn = document.getElementById("refreshCodexBtn");
const connectionText = document.getElementById("connectionText");
const settingsStatus = document.getElementById("settingsStatus");
const windowText = document.getElementById("windowText");
const syncText = document.getElementById("syncText");
const packageText = document.getElementById("packageText");
const petFace = document.getElementById("petFace");
const petExpression = document.getElementById("petExpression");
const petCard = document.getElementById("petCard");
const buddyModeSelect = document.getElementById("buddyModeSelect");
const buddyModeMenuBtn = document.getElementById("buddyModeMenuBtn");
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
const codexModels = ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"];
const reasoningOptions = [
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "超高" }
];
const buddyModeOptions = [
  { value: "cursor", label: "鼠标旁" },
  { value: "corner", label: "右上角" },
  { value: "off", label: "关闭常驻" }
];
let apiModels = ["gpt-5.5", "gpt-5.4"];
let codexBusy = false;
let menuWindowOpen = false;
let mousePassthrough = false;

function updateMousePassthrough(event) {
  if (!window.screenMemory.setMousePassthrough) return;
  const target = event?.target;
  const insideShell = Boolean(target?.closest?.("#appShell"));
  const next = !insideShell;
  if (next === mousePassthrough) return;
  mousePassthrough = next;
  window.screenMemory.setMousePassthrough(next);
}

function setPetFaceText(text) {
  if (petExpression) {
    petExpression.textContent = text;
  } else {
    petFace.textContent = text;
  }
}

async function setCollapsed(collapsed) {
  isCollapsed = collapsed;
  if (collapsed) appShell.classList.remove("settings-open");
  appShell.classList.toggle("collapsing", collapsed);
  await window.screenMemory.toggleCollapse(collapsed);
  requestAnimationFrame(() => {
    appShell.classList.toggle("collapsed", collapsed);
    appShell.classList.remove("collapsing");
  });
  if (!collapsed) composerInput.focus();
}

document.addEventListener("mousemove", updateMousePassthrough);
document.addEventListener("mouseleave", () => {
  if (!window.screenMemory.setMousePassthrough || mousePassthrough) return;
  mousePassthrough = true;
  window.screenMemory.setMousePassthrough(true);
});

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
buddyModeMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  showDropdown("buddyMode", buddyModeMenuBtn);
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
homeModelMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  showDropdown("model", homeModelMenuBtn);
});
homeReasoningMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  showDropdown("reasoning", homeReasoningMenuBtn);
});
document.addEventListener("click", () => closeAllMenus());
window.screenMemory.onDropdownSelect(handleDropdownSelect);
window.screenMemory.onDropdownClosed(() => closeMenuElements());
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
  setPetFaceText("(•_•)");
  try {
    await window.screenMemory.submitChat(value);
    composerInput.value = "";
  } finally {
    setPetFaceText("(•‿•)");
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
  renderMediaState(state.media);
  if (state.syncMessage) syncText.textContent = compactSyncText(state.syncMessage);
  if (state.packageMessage) packageText.textContent = state.packageMessage;

  if (state.observation) {
    const process = state.observation.active_process || "未知进程";
    const title = state.observation.active_window_title || "未知窗口";
    windowText.textContent = `识别屏幕：${process} · ${title}`;
    setPetFaceText(state.observation.blocked ? "(•_•?)" : "(•‿•)");
  }
  renderMediaState(state.media);
}

function renderMediaState(media = {}) {
  const playing = Boolean(media.playing);
  petCard.classList.toggle("music-mode", playing);
  petFace.classList.toggle("music-mode", playing);
  if (playing) {
    setPetFaceText("≧∀≦");
    petFace.title = media.source ? `正在听：${media.source}` : "正在播放音乐";
  } else {
    setPetFaceText("(•‿•)");
    petFace.title = "";
  }
}

function renderConfig(config) {
  currentConfig = config || currentConfig || {};
  const tunnelUrl = config?.tunnelBaseUrl || "";
  if (document.activeElement !== tunnelInput) tunnelInput.value = tunnelUrl;
  if (document.activeElement !== directBaseUrlInput) directBaseUrlInput.value = config?.directBaseUrl || "";
  if (document.activeElement !== buddyModeSelect) buddyModeSelect.value = config?.buddyDefaultMode || "cursor";
  updateBuddyModeMenuButton();
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
  const codexConnected = isCodexReady(config);
  const renderedMode = homeModelSelect.dataset.mode || "";
  if (renderedMode !== mode) {
    homeModelSelect.dataset.mode = mode;
    renderModelOptions();
  }
  document.body.classList.toggle("codex-enabled", mode === "codex" && codexConnected);
  document.body.classList.toggle("codex-muted", !(mode === "codex" && codexConnected));
  homeProviderBtn.textContent = mode === "codex" ? "Codex" : "OpenAI";
  homeProviderBtn.classList.toggle("muted", mode !== "codex");
  homeProviderBtn.disabled = codexBusy;
  homeProviderBtn.title = !codexConnected && mode !== "codex" ? "点击检测并切换 Codex" : "切换 API/Codex";
  permissionBtn.classList.toggle("codex-muted", mode !== "codex" || !codexConnected);
  permissionBtn.textContent = config.codexAccessMode === "ask" ? "每步确认" : "完全访问权限";
  permissionBtn.title = config.codexAccessMode === "ask"
    ? "Codex 会用 on-request，每步需要确认"
    : "Codex 会跳过确认并允许完整访问";
  permissionBtn.disabled = codexBusy || mode !== "codex" || !codexConnected;
  homeReasoningSelect.disabled = codexBusy;
  homeModelSelect.disabled = codexBusy;
  const selectedModel = mode === "codex" ? (config.codexModel || config.directModel || "gpt-5.5") : (config.directModel || "gpt-5.5");
  const models = getCurrentModelOptions(config);
  homeModelSelect.value = models.includes(selectedModel) ? selectedModel : "";
  updateModelMenuButton();
  homeReasoningSelect.value = mode === "codex" ? (config.codexReasoningEffort || "xhigh") : (config.directReasoningEffort || "xhigh");
  updateReasoningMenuButton();
  codexStatusText.textContent = compactStatus(config.codexStatus?.message || "Codex 未检测");
  codexStatusText.title = config.codexStatus?.message || "Codex 未检测";
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
  if (mode === "codex" && !isCodexReady(currentConfig)) {
    codexStatusText.textContent = "Codex 检测中";
    const status = await window.screenMemory.refreshCodexStatus();
    currentConfig = { ...(currentConfig || {}), codexStatus: status };
    renderConfig(currentConfig);
    if (!isCodexReady(currentConfig)) return;
  }
  const config = await window.screenMemory.saveAssistantMode(mode);
  renderConfig(config);
}

function isCodexReady(config = {}) {
  return Boolean(config.codexStatus?.connected || config.codexStatus?.available || config.codexStatus?.command);
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
    apiModels = result.models;
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
  const models = getCurrentModelOptions(currentConfig);
  homeModelSelect.innerHTML = "";
  homeModelMenu.innerHTML = "";
  models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = formatModelLabel(model);
    homeModelSelect.appendChild(option);

    const item = document.createElement("button");
    item.type = "button";
    item.role = "option";
    item.dataset.model = model;
    item.textContent = formatModelLabel(model);
    item.classList.toggle("active", model === selected);
    item.addEventListener("click", async (event) => {
      event.stopPropagation();
      homeModelSelect.value = model;
      closeAllMenus();
      await saveHomeModel();
    });
    homeModelMenu.appendChild(item);
  });
  homeModelSelect.value = models.includes(selected) ? selected : "";
  updateModelMenuButton();
  renderReasoningOptions();
}

function getCurrentModelOptions(config = currentConfig) {
  if (config?.assistantMode === "codex") return codexModels;
  return apiModels;
}

function formatModelLabel(model) {
  return String(model || "").replace(/^gpt-/i, "");
}

function updateModelMenuButton() {
  const value = homeModelSelect.value || "";
  homeModelMenuBtn.textContent = value ? formatModelLabel(value) : "模型";
  Array.from(homeModelMenu.querySelectorAll("button")).forEach((item) => {
    const active = item.dataset.model === value;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderReasoningOptions() {
  const selected = homeReasoningSelect.value || "xhigh";
  homeReasoningMenu.innerHTML = "";
  reasoningOptions.forEach(({ value, label }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.role = "option";
    item.dataset.value = value;
    item.textContent = label;
    item.classList.toggle("active", value === selected);
    item.addEventListener("click", async (event) => {
      event.stopPropagation();
      homeReasoningSelect.value = value;
      updateReasoningMenuButton();
      closeAllMenus();
      await saveHomeModel();
    });
    homeReasoningMenu.appendChild(item);
  });
  updateReasoningMenuButton();
}

function updateReasoningMenuButton() {
  const selected = homeReasoningSelect.value || "xhigh";
  const option = reasoningOptions.find((item) => item.value === selected);
  homeReasoningMenuBtn.textContent = option?.label || "超高";
  Array.from(homeReasoningMenu.querySelectorAll("button")).forEach((item) => {
    const active = item.dataset.value === selected;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function updateBuddyModeMenuButton() {
  const selected = buddyModeSelect.value || "cursor";
  const option = buddyModeOptions.find((item) => item.value === selected);
  if (buddyModeMenuBtn) buddyModeMenuBtn.textContent = option?.label || "鼠标旁";
}

function toggleMenu(menuWrap) {
  showDropdown(menuWrap === homeReasoningMenuWrap ? "reasoning" : "model", menuWrap.querySelector(".model-select-btn"));
}

function closeAllMenus(resize = true) {
  closeMenuElements();
  if (resize && window.screenMemory.closeDropdown) window.screenMemory.closeDropdown();
}

function closeMenuElements() {
  homeModelMenuWrap.classList.remove("open");
  homeReasoningMenuWrap.classList.remove("open");
  buddyModeMenuBtn?.classList.remove("open");
  appShell.classList.remove("menu-open");
  homeModelMenuBtn.setAttribute("aria-expanded", "false");
  homeReasoningMenuBtn.setAttribute("aria-expanded", "false");
  buddyModeMenuBtn?.setAttribute("aria-expanded", "false");
}

function setMenuWindowOpen(open) {
  if (menuWindowOpen === Boolean(open)) return;
  menuWindowOpen = Boolean(open);
}

function showDropdown(type, button) {
  if (!button || !window.screenMemory.showDropdown) return;
  const isReasoning = type === "reasoning";
  const isBuddyMode = type === "buddyMode";
  const wrap = isReasoning ? homeReasoningMenuWrap : homeModelMenuWrap;
  closeMenuElements();
  if (isBuddyMode) button.classList.add("open");
  else wrap.classList.add("open");
  button.setAttribute("aria-expanded", "true");
  const rect = button.getBoundingClientRect();
  const items = isBuddyMode
    ? buddyModeOptions
    : isReasoning
      ? reasoningOptions.map((item) => ({ value: item.value, label: item.label }))
      : getCurrentModelOptions(currentConfig).map((model) => ({ value: model, label: formatModelLabel(model) }));
  const selected = isBuddyMode ? buddyModeSelect.value : isReasoning ? homeReasoningSelect.value : homeModelSelect.value;
  window.screenMemory.showDropdown({
    type,
    selected,
    items,
    width: isBuddyMode ? 108 : isReasoning ? 92 : 168,
    rect: {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom
    }
  });
}

async function handleDropdownSelect(payload = {}) {
  if (payload.type === "buddyMode") {
    buddyModeSelect.value = String(payload.value || "cursor");
    updateBuddyModeMenuButton();
    closeMenuElements();
    const config = await window.screenMemory.saveBuddyMode(buddyModeSelect.value);
    renderConfig(config);
    return;
  }
  if (payload.type === "reasoning") {
    homeReasoningSelect.value = String(payload.value || "xhigh");
    updateReasoningMenuButton();
    closeMenuElements();
    await saveHomeModel();
    return;
  }
  homeModelSelect.value = String(payload.value || "");
  updateModelMenuButton();
  closeMenuElements();
  await saveHomeModel();
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
    const active = key === tabName;
    pane.classList.toggle("active", active);
    pane.classList.toggle("leaving", !active);
  });
  requestSettingsResize();
}

function getModelGroupName(model) {
  const value = String(model || "").trim();
  if (!value) return "未选模型";
  const match = value.match(/^([a-z]+-[0-9.]+)/i);
  return match ? match[1] : value;
}

function compactStatus(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > 54 ? `${value.slice(0, 54)}...` : value;
}

function requestSettingsResize() {
  if (!appShell.classList.contains("settings-open") || !window.screenMemory.resizeSettings) return;
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
  requestAnimationFrame(() => {
    appShell.classList.toggle("settings-open", open);
    if (open) {
      directApiKeyInput.focus();
    } else {
      composerInput.focus();
    }
  });
}
