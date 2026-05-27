const chatInput = document.getElementById("chatInput");
const submitBtn = document.getElementById("submitBtn");
const petFace = document.getElementById("petFace");

const minInputWidth = 190;
const maxInputWidth = 440;
const minInputHeight = 34;
const maxInputHeight = 118;
let resizeTimer = null;

petFace.textContent = "(•̀_•́)";
chatInput.focus();
resizeToContent();

document.getElementById("closeChatBtn").addEventListener("click", () => window.screenMemory.closeChat());
submitBtn.addEventListener("click", submit);
chatInput.addEventListener("input", resizeToContent);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
  if (event.key === "Escape") window.screenMemory.closeChat();
});

async function submit() {
  const text = chatInput.value.trim();
  if (!text) {
    window.screenMemory.closeChat();
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "...";
  petFace.textContent = "(•_•)";
  await window.screenMemory.submitChat(text);
  petFace.textContent = "(•‿•)";
  submitBtn.textContent = "✓";
  setTimeout(() => window.screenMemory.closeChat(), 420);
}

function resizeToContent() {
  const rawText = chatInput.value || chatInput.placeholder || "";
  const longestLine = rawText.split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0);
  const estimatedWidth = Math.ceil(longestLine * 14 + 38);
  const nextWidth = clamp(estimatedWidth, minInputWidth, maxInputWidth);
  chatInput.style.setProperty("--input-width", `${nextWidth}px`);
  chatInput.style.height = `${minInputHeight}px`;
  const nextHeight = clamp(chatInput.scrollHeight, minInputHeight, maxInputHeight);
  chatInput.style.setProperty("--input-height", `${nextHeight}px`);
  chatInput.style.height = `${nextHeight}px`;
  chatInput.style.overflowY = chatInput.scrollHeight > maxInputHeight ? "auto" : "hidden";
  scheduleWindowResize();
}

function scheduleWindowResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const inputWidth = parseFloat(chatInput.style.getPropertyValue("--input-width")) || minInputWidth;
    const inputHeight = parseFloat(chatInput.style.getPropertyValue("--input-height")) || minInputHeight;
    const desiredWidth = Math.ceil(inputWidth + 6 + 34 + 6 + 34 + 8 + 46 + 12);
    const desiredHeight = Math.ceil(Math.max(inputHeight + 12, 46) + 12);
    window.screenMemory?.resizeChat?.({ width: desiredWidth, height: desiredHeight });
  }, 20);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
