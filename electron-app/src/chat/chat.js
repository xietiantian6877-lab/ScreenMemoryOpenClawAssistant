const chatInput = document.getElementById("chatInput");
const submitBtn = document.getElementById("submitBtn");
const petFace = document.getElementById("petFace");

petFace.textContent = "(•̀_•́)";
chatInput.focus();

document.getElementById("closeChatBtn").addEventListener("click", () => window.screenMemory.closeChat());
submitBtn.addEventListener("click", submit);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submit();
});

async function submit() {
  const text = chatInput.value.trim();
  if (!text) {
    window.screenMemory.closeChat();
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "确认中";
  petFace.textContent = "(•_•)";
  await window.screenMemory.submitChat(text);
  petFace.textContent = "(•‿•)";
  submitBtn.textContent = "已确认";
  setTimeout(() => window.screenMemory.closeChat(), 600);
}
