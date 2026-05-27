const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("screenMemory", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveTunnel: (url) => ipcRenderer.invoke("config:saveTunnel", url),
  saveDirectModel: (config) => ipcRenderer.invoke("config:saveDirectModel", config),
  saveAssistantMode: (mode) => ipcRenderer.invoke("config:saveAssistantMode", mode),
  saveCodexSettings: (config) => ipcRenderer.invoke("config:saveCodexSettings", config),
  listModels: (force) => ipcRenderer.invoke("models:list", force),
  refreshCodexStatus: () => ipcRenderer.invoke("codex:refreshStatus"),
  saveBuddyMode: (mode) => ipcRenderer.invoke("config:saveBuddyMode", mode),
  saveCasualChatFrequency: (value) => ipcRenderer.invoke("config:saveCasualChatFrequency", value),
  saveProactiveGuidance: (enabled) => ipcRenderer.invoke("config:saveProactiveGuidance", enabled),
  syncToday: () => ipcRenderer.invoke("memory:syncToday"),
  packageMemory: (scope) => ipcRenderer.invoke("memory:package", scope),
  importMemoryPackage: () => ipcRenderer.invoke("memory:importPackage"),
  openMemoryFolder: () => ipcRenderer.invoke("memory:openFolder"),
  openPackagesFolder: () => ipcRenderer.invoke("memory:openPackagesFolder"),
  testBlockedPopup: () => ipcRenderer.invoke("debug:testBlockedPopup"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hide: () => ipcRenderer.invoke("window:hide"),
  close: () => ipcRenderer.invoke("window:close"),
  toggleCollapse: (collapsed) => ipcRenderer.invoke("window:toggleCollapse", collapsed),
  setWindowMode: (mode) => ipcRenderer.invoke("window:setMode", mode),
  setMenuOpen: (open) => ipcRenderer.invoke("window:setMenuOpen", open),
  showDropdown: (payload) => ipcRenderer.invoke("dropdown:show", payload),
  closeDropdown: () => ipcRenderer.invoke("dropdown:close"),
  selectDropdown: (payload) => ipcRenderer.invoke("dropdown:select", payload),
  onDropdownSelect: (handler) => {
    ipcRenderer.on("dropdown:select", (_event, payload) => handler(payload));
  },
  onDropdownClosed: (handler) => {
    ipcRenderer.on("dropdown:closed", () => handler());
  },
  resizeSettings: (height) => ipcRenderer.invoke("window:resizeSettings", height),
  submitChat: (text) => ipcRenderer.invoke("chat:submit", text),
  closeChat: () => ipcRenderer.invoke("chat:close"),
  resizeChat: (bounds) => ipcRenderer.invoke("chat:resize", bounds),
  showTypewriter: (text) => ipcRenderer.invoke("buddy:typewriter", text),
  resizeTypewriter: (bounds) => ipcRenderer.invoke("buddy:typewriterResize", bounds),
  summonMenu: () => ipcRenderer.invoke("buddy:summonMenu"),
  summonType: () => ipcRenderer.invoke("buddy:summonType"),
  summonGuide: () => ipcRenderer.invoke("buddy:summonGuide"),
  onStateUpdate: (handler) => {
    ipcRenderer.on("state:update", (_event, state) => handler(state));
  },
  getPrompt: () => {
    const arg = process.argv.find((item) => item.startsWith("--prompt="));
    return arg ? decodeURIComponent(arg.slice("--prompt=".length)) : "";
  },
  getDropdownPayload: () => {
    const arg = process.argv.find((item) => item.startsWith("--dropdown="));
    if (!arg) return {};
    try {
      return JSON.parse(decodeURIComponent(arg.slice("--dropdown=".length)));
    } catch {
      return {};
    }
  }
});
