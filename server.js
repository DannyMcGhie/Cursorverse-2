const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  maxHttpBufferSize: 5e6
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
const MAX_PAINT_STROKES = 1000;
const MAX_BACKGROUND_ERASE_STROKES = 1000;
const MAX_STAMPS = 500;
const MAX_BACKGROUND_IMAGE_LENGTH = 4500000;

io.on("connection", (socket) => {
  console.log("New client connected");

  // Default username, color, skin
  players[socket.id] = { 
    username: "Anonymous", 
    color: "#ffeb3b", 
    skin: "cursors/cursor.png" // ✅ fixed path
  };

  // Username set by client
  socket.on("setUsername", (data) => {
    players[socket.id].username = data.name;
    players[socket.id].color = data.color || "#ffeb3b";
    io.emit("playerCount", Object.keys(players).length);
  });

  // Skin set by client
  socket.on("setSkin", (skin) => {
    if (players[socket.id]) players[socket.id].skin = skin;
  });

  // Send existing painting to new clients
  socket.emit("paintHistory", paintStrokes);
  socket.emit("backgroundState", {
    image: backgroundImage,
    eraseStrokes: backgroundEraseStrokes,
    fit: backgroundFit,
    stamps
  });

  // Cursor movement
  socket.on("cursorMove", (data) => {
    if (players[socket.id]) {
      io.emit("cursorMove", {
        id: socket.id,
        x: data.x,
        y: data.y,
        username: players[socket.id].username,
        color: players[socket.id].color,
        skin: players[socket.id].skin || "cursors/cursor.png" // ✅ fixed fallback path
      });
    }
  });

  // Chat messages
  socket.on("chatMessage", (message) => {
    if (!players[socket.id]) return;
    io.emit("chatMessage", {
      username: players[socket.id].username,
      message: message,
      color: players[socket.id].color
    });
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

    if (action.type === "stamp" && isValidStamp(action.item)) {
      const stamp = {
        ...action.item,
        userId: socket.id
      };
      stamps.push(stamp);
      io.emit("stampPlaced", stamp);
    }
  });

  socket.on("setBackground", (image) => {
    if (!players[socket.id] || !isValidBackgroundImage(image)) return;
    backgroundImage = image;
    backgroundEraseStrokes = [];
    io.emit("backgroundState", {
      image: backgroundImage,
      eraseStrokes: backgroundEraseStrokes,
      fit: backgroundFit,
      stamps
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
      stamps
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
    socket.broadcast.emit("laserPoint", {
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
    io.emit("playerCount", Object.keys(players).length);
  });

  // Send initial player count
  io.emit("playerCount", Object.keys(players).length);
});

function isValidStroke(stroke) {
  if (!stroke || !Array.isArray(stroke.points)) return false;
  if (stroke.points.length < 2 || stroke.points.length > 500) return false;
  if (typeof stroke.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(stroke.color)) return false;
  if (typeof stroke.size !== "number" || stroke.size < 1 || stroke.size > 80) return false;
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
  if (typeof stroke.size !== "number" || stroke.size < 1 || stroke.size > 120) return false;

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
    stamp.size <= 120 &&
    Number.isFinite(stamp.x) &&
    Number.isFinite(stamp.y)
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
