const socket = io();
const cursors = {};
const labels = {};
const cloneGroups = {};
const chatMessages = document.getElementById("chatMessages");
const backgroundCanvas = document.getElementById("backgroundCanvas");
const backgroundContext = backgroundCanvas.getContext("2d");
const paintCanvas = document.getElementById("paintCanvas");
const paintContext = paintCanvas.getContext("2d");
const paintToggle = document.getElementById("paintToggle");
const eraserToggle = document.getElementById("eraserToggle");
const imageEraserToggle = document.getElementById("imageEraserToggle");
const laserToggle = document.getElementById("laserToggle");
const textToggle = document.getElementById("textToggle");
const textInput = document.getElementById("textInput");
const brushColorInput = document.getElementById("brushColor");
const brushSizeInput = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const undoActionButton = document.getElementById("undoAction");
const redoActionButton = document.getElementById("redoAction");
const backgroundFitSelect = document.getElementById("backgroundFit");
const galleryTab = document.getElementById("galleryTab");
const galleryToggle = document.getElementById("galleryToggle");
const backgroundGalleryPanel = document.getElementById("backgroundGalleryPanel");
const stampSelect = document.getElementById("stampSelect");
const reactionSelect = document.getElementById("reactionSelect");
const chatRecipient = document.getElementById("chatRecipient");
const importBackgroundButton = document.getElementById("importBackground");
const backgroundFileInput = document.getElementById("backgroundFile");
const saveCanvasButton = document.getElementById("saveCanvas");
const clearBackgroundButton = document.getElementById("clearBackground");
const clearPaintButton = document.getElementById("clearPaint");
const importSkinButton = document.getElementById("importSkin");
const customSkinFileInput = document.getElementById("customSkinFile");
const cursorSizeInput = document.getElementById("cursorSize");
const cursorSizeValue = document.getElementById("cursorSizeValue");
const cloneToggle = document.getElementById("cloneToggle");
const makeSkinButton = document.getElementById("makeSkin");
const skinMaker = document.getElementById("skinMaker");
const pixelGrid = document.getElementById("pixelGrid");
const pixelColorInput = document.getElementById("pixelColor");
const pixelEraserButton = document.getElementById("pixelEraser");
const clearPixelsButton = document.getElementById("clearPixels");
const savePixelSkinButton = document.getElementById("savePixelSkin");

let username = "";
let usernameColor = "#ffeb3b"; // default yellow
let cursorSkin = "cursors/cursor.png"; // default skin
let cursorSize = 28;
let hasJoined = false;
let paintMode = false;
let paintTool = "brush";
let laserMode = false;
let textMode = false;
let isDrawing = false;
let currentStroke = null;
let paintHistory = [];
let backgroundImageSource = null;
let backgroundImageElement = null;
let backgroundEraseHistory = [];
let backgroundFit = "cover";
let backgroundGallery = [];
let stampHistory = [];
let textHistory = [];
let undoStack = [];
let redoStack = [];
let laserDots = {};
let pendingCursorPoint = null;
let cursorEmitTimeout = null;
let lastCursorEmit = 0;
let isPixelDrawing = false;
let pixelEraseMode = false;
let pixelSkinCount = 0;
let clonesEnabled = false;

const MAX_BACKGROUND_FILE_SIZE = 3000000;
const MAX_SKIN_FILE_SIZE = 1500000;
const CURSOR_SEND_INTERVAL = 33;
const PIXEL_GRID_SIZE = 16;

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
  backgroundGalleryPanel.innerHTML = "";
  if (!backgroundGallery.length) {
    const empty = document.createElement("div");
    empty.innerText = "No saved backgrounds";
    empty.style.gridColumn = "1 / -1";
    empty.style.color = "#bbb";
    empty.style.fontSize = "13px";
    backgroundGalleryPanel.appendChild(empty);
    return;
  }

  backgroundGallery.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("backgroundThumb");
    button.style.backgroundImage = `url(${item.image})`;
    button.title = `Background ${index + 1}`;
    button.addEventListener("click", () => {
      socket.emit("selectBackgroundFromGallery", item.id);
    });
    backgroundGalleryPanel.appendChild(button);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setBrushSize(size) {
  const nextSize = clamp(Math.round(size), Number(brushSizeInput.min), Number(brushSizeInput.max));
  brushSizeInput.value = nextSize;
  brushSizeValue.innerText = `${nextSize}px`;
}

function setCursorSize(size, shouldEmit = true) {
  cursorSize = clamp(Math.round(size), Number(cursorSizeInput.min), Number(cursorSizeInput.max));
  cursorSizeInput.value = cursorSize;
  cursorSizeValue.innerText = `${cursorSize}px`;
  if (cursors[socket.id]) applyCursorSize(cursors[socket.id], cursorSize);
  if (hasJoined && shouldEmit) socket.emit("setCursorSize", cursorSize);
}

function applyCursorSize(cursor, size) {
  cursor.style.width = `${size}px`;
  cursor.style.height = `${size}px`;
}

function setTextMode(enabled) {
  textMode = enabled;
  textToggle.classList.toggle("active", textMode);
  if (textMode) {
    setPaintMode(false);
    setLaserMode(false);
    stampSelect.value = "";
  }
}

function ensureCloneGroup(id) {
  if (!cloneGroups[id]) {
    cloneGroups[id] = [];
    for (let index = 0; index < 6; index++) {
      const clone = document.createElement("div");
      clone.classList.add("cursor", "cursorClone");
      document.body.appendChild(clone);
      cloneGroups[id].push(clone);
    }
  }
  return cloneGroups[id];
}

function updateCloneCursors(id, x, y, skin, size, enabled) {
  if (!enabled) {
    removeCloneCursors(id);
    return;
  }

  const clones = ensureCloneGroup(id);
  const radius = Math.max(34, size * 1.8);
  clones.forEach((clone, index) => {
    const angle = (Math.PI * 2 * index) / clones.length;
    clone.style.left = `${x + Math.cos(angle) * radius}px`;
    clone.style.top = `${y + Math.sin(angle) * radius}px`;
    clone.style.backgroundImage = `url(${skin})`;
    applyCursorSize(clone, size);
  });
}

function removeCloneCursors(id) {
  if (!cloneGroups[id]) return;
  cloneGroups[id].forEach(clone => clone.remove());
  delete cloneGroups[id];
}

function addSkinOption(imageSource, name = "Custom") {
  const div = document.createElement("div");
  div.classList.add("skinOption");

  const image = document.createElement("img");
  image.src = imageSource;
  image.alt = name;

  const label = document.createElement("div");
  label.innerText = name;

  div.appendChild(image);
  div.appendChild(label);
  skinsGrid.prepend(div);
  div.addEventListener("click", () => selectSkin(imageSource, div));
  selectSkin(imageSource, div);
}

function paintPixel(cell) {
  cell.style.background = pixelEraseMode ? "transparent" : pixelColorInput.value;
}

function makePixelSkinDataUrl() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const pixelSize = 8;
  canvas.width = PIXEL_GRID_SIZE * pixelSize;
  canvas.height = PIXEL_GRID_SIZE * pixelSize;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);

  Array.from(pixelGrid.children).forEach((cell, index) => {
    const color = cell.style.backgroundColor;
    if (!color || color === "transparent") return;
    const x = (index % PIXEL_GRID_SIZE) * pixelSize;
    const y = Math.floor(index / PIXEL_GRID_SIZE) * pixelSize;
    context.fillStyle = color;
    context.fillRect(x, y, pixelSize, pixelSize);
  });

  return canvas.toDataURL("image/png");
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
  socket.emit("setCursorSize", cursorSize);
  socket.emit("setClones", clonesEnabled);
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
for (let index = 0; index < PIXEL_GRID_SIZE * PIXEL_GRID_SIZE; index++) {
  const cell = document.createElement("div");
  cell.classList.add("pixelCell");
  cell.addEventListener("mousedown", (event) => {
    event.preventDefault();
    isPixelDrawing = true;
    paintPixel(cell);
  });
  cell.addEventListener("mouseenter", () => {
    if (isPixelDrawing) paintPixel(cell);
  });
  pixelGrid.appendChild(cell);
}

window.addEventListener("resize", () => {
  resizeBackgroundCanvas();
  resizePaintCanvas();
});

document.addEventListener("mouseup", () => {
  isPixelDrawing = false;
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
textToggle.addEventListener("click", () => setTextMode(!textMode));

textInput.addEventListener("focus", () => setTextMode(true));

cloneToggle.addEventListener("change", () => {
  clonesEnabled = cloneToggle.checked;
  if (hasJoined) socket.emit("setClones", clonesEnabled);
  if (!clonesEnabled) removeCloneCursors(socket.id);
});

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

galleryToggle.addEventListener("click", () => {
  galleryTab.classList.toggle("open");
});

stampSelect.addEventListener("change", () => {
  if (stampSelect.value) {
    setTextMode(false);
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
  setBrushSize(Number(brushSizeInput.value));
});

cursorSizeInput.addEventListener("input", () => {
  setCursorSize(Number(cursorSizeInput.value));
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

  textHistory.forEach(item => {
    snapshotContext.save();
    snapshotContext.font = `600 ${item.size}px Poppins, sans-serif`;
    snapshotContext.textAlign = "center";
    snapshotContext.textBaseline = "middle";
    snapshotContext.shadowColor = "rgba(0, 0, 0, 0.9)";
    snapshotContext.shadowBlur = 2;
    snapshotContext.shadowOffsetX = 1;
    snapshotContext.shadowOffsetY = 1;
    snapshotContext.fillStyle = item.color || "#ffffff";
    snapshotContext.fillText(item.text, item.x, item.y);
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

document.addEventListener("wheel", (e) => {
  if (e.target.closest("#chatBox, #backgroundGalleryPanel")) return;
  if (e.target.closest("#skinsOverlay")) {
    e.preventDefault();
    setCursorSize(cursorSize + (e.deltaY < 0 ? 4 : -4));
    return;
  }
  if (paintMode || stampSelect.value) {
    e.preventDefault();
    setBrushSize(Number(brushSizeInput.value) + (e.deltaY < 0 ? 4 : -4));
  }
}, { passive: false });

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
    socket.emit("setCursorSize", cursorSize);
    socket.emit("setClones", clonesEnabled);
  }
});

// --- Chat input ---
const chatInput = document.getElementById("chatInput");
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (chatInput.value.trim() !== "") {
      socket.emit("chatMessage", {
        message: chatInput.value.trim(),
        to: chatRecipient.value
      });
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
  applyCursorSize(cursor, id === socket.id ? cursorSize : 28);
  document.body.appendChild(cursor);
  cursors[id] = cursor;

  const label = document.createElement("div");
  label.classList.add("usernameLabel");
  label.innerText = name;
  label.style.color = color;
  document.body.appendChild(label);
  labels[id] = label;
}

function renderTextItems() {
  document.querySelectorAll(".canvasText").forEach(item => item.remove());
  textHistory.forEach(renderTextItem);
}

function renderTextItem(item) {
  const div = document.createElement("div");
  div.classList.add("canvasText");
  div.dataset.textId = item.id;
  div.innerText = item.text;
  div.style.left = `${item.x}px`;
  div.style.top = `${item.y}px`;
  div.style.fontSize = `${item.size}px`;
  div.style.color = item.color || "#ffffff";
  document.body.appendChild(div);
}

function removeCursor(id) {
  if (cursors[id]) { document.body.removeChild(cursors[id]); delete cursors[id]; }
  if (labels[id]) { document.body.removeChild(labels[id]); delete labels[id]; }
  removeCloneCursors(id);
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
    updateCloneCursors(socket.id, e.clientX, e.clientY, cursorSkin, cursorSize, clonesEnabled);
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
      size: Number(brushSizeInput.value)
    });
    return;
  }

  if (textMode && textInput.value.trim()) {
    socket.emit("placeText", {
      text: textInput.value.trim(),
      color: brushColorInput.value,
      x: e.clientX,
      y: e.clientY,
      size: Number(brushSizeInput.value)
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
socket.on("cursorMove", ({ id, x, y, username, color, skin, cursorSize, clones }) => {
  if (!cursors[id]) createCursor(id, username, color, skin);

  if (cursors[id]) {
    cursors[id].style.left = `${x}px`;
    cursors[id].style.top = `${y}px`;
    if (skin) cursors[id].style.backgroundImage = `url(${skin})`;
    if (cursorSize) applyCursorSize(cursors[id], cursorSize);
    updateCloneCursors(id, x, y, skin || "cursors/cursor.png", cursorSize || 28, clones);
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
    if (cursors[id] && player.cursorSize) {
      applyCursorSize(cursors[id], player.cursorSize);
    }
    if (!player.clones) removeCloneCursors(id);
  });

  chatRecipient.innerHTML = '<option value="">Public</option>';
  Object.entries(activePlayers || {}).forEach(([id, player]) => {
    if (id === socket.id) return;
    const option = document.createElement("option");
    option.value = id;
    option.innerText = `Send to ${player.username}`;
    chatRecipient.appendChild(option);
  });
});

// Chat messages
socket.on("chatMessage", ({ username, message, color, private: isPrivate, fromId }) => {
  const msg = document.createElement("div");
  const name = document.createElement("span");
  name.innerText = `${isPrivate ? "Private " : ""}${username}:`;
  name.style.color = color;
  name.style.fontWeight = "600";
  msg.appendChild(name);
  msg.append(` ${message}`);
  if (isPrivate) {
    msg.style.background = "rgba(255, 255, 255, 0.08)";
    msg.style.borderRadius = "6px";
    msg.style.padding = "3px 5px";
    msg.title = fromId === socket.id ? "Private message sent" : "Private message received";
  }
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
  textHistory = [];
  clearPaintCanvas();
  renderStamps();
  renderTextItems();
});

socket.on("backgroundState", async (state) => {
  backgroundImageSource = state?.image || null;
  backgroundEraseHistory = Array.isArray(state?.eraseStrokes) ? state.eraseStrokes : [];
  backgroundFit = state?.fit || "cover";
  backgroundGallery = Array.isArray(state?.gallery) ? state.gallery : backgroundGallery;
  stampHistory = Array.isArray(state?.stamps) ? state.stamps : stampHistory;
  textHistory = Array.isArray(state?.textItems) ? state.textItems : textHistory;
  backgroundFitSelect.value = backgroundFit;
  renderBackgroundGallery();
  renderStamps();
  renderTextItems();

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

socket.on("textPlaced", (item) => {
  textHistory.push(item);
  renderTextItem(item);
  if (item.userId === socket.id) {
    rememberAction("text", item);
  }
});

socket.on("removeTextItem", (id) => {
  textHistory = textHistory.filter(item => item.id !== id);
  renderTextItems();
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

function selectSkin(skin, selectedElement) {
  cursorSkin = skin;
  socket.emit("setSkin", cursorSkin);

  if (cursors[socket.id]) cursors[socket.id].style.backgroundImage = `url(${cursorSkin})`;

  document.querySelectorAll(".skinOption").forEach(opt => opt.classList.remove("selected"));
  if (selectedElement) selectedElement.classList.add("selected");
}

// Populate skins grid
skinFiles.forEach((skin, index) => {
  const div = document.createElement("div");
  div.classList.add("skinOption");
  div.innerHTML = `<img src="cursors/${skin.file}" alt="${skin.name}"><div>${skin.name}</div>`;
  skinsGrid.appendChild(div);

  if(index === 0) div.classList.add("selected"); // default selected

  div.addEventListener("click", () => {
    selectSkin(`cursors/${skin.file}`, div);
  });
});

importSkinButton.addEventListener("click", () => {
  customSkinFileInput.click();
});

makeSkinButton.addEventListener("click", () => {
  skinMaker.classList.toggle("open");
});

pixelEraserButton.addEventListener("click", () => {
  pixelEraseMode = !pixelEraseMode;
  pixelEraserButton.classList.toggle("active", pixelEraseMode);
});

clearPixelsButton.addEventListener("click", () => {
  Array.from(pixelGrid.children).forEach((cell) => {
    cell.style.background = "transparent";
  });
});

savePixelSkinButton.addEventListener("click", () => {
  pixelSkinCount += 1;
  addSkinOption(makePixelSkinDataUrl(), `Pixel ${pixelSkinCount}`);
});

customSkinFileInput.addEventListener("change", () => {
  const file = customSkinFileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Please choose a PNG, JPG, or WebP image.");
    customSkinFileInput.value = "";
    return;
  }
  if (file.size > MAX_SKIN_FILE_SIZE) {
    alert("Please choose a cursor image under 1.5 MB.");
    customSkinFileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    addSkinOption(reader.result, "Custom");
    customSkinFileInput.value = "";
  };
  reader.readAsDataURL(file);
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
