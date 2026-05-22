const socket = io();
const cursors = {};
const labels = {};
const chatMessages = document.getElementById("chatMessages");
const backgroundCanvas = document.getElementById("backgroundCanvas");
const backgroundContext = backgroundCanvas.getContext("2d");
const paintCanvas = document.getElementById("paintCanvas");
const paintContext = paintCanvas.getContext("2d");
const paintToggle = document.getElementById("paintToggle");
const eraserToggle = document.getElementById("eraserToggle");
const imageEraserToggle = document.getElementById("imageEraserToggle");
const laserToggle = document.getElementById("laserToggle");
const brushColorInput = document.getElementById("brushColor");
const brushSizeInput = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const undoActionButton = document.getElementById("undoAction");
const redoActionButton = document.getElementById("redoAction");
const backgroundFitSelect = document.getElementById("backgroundFit");
const backgroundGallerySelect = document.getElementById("backgroundGallery");
const stampSelect = document.getElementById("stampSelect");
const reactionSelect = document.getElementById("reactionSelect");
const importBackgroundButton = document.getElementById("importBackground");
const backgroundFileInput = document.getElementById("backgroundFile");
const saveCanvasButton = document.getElementById("saveCanvas");
const clearBackgroundButton = document.getElementById("clearBackground");
const clearPaintButton = document.getElementById("clearPaint");

let username = "";
let usernameColor = "#ffeb3b"; // default yellow
let cursorSkin = "cursors/cursor.png"; // default skin
let hasJoined = false;
let paintMode = false;
let paintTool = "brush";
let laserMode = false;
let isDrawing = false;
let currentStroke = null;
let paintHistory = [];
let backgroundImageSource = null;
let backgroundImageElement = null;
let backgroundEraseHistory = [];
let backgroundFit = "cover";
let backgroundGallery = [];
let stampHistory = [];
let undoStack = [];
let redoStack = [];
let laserDots = {};
let pendingCursorPoint = null;
let cursorEmitTimeout = null;
let lastCursorEmit = 0;

const MAX_BACKGROUND_FILE_SIZE = 3000000;
const CURSOR_SEND_INTERVAL = 33;

function resizePaintCanvas() {
  const snapshot = paintHistory.slice();
  paintCanvas.width = window.innerWidth;
  paintCanvas.height = window.innerHeight;
  paintContext.lineCap = "round";
  paintContext.lineJoin = "round";
  clearPaintCanvas();
  snapshot.forEach(drawStroke);
}

function resizeBackgroundCanvas() {
  backgroundCanvas.width = window.innerWidth;
  backgroundCanvas.height = window.innerHeight;
  backgroundContext.lineCap = "round";
  backgroundContext.lineJoin = "round";
  redrawBackgroundCanvas();
}

function rerenderPaintCanvas() {
  clearPaintCanvas();
  paintHistory.forEach(drawStroke);
}

function clearPaintCanvas() {
  paintContext.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
}

function clearBackgroundCanvas() {
  backgroundContext.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
}

function drawBackgroundImage() {
  if (!backgroundImageElement) return;

  const canvasWidth = backgroundCanvas.width;
  const canvasHeight = backgroundCanvas.height;
  const imageWidth = backgroundImageElement.width;
  const imageHeight = backgroundImageElement.height;
  const canvasRatio = canvasWidth / canvasHeight;
  const imageRatio = imageWidth / imageHeight;
  let width = backgroundCanvas.width;
  let height = backgroundCanvas.height;
  let x = 0;
  let y = 0;

  if (backgroundFit === "contain") {
    if (imageRatio > canvasRatio) {
      width = canvasWidth;
      height = width / imageRatio;
      y = (canvasHeight - height) / 2;
    } else {
      height = canvasHeight;
      width = height * imageRatio;
      x = (canvasWidth - width) / 2;
    }
  } else if (backgroundFit === "center") {
    width = imageWidth;
    height = imageHeight;
    x = (canvasWidth - width) / 2;
    y = (canvasHeight - height) / 2;
  } else if (backgroundFit === "stretch") {
    width = canvasWidth;
    height = canvasHeight;
  } else {
    if (imageRatio > canvasRatio) {
      height = canvasHeight;
      width = height * imageRatio;
      x = (canvasWidth - width) / 2;
    } else {
      width = canvasWidth;
      height = width / imageRatio;
      y = (canvasHeight - height) / 2;
    }
  }

  backgroundContext.drawImage(backgroundImageElement, x, y, width, height);
}

function redrawBackgroundCanvas() {
  clearBackgroundCanvas();
  drawBackgroundImage();
  backgroundEraseHistory.forEach(drawBackgroundEraseStroke);
}

function drawStroke(stroke) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return;

  paintContext.save();
  paintContext.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
  paintContext.strokeStyle = stroke.color;
  paintContext.lineWidth = stroke.size;
  paintContext.beginPath();
  paintContext.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (let index = 1; index < stroke.points.length; index++) {
    paintContext.lineTo(stroke.points[index].x, stroke.points[index].y);
  }

  paintContext.stroke();
  paintContext.restore();
}

function drawBackgroundEraseStroke(stroke) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return;

  backgroundContext.save();
  backgroundContext.globalCompositeOperation = "destination-out";
  backgroundContext.lineWidth = stroke.size;
  backgroundContext.lineCap = "round";
  backgroundContext.lineJoin = "round";
  backgroundContext.beginPath();
  backgroundContext.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (let index = 1; index < stroke.points.length; index++) {
    backgroundContext.lineTo(stroke.points[index].x, stroke.points[index].y);
  }

  backgroundContext.stroke();
  backgroundContext.restore();
}

function drawAllEraseStroke(stroke) {
  drawBackgroundEraseStroke(stroke);
  drawStroke({
    ...stroke,
    color: "#000000",
    tool: "eraser"
  });
}

function setPaintMode(enabled) {
  paintMode = enabled;
  paintToggle.classList.toggle("active", paintMode);
  if (paintMode) setLaserMode(false);
}

function setPaintTool(tool) {
  paintTool = tool;
  eraserToggle.classList.toggle("active", paintTool === "eraser");
  imageEraserToggle.classList.toggle("active", paintTool === "allEraser");
}

function setLaserMode(enabled) {
  laserMode = enabled;
  laserToggle.classList.toggle("active", laserMode);
  if (laserMode) setPaintMode(false);
}

function rememberAction(type, item) {
  undoStack.push({ type, item });
  redoStack = [];
}

function renderBackgroundGallery() {
  backgroundGallerySelect.innerHTML = '<option value="">Backgrounds</option>';
  backgroundGallery.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.innerText = `Background ${index + 1}`;
    backgroundGallerySelect.appendChild(option);
  });
}

function renderStamps() {
  document.querySelectorAll(".stamp").forEach(stamp => stamp.remove());
  stampHistory.forEach(renderStamp);
}

function renderStamp(stamp) {
  const div = document.createElement("div");
  div.classList.add("stamp");
  div.dataset.stampId = stamp.id;
  div.innerText = stamp.emoji;
  div.style.left = `${stamp.x}px`;
  div.style.top = `${stamp.y}px`;
  div.style.fontSize = `${stamp.size}px`;
  document.body.appendChild(div);
}

function showReaction({ reaction, x, y, color }) {
  const bubble = document.createElement("div");
  bubble.classList.add("reactionBubble");
  bubble.innerText = reaction;
  bubble.style.left = `${x}px`;
  bubble.style.top = `${y}px`;
  bubble.style.color = color || "#ffffff";
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 1900);
}

function showLaserPoint({ id, x, y, color }) {
  if (!laserDots[id]) {
    const dot = document.createElement("div");
    dot.classList.add("laserDot");
    document.body.appendChild(dot);
    laserDots[id] = dot;
  }

  const dot = laserDots[id];
  dot.style.left = `${x}px`;
  dot.style.top = `${y}px`;
  dot.style.color = color || "#ffffff";
  dot.style.background = color || "#ffffff";
  dot.style.opacity = "0.9";

  clearTimeout(dot.hideTimeout);
  dot.hideTimeout = setTimeout(() => {
    dot.style.opacity = "0";
  }, 450);
}

function getPaintPoint(event) {
  return { x: event.clientX, y: event.clientY };
}

function joinCursorverse(name, color) {
  username = name.trim();
  usernameColor = color;
  hasJoined = true;
  localStorage.setItem("cursorverseUsername", username);
  localStorage.setItem("cursorverseColor", usernameColor);
  document.getElementById("usernameOverlay").style.display = "none";
  document.body.classList.remove("showSystemCursor");
  socket.emit("setUsername", { name: username, color: usernameColor });
  socket.emit("setSkin", cursorSkin);
  if (socket.id && !cursors[socket.id]) {
    createCursor(socket.id, username, usernameColor, cursorSkin);
  }
}

function scheduleCursorEmit(x, y) {
  if (!hasJoined || !socket.connected) return;
  pendingCursorPoint = { x, y };

  const now = Date.now();
  const elapsed = now - lastCursorEmit;
  if (elapsed >= CURSOR_SEND_INTERVAL) {
    emitPendingCursor();
    return;
  }

  if (!cursorEmitTimeout) {
    cursorEmitTimeout = setTimeout(emitPendingCursor, CURSOR_SEND_INTERVAL - elapsed);
  }
}

function emitPendingCursor() {
  cursorEmitTimeout = null;
  if (!pendingCursorPoint || !hasJoined || !socket.connected) return;
  socket.volatile.emit("cursorMove", pendingCursorPoint);
  pendingCursorPoint = null;
  lastCursorEmit = Date.now();
}

resizePaintCanvas();
resizeBackgroundCanvas();
window.addEventListener("resize", () => {
  resizeBackgroundCanvas();
  resizePaintCanvas();
});

paintToggle.addEventListener("click", () => setPaintMode(!paintMode));
eraserToggle.addEventListener("click", () => {
  setPaintMode(true);
  setPaintTool(paintTool === "eraser" ? "brush" : "eraser");
});
imageEraserToggle.addEventListener("click", () => {
  setPaintMode(true);
  setPaintTool(paintTool === "allEraser" ? "brush" : "allEraser");
});
laserToggle.addEventListener("click", () => setLaserMode(!laserMode));

undoActionButton.addEventListener("click", () => {
  const action = undoStack.pop();
  if (!action) return;
  redoStack.push(action);
  const undoPayload = {
    type: action.type,
    id: action.item.id
  };
  if (action.type === "allErase") undoPayload.paintId = action.item.paintId;
  socket.emit("undoAction", undoPayload);
});

redoActionButton.addEventListener("click", () => {
  const action = redoStack.pop();
  if (!action) return;
  socket.emit("redoAction", action);
});

backgroundFitSelect.addEventListener("change", () => {
  socket.emit("setBackgroundFit", backgroundFitSelect.value);
});

backgroundGallerySelect.addEventListener("change", () => {
  if (!backgroundGallerySelect.value) return;
  socket.emit("selectBackgroundFromGallery", backgroundGallerySelect.value);
  backgroundGallerySelect.value = "";
});

stampSelect.addEventListener("change", () => {
  if (stampSelect.value) {
    setPaintMode(false);
    setLaserMode(false);
  }
});

reactionSelect.addEventListener("change", () => {
  if (!reactionSelect.value) return;
  const ownCursor = cursors[socket.id];
  const rect = ownCursor ? ownCursor.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
  socket.emit("reaction", {
    reaction: reactionSelect.value,
    x: rect.left + 10,
    y: rect.top
  });
  reactionSelect.value = "";
});

brushSizeInput.addEventListener("input", () => {
  brushSizeValue.innerText = `${brushSizeInput.value}px`;
});

clearPaintButton.addEventListener("click", () => {
  socket.emit("clearPaint");
});

importBackgroundButton.addEventListener("click", () => {
  backgroundFileInput.click();
});

backgroundFileInput.addEventListener("change", () => {
  const file = backgroundFileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Please choose a PNG, JPG, or WebP image.");
    backgroundFileInput.value = "";
    return;
  }
  if (file.size > MAX_BACKGROUND_FILE_SIZE) {
    alert("Please choose an image under 3 MB.");
    backgroundFileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    socket.emit("setBackground", reader.result);
    backgroundFileInput.value = "";
  };
  reader.readAsDataURL(file);
});

clearBackgroundButton.addEventListener("click", () => {
  socket.emit("clearBackground");
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function saveCanvasSnapshot() {
  const snapshotCanvas = document.createElement("canvas");
  const snapshotContext = snapshotCanvas.getContext("2d");
  snapshotCanvas.width = paintCanvas.width;
  snapshotCanvas.height = paintCanvas.height;

  snapshotContext.fillStyle = getComputedStyle(document.body).backgroundColor || "#202020";
  snapshotContext.fillRect(0, 0, snapshotCanvas.width, snapshotCanvas.height);
  snapshotContext.drawImage(backgroundCanvas, 0, 0);
  snapshotContext.drawImage(paintCanvas, 0, 0);

  stampHistory.forEach(stamp => {
    snapshotContext.save();
    snapshotContext.font = `${stamp.size}px Poppins, sans-serif`;
    snapshotContext.textAlign = "center";
    snapshotContext.textBaseline = "middle";
    snapshotContext.shadowColor = "rgba(0, 0, 0, 0.9)";
    snapshotContext.shadowBlur = 2;
    snapshotContext.shadowOffsetX = 1;
    snapshotContext.shadowOffsetY = 1;
    snapshotContext.fillText(stamp.emoji, stamp.x, stamp.y);
    snapshotContext.restore();
  });

  snapshotContext.font = "600 14px Poppins, sans-serif";
  snapshotContext.textAlign = "center";
  snapshotContext.textBaseline = "bottom";
  snapshotContext.shadowColor = "rgba(0, 0, 0, 0.9)";
  snapshotContext.shadowBlur = 2;
  snapshotContext.shadowOffsetX = 1;
  snapshotContext.shadowOffsetY = 1;

  const cursorEntries = Object.entries(cursors);
  for (const [id, cursor] of cursorEntries) {
    const label = labels[id];
    const cursorRect = cursor.getBoundingClientRect();
    const labelText = label ? label.innerText : "";
    const labelColor = label ? label.style.color : "#ffffff";
    const backgroundImage = cursor.style.backgroundImage;
    const imageMatch = backgroundImage.match(/url\(["']?(.+?)["']?\)/);

    if (imageMatch) {
      try {
        const image = await loadImage(imageMatch[1]);
        snapshotContext.drawImage(image, cursorRect.left, cursorRect.top, cursorRect.width, cursorRect.height);
      } catch {
        snapshotContext.fillStyle = labelColor;
        snapshotContext.fillRect(cursorRect.left, cursorRect.top, cursorRect.width, cursorRect.height);
      }
    }

    if (labelText) {
      snapshotContext.fillStyle = labelColor;
      snapshotContext.fillText(labelText, cursorRect.left + cursorRect.width / 2 + 10, cursorRect.top - 4);
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadDataUrl(snapshotCanvas.toDataURL("image/png"), `cursorverse-${timestamp}.png`);
}

saveCanvasButton.addEventListener("click", () => {
  saveCanvasSnapshot();
});

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
    joinCursorverse(input.value.trim(), usernameColor);
  }
});

const savedUsername = localStorage.getItem("cursorverseUsername");
const savedColor = localStorage.getItem("cursorverseColor");
if (savedColor && /^#[0-9a-fA-F]{6}$/.test(savedColor)) {
  usernameColor = savedColor;
  document.querySelectorAll(".colorBox").forEach((box) => {
    box.classList.toggle("selected", box.dataset.color === savedColor);
  });
}
if (savedUsername) {
  document.getElementById("usernameInput").value = savedUsername;
}

socket.on("connect", () => {
  if (hasJoined && username) {
    socket.emit("setUsername", { name: username, color: usernameColor });
    socket.emit("setSkin", cursorSkin);
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
  if (e.key.toLowerCase() === "p") {
    setPaintMode(!paintMode);
  }
  if (e.key.toLowerCase() === "e") {
    setPaintMode(true);
    setPaintTool(paintTool === "eraser" ? "brush" : "eraser");
  }
  if (e.key.toLowerCase() === "i") {
    setPaintMode(true);
    setPaintTool(paintTool === "allEraser" ? "brush" : "allEraser");
  }
});

chatInput.addEventListener("blur", () => {
  if (chatInput.value === "") chatInput.placeholder = "Type / to chat";
});
chatInput.addEventListener("focus", () => {
  chatInput.placeholder = "Type a message...";
});

// --- Cursor functions ---
function createCursor(id, name, color, skin) {
  if (cursors[id]) return; // avoid duplicates

  const cursor = document.createElement("div");
  cursor.classList.add("cursor");
  cursor.id = id;
  cursor.style.backgroundImage = `url(${skin})`;
  cursor.style.backgroundSize = "contain";
  cursor.style.backgroundRepeat = "no-repeat";
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

// Track your cursor
document.addEventListener("mousemove", (e) => {
  scheduleCursorEmit(e.clientX, e.clientY);

  // Update your own cursor immediately
  if (cursors[socket.id]) {
    cursors[socket.id].style.left = `${e.clientX}px`;
    cursors[socket.id].style.top = `${e.clientY}px`;
    labels[socket.id].style.left = `${e.clientX + 10}px`;
    labels[socket.id].style.top = `${e.clientY}px`;
  }

  if (laserMode) {
    if (hasJoined) socket.volatile.emit("laserPoint", { x: e.clientX, y: e.clientY });
    showLaserPoint({
      id: socket.id,
      x: e.clientX,
      y: e.clientY,
      color: usernameColor
    });
  }

  if (isDrawing && currentStroke) {
    currentStroke.points.push(getPaintPoint(e));
    const segment = {
      ...currentStroke,
      points: currentStroke.points.slice(-2)
    };

    if (currentStroke.tool === "allEraser") {
      drawAllEraseStroke(segment);
    } else {
      drawStroke(segment);
    }
  }
});

document.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || e.target.closest("#paintToolbar, #chatBox, #skinsButton, #skinsOverlay, #usernameOverlay")) return;

  if (stampSelect.value) {
    socket.emit("placeStamp", {
      emoji: stampSelect.value,
      x: e.clientX,
      y: e.clientY,
      size: Math.max(24, Number(brushSizeInput.value) * 1.5)
    });
    return;
  }

  if (!paintMode) return;

  isDrawing = true;
  currentStroke = {
    color: brushColorInput.value,
    size: Number(brushSizeInput.value),
    tool: paintTool,
    points: [getPaintPoint(e)]
  };
});

document.addEventListener("mouseup", () => {
  if (!isDrawing || !currentStroke) return;

  isDrawing = false;
  if (currentStroke.points.length > 1) {
    if (currentStroke.tool === "allEraser") {
      const allEraseStroke = {
        id: `${socket.id}-all-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        paintId: `${socket.id}-all-paint-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        size: currentStroke.size,
        points: currentStroke.points
      };
      socket.emit("redoAction", {
        type: "allErase",
        item: allEraseStroke
      });
    } else {
      socket.emit("paintStroke", currentStroke);
    }
  }
  currentStroke = null;
});

// Update other cursors
socket.on("cursorMove", ({ id, x, y, username, color, skin }) => {
  if (!cursors[id]) createCursor(id, username, color, skin);

  if (cursors[id]) {
    cursors[id].style.left = `${x}px`;
    cursors[id].style.top = `${y}px`;
    if (skin) cursors[id].style.backgroundImage = `url(${skin})`;
  }

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

socket.on("players", (activePlayers) => {
  const activeIds = new Set(Object.keys(activePlayers || {}));

  Object.keys(cursors).forEach((id) => {
    if (!activeIds.has(id)) removeCursor(id);
  });

  Object.entries(activePlayers || {}).forEach(([id, player]) => {
    if (!cursors[id]) createCursor(id, player.username, player.color, player.skin);
    if (labels[id]) {
      labels[id].innerText = player.username;
      labels[id].style.color = player.color;
    }
    if (cursors[id] && player.skin) {
      cursors[id].style.backgroundImage = `url(${player.skin})`;
    }
  });
});

// Chat messages
socket.on("chatMessage", ({ username, message, color }) => {
  const msg = document.createElement("div");
  const name = document.createElement("span");
  name.innerText = `${username}:`;
  name.style.color = color;
  name.style.fontWeight = "600";
  msg.appendChild(name);
  msg.append(` ${message}`);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on("paintHistory", (strokes) => {
  paintHistory = Array.isArray(strokes) ? strokes : [];
  clearPaintCanvas();
  paintHistory.forEach(drawStroke);
});

socket.on("paintStroke", (stroke) => {
  paintHistory.push(stroke);
  if (stroke.userId === socket.id) {
    if (stroke.tool !== "eraser" || !stroke.id.includes("-all-paint-")) {
      rememberAction("paint", stroke);
    }
    return;
  }
  drawStroke(stroke);
});

socket.on("clearPaint", () => {
  paintHistory = [];
  stampHistory = [];
  clearPaintCanvas();
  renderStamps();
});

socket.on("backgroundState", async (state) => {
  backgroundImageSource = state?.image || null;
  backgroundEraseHistory = Array.isArray(state?.eraseStrokes) ? state.eraseStrokes : [];
  backgroundFit = state?.fit || "cover";
  backgroundGallery = Array.isArray(state?.gallery) ? state.gallery : backgroundGallery;
  stampHistory = Array.isArray(state?.stamps) ? state.stamps : stampHistory;
  backgroundFitSelect.value = backgroundFit;
  renderBackgroundGallery();
  renderStamps();

  if (!backgroundImageSource) {
    backgroundImageElement = null;
    clearBackgroundCanvas();
    return;
  }

  try {
    backgroundImageElement = await loadImage(backgroundImageSource);
    redrawBackgroundCanvas();
  } catch {
    backgroundImageElement = null;
    clearBackgroundCanvas();
  }
});

socket.on("backgroundEraseStroke", (stroke) => {
  backgroundEraseHistory.push(stroke);
  if (stroke.userId === socket.id) {
    if (stroke.paintId) {
      rememberAction("allErase", stroke);
    } else {
      rememberAction("backgroundErase", stroke);
    }
    return;
  }
  drawBackgroundEraseStroke(stroke);
});

socket.on("removePaintStroke", (id) => {
  paintHistory = paintHistory.filter(stroke => stroke.id !== id);
  rerenderPaintCanvas();
});

socket.on("removeBackgroundEraseStroke", (id) => {
  backgroundEraseHistory = backgroundEraseHistory.filter(stroke => stroke.id !== id);
  redrawBackgroundCanvas();
});

socket.on("backgroundFit", (fit) => {
  backgroundFit = fit;
  backgroundFitSelect.value = fit;
  redrawBackgroundCanvas();
});

socket.on("stampPlaced", (stamp) => {
  stampHistory.push(stamp);
  renderStamp(stamp);
  if (stamp.userId === socket.id) {
    rememberAction("stamp", stamp);
  }
});

socket.on("removeStamp", (id) => {
  stampHistory = stampHistory.filter(stamp => stamp.id !== id);
  renderStamps();
});

socket.on("reaction", (reaction) => showReaction(reaction));
socket.on("laserPoint", (point) => showLaserPoint(point));

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
    cursorSkin = `cursors/${skin.file}`; // full path for your cursor
    socket.emit("setSkin", cursorSkin);

    // Update your cursor immediately
    if (cursors[socket.id]) cursors[socket.id].style.backgroundImage = `url(${cursorSkin})`;

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
