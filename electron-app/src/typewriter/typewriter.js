const params = new URLSearchParams(window.location.search);
const fullText = params.get("text") || "";
const autoCloseMs = Number(params.get("autoCloseMs") || 14000);
const textEl = document.getElementById("text");

let index = 0;
function tick() {
  textEl.textContent = fullText.slice(0, index);
  index += 1;
  if (index <= fullText.length) {
    window.setTimeout(tick, fullText.charCodeAt(index - 1) > 255 ? 42 : 24);
  }
}

tick();
if (autoCloseMs > 0) {
  window.setTimeout(() => {
    document.body.classList.add("leaving");
    window.setTimeout(() => window.close(), 180);
  }, Math.max(2400, autoCloseMs));
}
