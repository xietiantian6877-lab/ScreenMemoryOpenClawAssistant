const params = new URLSearchParams(window.location.search);
document.getElementById("titleText").textContent = params.get("title") || "消息";
document.getElementById("messageText").textContent = params.get("message") || "";

setTimeout(() => {
  document.body.classList.add("leaving");
}, 3400);

setTimeout(() => {
  window.close();
}, 4100);
