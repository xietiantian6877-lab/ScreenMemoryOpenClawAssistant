const params = new URLSearchParams(window.location.search);
const fullText = params.get("text") || "";
const autoCloseMs = Number(params.get("autoCloseMs") || 14000);
const textEl = document.getElementById("text");
const buddyEl = document.querySelector(".buddy");
const { ipcRenderer } = require("electron");

let lastWidth = 0;
let lastHeight = 0;

function requestResize() {
  const textLength = Math.max(1, textEl.textContent.length);
  const desiredWidth = Math.min(540, Math.max(318, Math.ceil(textLength * 6.6) + 70));
  buddyEl.style.width = `${desiredWidth - 32}px`;
  const desiredHeight = Math.min(
    Math.max(84, Math.ceil(buddyEl.scrollHeight) + 18),
    Math.max(120, Math.floor(window.screen.availHeight * 0.58))
  );
  if (Math.abs(desiredWidth - lastWidth) < 8 && Math.abs(desiredHeight - lastHeight) < 6) return;
  lastWidth = desiredWidth;
  lastHeight = desiredHeight;
  ipcRenderer.invoke("buddy:typewriterResize", { width: desiredWidth, height: desiredHeight }).catch(() => {});
}

let index = 0;
function tick() {
  textEl.textContent = fullText.slice(0, index);
  requestResize();
  index += 1;
  if (index <= fullText.length) {
    window.setTimeout(tick, fullText.charCodeAt(index - 1) > 255 ? 42 : 24);
  }
}

requestResize();
tick();
if (autoCloseMs > 0) {
  window.setTimeout(() => {
    document.body.classList.add("leaving");
    window.setTimeout(() => window.close(), 180);
  }, Math.max(2400, autoCloseMs));
}
