const appShell = document.getElementById("appShell");
const composerInput = document.getElementById("composerInput");
const tunnelInput = document.getElementById("tunnelInput");
const directBaseUrlInput = document.getElementById("directBaseUrlInput");
const directApiKeyInput = document.getElementById("directApiKeyInput");
const directModelInput = document.getElementById("directModelInput");
const directReviewModelInput = document.getElementById("directReviewModelInput");
const sendBtn = document.getElementById("sendBtn");
const saveTunnelBtn = document.getElementById("saveTunnelBtn");
const saveDirectBtn = document.getElementById("saveDirectBtn");
const connectionText = document.getElementById("connectionText");
const settingsStatus = document.getElementById("settingsStatus");
const windowText = document.getElementById("windowText");
const syncText = document.getElementById("syncText");
const packageText = document.getElementById("packageText");
const petFace = document.getElementById("petFace");
const petCard = document.getElementById("petCard");
const buddyModeSelect = document.getElementById("buddyModeSelect");

let isCollapsed = false;

async function setCollapsed(collapsed) {
  isCollapsed = collapsed;
  appShell.classList.toggle("collapsed", collapsed);
  await window.screenMemory.toggleCollapse(collapsed);
}

petCard.addEventListener("click", () => setCollapsed(!isCollapsed));

document.getElementById("openMemoryBtn").addEventListener("click", () => window.screenMemory.openMemoryFolder());
document.getElementById("openMemoryBtnSettings").addEventListener("click", () => window.screenMemory.openMemoryFolder());
document.getElementById("openPackagesBtn").addEventListener("click", () => window.screenMemory.openPackagesFolder());
document.getElementById("testPopupBtn").addEventListener("click", () => window.screenMemory.testBlockedPopup());
document.getElementById("summonBtn").addEventListener("click", () => window.screenMemory.summonMenu());
document.getElementById("settingsBtn").addEventListener("click", () => setSettingsOpen(true));
document.getElementById("settingsBackBtn").addEventListener("click", () => setSettingsOpen(false));
document.getElementById("packageTodayBtn").addEventListener("click", () => packageMemory("today"));
document.getElementById("packageWeekBtn").addEventListener("click", () => packageMemory("week"));
document.getElementById("packageAllBtn").addEventListener("click", () => packageMemory("all"));
document.getElementById("importPackageBtn").addEventListener("click", importMemoryPackage);
buddyModeSelect.addEventListener("change", async () => {
  const config = await window.screenMemory.saveBuddyMode(buddyModeSelect.value);
  renderConfig(config);
});

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

document.getElementById("syncTodayBtn").addEventListener("click", async () => {
  syncText.textContent = "同步中";
  syncText.textContent = compactSyncText(await window.screenMemory.syncToday());
});

window.screenMemory.onStateUpdate(renderState);
window.screenMemory.getState().then(renderState);

async function submitComposer() {
  const value = composerInput.value.trim();
  if (!value) return;
  sendBtn.disabled = true;
  sendBtn.textContent = "...";
  petFace.textContent = "(•_•)";
  await window.screenMemory.submitChat(value);
  composerInput.value = "";
  petFace.textContent = "(•‿•)";
  sendBtn.textContent = "↑";
  sendBtn.disabled = false;
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
    directBaseUrl: directBaseUrlInput.value.trim(),
    directApiKey: directApiKeyInput.value.trim(),
    directModel: directModelInput.value.trim() || "gpt-5.5",
    directReviewModel: directReviewModelInput.value.trim() || "gpt-5.4",
    directReasoningEffort: "xhigh",
    directWireApi: "responses",
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
  const tunnelUrl = config?.tunnelBaseUrl || "";
  if (document.activeElement !== tunnelInput) tunnelInput.value = tunnelUrl;
  if (document.activeElement !== directBaseUrlInput) directBaseUrlInput.value = config?.directBaseUrl || "";
  if (document.activeElement !== directModelInput) directModelInput.value = config?.directModel || "gpt-5.5";
  if (document.activeElement !== directReviewModelInput) directReviewModelInput.value = config?.directReviewModel || "gpt-5.4";
  if (document.activeElement !== buddyModeSelect) buddyModeSelect.value = config?.buddyDefaultMode || "cursor";

  if (config?.directEnabled) {
    connectionText.textContent = "OpenAI 直连";
    settingsStatus.textContent = `${config.directModelProvider || "OpenAI"} ${config.directModel || ""}`;
  } else if (tunnelUrl) {
    connectionText.textContent = "隧穿已连接";
    settingsStatus.textContent = "OpenClaw 隧穿";
  } else {
    connectionText.textContent = "本地判断";
    settingsStatus.textContent = "未配置直连/隧穿";
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
