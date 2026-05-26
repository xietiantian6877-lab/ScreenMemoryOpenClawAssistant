const { ipcRenderer } = require("electron");

const cursor = document.getElementById("cursor");
const face = document.getElementById("face");

const faces = {
  ready: "(•‿•)",
  local: "(•‿•)",
  thinking: "(•_•?)",
  speaking: "(•‿•)",
  leaving: "(•‿•)"
};

ipcRenderer.on("buddy:mood", (_event, mood) => {
  cursor.dataset.mood = mood;
  face.textContent = faces[mood] || faces.ready;
});
