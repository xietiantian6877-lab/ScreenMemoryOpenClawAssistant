const menu = document.getElementById("menu");

function readPayload() {
  return window.screenMemory.getDropdownPayload?.() || { type: "model", selected: "", items: [] };
}

const payload = readPayload();
const items = Array.isArray(payload.items) ? payload.items : [];

items.forEach((item) => {
  const button = document.createElement("button");
  const value = String(item.value || "");
  button.type = "button";
  button.textContent = String(item.label || value);
  button.classList.toggle("active", value === String(payload.selected || ""));
  button.addEventListener("click", () => {
    window.screenMemory.selectDropdown({
      type: String(payload.type || "model"),
      value
    });
  });
  menu.appendChild(button);
});
