const socket = io();
const cursors = {};
const labels = {};
const chatMessages = document.getElementById("chatMessages");

let username = "";
let usernameColor = "#ffeb3b"; // default yellow
let cursorSkin = "cursor.png"; // default skin

// --- Color selection ---
document.querySelectorAll(".colorBox").forEach(box => {
  box.addEventListener("click", () => {
    usernameColor = box.dataset.color;
    document.querySelectorAll(".colorBox").forEach(b => b.classList.remove("selected"));
    box.classList.add("selected");
  });
});

// --- Join button ---
document.getElementById("joinBtn").addEventListener("click", () => {
  const input = document.getElementById("usernameInput");
  if (input.value.trim() !== "") {
    username = input.value.trim();
    socket.emit("setUsername", { name: username, color: usernameColor });
    document.getElementById("usernameOverlay").style.display = "none";
  }
});

// --- Chat input ---
const chatInput = document.getElementById("chatInput");
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (chatInput.value.trim() !== "") {
      socket.emit("chatMessage", chatInput.value.trim());
      chatInput.value = "";
    }
    e.preventDefault();
  }
});

// Focus chat with "/" and exit with Escape
document.addEventListener("keydown", (e) => {
  if (document.activeElement === chatInput) {
    if (e.key === "Escape") chatInput.blur();
    return;
  }
  if (e.key === "/") {
    e.preventDefault();
    chatInput.focus();
  }
});

chatInput.addEventListener("blur", () => { if (chatInput.value === "") chatInput.placeholder = "Type / to chat"; });
chatInput.addEventListener("focus", () => { chatInput.placeholder = "Type a message..."; });

// --- Cursor functions ---
function createCursor(id, name, color, skin) {
  const cursor = document.createElement("div");
  cursor.classList.add("cursor");
  cursor.id = id;
  cursor.style.backgroundImage = `url(cursors/${skin})`;
  document.body.appendChild(cursor);
  cursors[id] = cursor;

  const label = document.createElement("div");
  label.classList.add("usernameLabel");
  label.innerText = name;
  label.style.color = color;
  document.body.appendChild(label);
  labels[id] = label;
}

function removeCursor(id) {
  if (cursors[id]) { document.body.removeChild(cursors[id]); delete cursors[id]; }
  if (labels[id]) { document.body.removeChild(labels[id]); delete labels[id]; }
}

// Track my cursor
document.addEventListener("mousemove", (e) => {
  socket.emit("cursorMove", { x: e.clientX, y: e.clientY });
});

// Update other cursors
socket.on("cursorMove", ({ id, x, y, username, color, skin }) => {
  if (!cursors[id]) createCursor(id, username, color, skin);

  cursors[id].style.left = `${x}px`;
  cursors[id].style.top = `${y}px`;

  if (skin) cursors[id].style.backgroundImage = `url(cursors/${skin})`;

  if (labels[id]) {
    labels[id].style.left = `${x + 10}px`;
    labels[id].style.top = `${y}px`;
    labels[id].innerText = username;
    labels[id].style.color = color;
  }
});

// Remove cursor when player leaves
socket.on("removeCursor", (id) => removeCursor(id));

// Update player count
socket.on("playerCount", (count) => {
  document.getElementById("playerCount").innerText = `Players online: ${count}`;
});

// Chat messages
socket.on("chatMessage", ({ username, message, color }) => {
  const msg = document.createElement("div");
  msg.innerHTML = `<span style="color:${color}; font-weight:600;">${username}:</span> ${message}`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --- Skins Overlay ---
const skinsButton = document.getElementById("skinsButton");
const skinsOverlay = document.getElementById("skinsOverlay");
const closeSkins = document.getElementById("closeSkins");
const skinsGrid = document.getElementById("skinsGrid");

// Available skins
const skinFiles = [
  { file: "cursor.png", name: "Default" },
  { file: "cursor_red.png", name: "Red" },
  { file: "cursor_orange.png", name: "Orange" },
  { file: "cursor_yellow.png", name: "Yellow" },
  { file: "cursor_green.png", name: "Green" },
  { file: "cursor_lime.png", name: "Lime" },
  { file: "cursor_blue.png", name: "Blue" },
  { file: "cursor_purple.png", name: "Purple" },
  { file: "cursor_pink.png", name: "Pink" }
];

// Populate skins grid
skinFiles.forEach((skin, index) => {
  const div = document.createElement("div");
  div.classList.add("skinOption");
  div.innerHTML = `<img src="cursors/${skin.file}" alt="${skin.name}"><div>${skin.name}</div>`;
  skinsGrid.appendChild(div);

  if(index === 0) div.classList.add("selected"); // default selected

  div.addEventListener("click", () => {
    cursorSkin = skin.file;
    socket.emit("setSkin", cursorSkin); // tell server about the change

    // Only my cursor updates immediately; others get their own skin from server
    document.querySelectorAll(".skinOption").forEach(opt => opt.classList.remove("selected"));
    div.classList.add("selected");
  });
});

// Open/close skins overlay
skinsButton.addEventListener("click", () => skinsOverlay.style.display = "flex");
closeSkins.addEventListener("click", () => skinsOverlay.style.display = "none");

// Close skins overlay with ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && skinsOverlay.style.display === "flex") {
    skinsOverlay.style.display = "none";
  }
});
