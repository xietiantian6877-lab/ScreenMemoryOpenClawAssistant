const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("screenMemory", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveTunnel: (url) => ipcRenderer.invoke("config:saveTunnel", url),
  saveDirectModel: (config) => ipcRenderer.invoke("config:saveDirectModel", config),
  saveBuddyMode: (mode) => ipcRenderer.invoke("config:saveBuddyMode", mode),
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
  submitChat: (text) => ipcRenderer.invoke("chat:submit", text),
  closeChat: () => ipcRenderer.invoke("chat:close"),
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
  }
});
