const menu = document.getElementById("menu");

function readPayload() {
  return window.screenMemory.getDropdownPayload?.() || { type: "model", selected: "", items: [] };
}

const payload = readPayload();
const items = Array.isArray(payload.items) ? payload.items : [];
if (Number(payload.width) > 0) menu.style.setProperty("--menu-width", `${Number(payload.width)}px`);
if (Number(payload.height) > 0) menu.style.setProperty("--menu-height", `${Number(payload.height)}px`);
if (Number(payload.pad) >= 0) menu.style.setProperty("--menu-pad", `${Number(payload.pad)}px`);

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
