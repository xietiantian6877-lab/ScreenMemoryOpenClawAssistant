const params = new URLSearchParams(window.location.search);
let fullText = params.get("text") || "";
const autoCloseMs = Number(params.get("autoCloseMs") || 14000);
const textEl = document.getElementById("text");
const buddyEl = document.querySelector(".buddy");
const { ipcRenderer } = require("electron");

let lastWidth = 0;
let lastHeight = 0;
let index = 0;
let typingTimer = null;
let closeTimer = null;

function requestResize() {
  const desiredWidth = 318;
  const desiredHeight = Math.min(
    Math.max(84, Math.ceil(buddyEl.scrollHeight) + 18),
    Math.max(120, Math.floor(window.screen.availHeight * 0.58))
  );
  if (Math.abs(desiredHeight - lastHeight) < 6 && desiredWidth === lastWidth) return;
  lastWidth = desiredWidth;
  lastHeight = desiredHeight;
  ipcRenderer.invoke("buddy:typewriterResize", { width: desiredWidth, height: desiredHeight }).catch(() => {});
}

function scheduleTick(delay) {
  clearTimeout(typingTimer);
  typingTimer = window.setTimeout(tick, delay);
}

function tick() {
  textEl.textContent = fullText.slice(0, index);
  requestResize();
  index += 1;
  if (index <= fullText.length) {
    scheduleTick(fullText.charCodeAt(index - 1) > 255 ? 42 : 24);
  }
}

function setText(text, instant = false) {
  fullText = String(text || "");
  index = instant ? fullText.length + 1 : 0;
  clearTimeout(typingTimer);
  tick();
}

ipcRenderer.on("typewriter:update", (_event, payload = {}) => {
  setText(payload.text || "", Boolean(payload.instant));
});

requestResize();
tick();
if (autoCloseMs > 0) {
  closeTimer = window.setTimeout(() => {
    document.body.classList.add("leaving");
    window.setTimeout(() => window.close(), 180);
  }, Math.max(2400, autoCloseMs));
}
