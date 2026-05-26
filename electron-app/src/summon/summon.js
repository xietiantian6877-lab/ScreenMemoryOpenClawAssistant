document.getElementById("typeBtn").addEventListener("click", () => window.screenMemory.summonType());
document.getElementById("guideBtn").addEventListener("click", () => window.screenMemory.summonGuide());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
});
