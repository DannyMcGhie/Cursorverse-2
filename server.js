const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  maxHttpBufferSize: 15e6
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname + '/public'));

// Track connected players
let players = {};
let paintStrokes = [];
let backgroundImage = null;
let backgroundEraseStrokes = [];
let backgroundFit = "cover";
let stamps = [];
let textItems = [];
let backgroundGallery = [];
const MAX_PAINT_STROKES = 1000;
const MAX_BACKGROUND_ERASE_STROKES = 1000;
const MAX_BACKGROUND_GALLERY_ITEMS = 12;
const MAX_STAMPS = 500;
const MAX_TEXT_ITEMS = 500;
const MAX_BACKGROUND_IMAGE_LENGTH = 12000000;
const MAX_SKIN_IMAGE_LENGTH = 6000000;

io.on("connection", (socket) => {
  console.log("New client connected");

  // Default username, color, skin
  players[socket.id] = { 
    username: "Anonymous", 
    color: "#ffeb3b", 
    skin: "cursors/cursor.png" // ✅ fixed path
  };
  delete players[socket.id];
  emitPlayers();

  // Username set by client
  socket.on("setUsername", (data) => {
    const existingPlayer = players[socket.id];
    players[socket.id] = {
      username: sanitizeName(data.name),
      color: isValidColor(data.color) ? data.color : "#ffeb3b",
      skin: existingPlayer?.skin || "cursors/cursor.png",
      cursorSize: existingPlayer?.cursorSize || 28,
      clones: existingPlayer?.clones || false
    };
    emitPlayers();
  });

  // Skin set by client
  socket.on("setSkin", (skin) => {
    if (players[socket.id] && isValidSkin(skin)) players[socket.id].skin = skin;
    emitPlayers();
  });

  socket.on("setCursorSize", (size) => {
    if (players[socket.id] && isValidCursorSize(size)) {
      players[socket.id].cursorSize = size;
    }
    emitPlayers();
  });

  socket.on("setClones", (enabled) => {
    if (players[socket.id]) {
      players[socket.id].clones = Boolean(enabled);
    }
    emitPlayers();
  });

  // Send existing painting to new clients
  socket.emit("paintHistory", paintStrokes);
  socket.emit("backgroundState", {
    image: backgroundImage,
    eraseStrokes: backgroundEraseStrokes,
    fit: backgroundFit,
    stamps,
    textItems,
    gallery: backgroundGallery
  });

  // Cursor movement
  socket.on("cursorMove", (data) => {
    if (players[socket.id]) {
      socket.broadcast.volatile.emit("cursorMove", {
        id: socket.id,
        x: data.x,
        y: data.y,
        username: players[socket.id].username,
        color: players[socket.id].color,
        cursorSize: players[socket.id].cursorSize || 28,
        clones: Boolean(players[socket.id].clones),
        skin: players[socket.id].skin || "cursors/cursor.png" // ✅ fixed fallback path
      });
    }
  });

  // Chat messages
  socket.on("chatMessage", (payload) => {
    if (!players[socket.id]) return;
    const message = typeof payload === "string" ? payload : payload?.message;
    const to = typeof payload === "object" ? payload.to : "";
    if (typeof message !== "string" || !message.trim()) return;

    const chatPayload = {
      username: players[socket.id].username,
      message: message.trim().slice(0, 200),
      color: players[socket.id].color,
      fromId: socket.id,
      toId: to || "",
      private: Boolean(to && players[to])
    };

    if (chatPayload.private) {
      socket.emit("chatMessage", chatPayload);
      socket.to(to).emit("chatMessage", chatPayload);
      return;
    }

    io.emit("chatMessage", chatPayload);
  });

  // Collaborative paint strokes
  socket.on("paintStroke", (stroke) => {
    if (!players[socket.id] || !isValidStroke(stroke)) return;

    const savedStroke = {
      id: `${socket.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: socket.id,
      color: stroke.color,
      size: stroke.size,
      tool: stroke.tool === "eraser" ? "eraser" : "brush",
      points: stroke.points
    };

    paintStrokes.push(savedStroke);
    if (paintStrokes.length > MAX_PAINT_STROKES) {
      paintStrokes = paintStrokes.slice(-MAX_PAINT_STROKES);
    }

    io.emit("paintStroke", savedStroke);
  });

  socket.on("clearPaint", () => {
    if (!players[socket.id]) return;
    paintStrokes = [];
    stamps = [];
    textItems = [];
    io.emit("clearPaint");
  });

  socket.on("undoAction", (action) => {
    if (!players[socket.id] || !action || typeof action.id !== "string") return;

    if (action.type === "paint") {
      paintStrokes = paintStrokes.filter(stroke => !(stroke.id === action.id && stroke.userId === socket.id));
      io.emit("removePaintStroke", action.id);
    }

    if (action.type === "backgroundErase") {
      backgroundEraseStrokes = backgroundEraseStrokes.filter(stroke => !(stroke.id === action.id && stroke.userId === socket.id));
      io.emit("removeBackgroundEraseStroke", action.id);
    }

    if (action.type === "text") {
      textItems = textItems.filter(item => !(item.id === action.id && item.userId === socket.id));
      io.emit("removeTextItem", action.id);
    }

    if (action.type === "allErase") {
      paintStrokes = paintStrokes.filter(stroke => !(stroke.id === action.paintId && stroke.userId === socket.id));
      io.emit("removePaintStroke", action.paintId);
    }

    if (action.type === "stamp") {
      stamps = stamps.filter(stamp => !(stamp.id === action.id && stamp.userId === socket.id));
      io.emit("removeStamp", action.id);
    }
  });

  socket.on("redoAction", (action) => {
    if (!players[socket.id] || !action || !action.item) return;

    if (action.type === "paint" && isValidStroke(action.item)) {
      const stroke = {
        ...action.item,
        userId: socket.id
      };
      paintStrokes.push(stroke);
      io.emit("paintStroke", stroke);
    }

    if (action.type === "backgroundErase" && isValidBackgroundEraseStroke(action.item)) {
      const stroke = {
        ...action.item,
        userId: socket.id
      };
      backgroundEraseStrokes.push(stroke);
      io.emit("backgroundEraseStroke", stroke);
    }

    if (action.type === "allErase" && isValidBackgroundEraseStroke(action.item)) {
      const paintStroke = {
        ...action.item,
        id: action.item.paintId || `${action.item.id}-paint`,
        paintId: undefined,
        userId: socket.id,
        color: "#000000",
        tool: "eraser"
      };
      paintStrokes.push(paintStroke);
      io.emit("paintStroke", paintStroke);
      removeItemsInEraseZone(action.item);
    }

    if (action.type === "stamp" && isValidStamp(action.item)) {
      const stamp = {
        ...action.item,
        userId: socket.id
      };
      stamps.push(stamp);
      io.emit("stampPlaced", stamp);
    }

    if (action.type === "text" && isValidTextItem(action.item)) {
      const textItem = {
        ...action.item,
        userId: socket.id
      };
      textItems.push(textItem);
      io.emit("textPlaced", textItem);
    }
  });

  socket.on("setBackground", (image) => {
    if (!players[socket.id] || !isValidBackgroundImage(image)) return;
    backgroundImage = image;
    backgroundEraseStrokes = [];
    addBackgroundToGallery(image);
    io.emit("backgroundState", {
      image: backgroundImage,
      eraseStrokes: backgroundEraseStrokes,
      fit: backgroundFit,
      stamps,
      textItems,
      gallery: backgroundGallery
    });
  });

  socket.on("cameraFrame", (image) => {
    if (!players[socket.id] || !isValidBackgroundImage(image)) return;
    backgroundImage = image;
    io.emit("backgroundState", {
      image: backgroundImage,
      eraseStrokes: backgroundEraseStrokes,
      fit: backgroundFit,
      stamps,
      textItems,
      gallery: backgroundGallery
    });
  });

  socket.on("selectBackgroundFromGallery", (id) => {
    if (!players[socket.id] || typeof id !== "string") return;
    const galleryItem = backgroundGallery.find(item => item.id === id);
    if (!galleryItem) return;

    backgroundImage = galleryItem.image;
    backgroundEraseStrokes = [];
    io.emit("backgroundState", {
      image: backgroundImage,
      eraseStrokes: backgroundEraseStrokes,
      fit: backgroundFit,
      stamps,
      textItems,
      gallery: backgroundGallery
    });
  });

  socket.on("clearBackground", () => {
    if (!players[socket.id]) return;
    backgroundImage = null;
    backgroundEraseStrokes = [];
    io.emit("backgroundState", {
      image: backgroundImage,
      eraseStrokes: backgroundEraseStrokes,
      fit: backgroundFit,
      stamps,
      textItems,
      gallery: backgroundGallery
    });
  });

  socket.on("setBackgroundFit", (fit) => {
    if (!players[socket.id] || !isValidBackgroundFit(fit)) return;
    backgroundFit = fit;
    io.emit("backgroundFit", backgroundFit);
  });

  socket.on("backgroundEraseStroke", (stroke) => {
    if (!players[socket.id] || !backgroundImage || !isValidBackgroundEraseStroke(stroke)) return;

    const savedStroke = {
      id: `${socket.id}-bg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: socket.id,
      size: stroke.size,
      points: stroke.points
    };

    backgroundEraseStrokes.push(savedStroke);
    if (backgroundEraseStrokes.length > MAX_BACKGROUND_ERASE_STROKES) {
      backgroundEraseStrokes = backgroundEraseStrokes.slice(-MAX_BACKGROUND_ERASE_STROKES);
    }

    io.emit("backgroundEraseStroke", savedStroke);
  });

  socket.on("placeStamp", (stamp) => {
    if (!players[socket.id] || !isValidStamp(stamp)) return;

    const savedStamp = {
      id: `${socket.id}-stamp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: socket.id,
      emoji: stamp.emoji,
      x: stamp.x,
      y: stamp.y,
      size: stamp.size
    };

    stamps.push(savedStamp);
    if (stamps.length > MAX_STAMPS) {
      stamps = stamps.slice(-MAX_STAMPS);
    }

    io.emit("stampPlaced", savedStamp);
  });

  socket.on("placeText", (textItem) => {
    if (!players[socket.id] || !isValidTextItem(textItem)) return;

    const savedText = {
      id: `${socket.id}-text-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      userId: socket.id,
      text: textItem.text.trim().slice(0, 80),
      color: isValidColor(textItem.color) ? textItem.color : players[socket.id].color,
      x: textItem.x,
      y: textItem.y,
      size: textItem.size
    };

    textItems.push(savedText);
    if (textItems.length > MAX_TEXT_ITEMS) {
      textItems = textItems.slice(-MAX_TEXT_ITEMS);
    }

    io.emit("textPlaced", savedText);
  });

  socket.on("reaction", (reaction) => {
    if (!players[socket.id] || !isValidReaction(reaction)) return;
    io.emit("reaction", {
      id: socket.id,
      reaction: reaction.reaction,
      x: reaction.x,
      y: reaction.y,
      color: players[socket.id].color
    });
  });

  socket.on("laserPoint", (point) => {
    if (!players[socket.id] || !isValidPoint(point)) return;
    socket.broadcast.volatile.emit("laserPoint", {
      id: socket.id,
      x: point.x,
      y: point.y,
      color: players[socket.id].color
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    delete players[socket.id];
    io.emit("removeCursor", socket.id);
    emitPlayers();
  });

  // Send initial player count
  emitPlayers();
});

function emitPlayers() {
  io.emit("players", players);
  io.emit("playerCount", Object.keys(players).length);
}

function sanitizeName(name) {
  if (typeof name !== "string") return "Anonymous";
  const trimmed = name.trim().slice(0, 15);
  return trimmed || "Anonymous";
}

function isValidColor(color) {
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color);
}

function isValidCursorSize(size) {
  return typeof size === "number" && Number.isFinite(size) && size >= 12 && size <= 160;
}

function isValidSkin(skin) {
  return (
    typeof skin === "string" &&
    (
      /^cursors\/[a-z0-9_-]+\.png$/i.test(skin) ||
      (skin.length <= MAX_SKIN_IMAGE_LENGTH && /^data:image\/(png|jpeg|jpg|webp);base64,/.test(skin))
    )
  );
}

function addBackgroundToGallery(image) {
  backgroundGallery = backgroundGallery.filter(item => item.image !== image);
  backgroundGallery.unshift({
    id: `bg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    image,
    addedAt: Date.now()
  });
  backgroundGallery = backgroundGallery.slice(0, MAX_BACKGROUND_GALLERY_ITEMS);
}

function removeItemsInEraseZone(stroke) {
  const removedStampIds = [];
  const removedTextIds = [];
  const radius = stroke.size / 2;

  stamps = stamps.filter(stamp => {
    const hit = stroke.points.some(point => distance(point, stamp) <= radius + stamp.size / 2);
    if (hit) removedStampIds.push(stamp.id);
    return !hit;
  });

  textItems = textItems.filter(item => {
    const approximateWidth = item.text.length * item.size * 0.6;
    const hit = stroke.points.some(point => (
      Math.abs(point.x - item.x) <= approximateWidth / 2 + radius &&
      Math.abs(point.y - item.y) <= item.size / 2 + radius
    ));
    if (hit) removedTextIds.push(item.id);
    return !hit;
  });

  removedStampIds.forEach(id => io.emit("removeStamp", id));
  removedTextIds.forEach(id => io.emit("removeTextItem", id));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isValidStroke(stroke) {
  if (!stroke || !Array.isArray(stroke.points)) return false;
  if (stroke.points.length < 2 || stroke.points.length > 500) return false;
  if (typeof stroke.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(stroke.color)) return false;
  if (typeof stroke.size !== "number" || stroke.size < 1 || stroke.size > 160) return false;
  if (stroke.tool !== "brush" && stroke.tool !== "eraser") return false;

  return stroke.points.every(point => (
    point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  ));
}

function isValidBackgroundEraseStroke(stroke) {
  if (!stroke || !Array.isArray(stroke.points)) return false;
  if (stroke.points.length < 2 || stroke.points.length > 500) return false;
  if (typeof stroke.size !== "number" || stroke.size < 1 || stroke.size > 160) return false;

  return stroke.points.every(point => (
    point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  ));
}

function isValidBackgroundImage(image) {
  return (
    typeof image === "string" &&
    image.length <= MAX_BACKGROUND_IMAGE_LENGTH &&
    /^data:image\/(png|jpeg|jpg|webp);base64,/.test(image)
  );
}

function isValidBackgroundFit(fit) {
  return ["cover", "contain", "stretch", "center"].includes(fit);
}

function isValidStamp(stamp) {
  return (
    stamp &&
    typeof stamp.emoji === "string" &&
    ["⭐", "❤️", "✅", "❌", "🔥", "💡"].includes(stamp.emoji) &&
    typeof stamp.x === "number" &&
    typeof stamp.y === "number" &&
    typeof stamp.size === "number" &&
    stamp.size >= 16 &&
    stamp.size <= 160 &&
    Number.isFinite(stamp.x) &&
    Number.isFinite(stamp.y)
  );
}

function isValidTextItem(textItem) {
  return (
    textItem &&
    typeof textItem.text === "string" &&
    textItem.text.trim().length > 0 &&
    textItem.text.trim().length <= 80 &&
    typeof textItem.x === "number" &&
    typeof textItem.y === "number" &&
    typeof textItem.size === "number" &&
    textItem.size >= 16 &&
    textItem.size <= 160 &&
    Number.isFinite(textItem.x) &&
    Number.isFinite(textItem.y) &&
    (!textItem.color || isValidColor(textItem.color))
  );
}

function isValidReaction(reaction) {
  return (
    reaction &&
    typeof reaction.reaction === "string" &&
    ["👍", "❤️", "😂", "😮", "🎉", "👀"].includes(reaction.reaction) &&
    isValidPoint(reaction)
  );
}

function isValidPoint(point) {
  return (
    point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

// Cross-platform Wi-Fi IP detection
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const wifiKeywords = ["wi-fi", "wlan", "wifi", "wl"];

  for (const name in interfaces) {
    const lname = name.toLowerCase();
    if (wifiKeywords.some(k => lname.includes(k))) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) return iface.address;
      }
    }
  }

  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }

  return "127.0.0.1";
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Cursorverse running on http://localhost:${PORT}`);
  console.log(`Accessible on your network at http://${getLocalIP()}:${PORT}`);
});
