const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("screenMemory", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveTunnel: (url) => ipcRenderer.invoke("config:saveTunnel", url),
  syncToday: () => ipcRenderer.invoke("memory:syncToday"),
  openMemoryFolder: () => ipcRenderer.invoke("memory:openFolder"),
  testBlockedPopup: () => ipcRenderer.invoke("debug:testBlockedPopup"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  hide: () => ipcRenderer.invoke("window:hide"),
  close: () => ipcRenderer.invoke("window:close"),
  toggleCollapse: (collapsed) => ipcRenderer.invoke("window:toggleCollapse", collapsed),
  setWindowMode: (mode) => ipcRenderer.invoke("window:setMode", mode),
  submitChat: (text) => ipcRenderer.invoke("chat:submit", text),
  closeChat: () => ipcRenderer.invoke("chat:close"),
  onStateUpdate: (handler) => {
    ipcRenderer.on("state:update", (_event, state) => handler(state));
  },
  getPrompt: () => {
    const arg = process.argv.find((item) => item.startsWith("--prompt="));
    return arg ? decodeURIComponent(arg.slice("--prompt=".length)) : "";
  }
});
