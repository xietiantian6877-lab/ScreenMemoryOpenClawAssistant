const appShell = document.getElementById("appShell");
const composerInput = document.getElementById("composerInput");
const tunnelInput = document.getElementById("tunnelInput");
const sendBtn = document.getElementById("sendBtn");
const saveTunnelBtn = document.getElementById("saveTunnelBtn");
const connectionText = document.getElementById("connectionText");
const settingsStatus = document.getElementById("settingsStatus");
const windowText = document.getElementById("windowText");
const syncText = document.getElementById("syncText");
const petFace = document.getElementById("petFace");

// Collapse/Expand functionality
const petCard = document.getElementById("petCard");
const collapseBtn = document.getElementById("collapseBtn");
const expandBtn = document.getElementById("expandBtn");

collapseBtn.addEventListener("click", () => {
  appShell.classList.add("collapsed");
});

expandBtn.addEventListener("click", () => {
  appShell.classList.remove("collapsed");
});
document.getElementById("openMemoryBtn").addEventListener("click", () => window.screenMemory.openMemoryFolder());
document.getElementById("openMemoryBtnSettings").addEventListener("click", () => window.screenMemory.openMemoryFolder());
document.getElementById("testPopupBtn").addEventListener("click", () => window.screenMemory.testBlockedPopup());
document.getElementById("settingsBtn").addEventListener("click", () => setSettingsOpen(true));
document.getElementById("settingsBackBtn").addEventListener("click", () => setSettingsOpen(false));

sendBtn.addEventListener("click", submitComposer);
composerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitComposer();
});

saveTunnelBtn.addEventListener("click", saveTunnel);
tunnelInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") saveTunnel();
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
  sendBtn.textContent = "…";
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
  saveTunnelBtn.textContent = "保存";
  saveTunnelBtn.disabled = false;
}

function renderState(state) {
  renderConfig(state.config);
  if (state.syncMessage) syncText.textContent = compactSyncText(state.syncMessage);

  if (state.observation) {
    const process = state.observation.active_process || "未知进程";
    const title = state.observation.active_window_title || "未知窗口";
    windowText.textContent = `识别屏幕：${process} · ${title}`;
    petFace.textContent = state.observation.blocked ? "(•̀_•́)" : "(•‿•)";
  }
}

function renderConfig(config) {
  const url = config?.tunnelBaseUrl || "";
  if (document.activeElement !== tunnelInput) tunnelInput.value = url;
  connectionText.textContent = url ? "已连接" : "未填写地址";
  settingsStatus.textContent = url ? "隧穿已保存" : "未填写地址";
}

function compactSyncText(text) {
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
  if (open) tunnelInput.focus();
  else composerInput.focus();
}
