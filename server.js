const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = 3000;

// Serve static files
app.use(express.static(__dirname + '/public'));

// Track connected players
let players = {};

io.on("connection", (socket) => {
  console.log("New client connected");

  // Default username, color, skin
  players[socket.id] = { username: "Anonymous", color: "#ffeb3b", skin: "cursor.png" };

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

  // Cursor movement
  socket.on("cursorMove", (data) => {
    if (players[socket.id]) {
      io.emit("cursorMove", {
        id: socket.id,
        x: data.x,
        y: data.y,
        username: players[socket.id].username,
        color: players[socket.id].color,
        skin: players[socket.id].skin || "cursor.png"
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

server.listen(PORT, () => {
  console.log(`Cursorverse running on http://localhost:${PORT}`);
  console.log(`Accessible on your network at http://${getLocalIP()}:${PORT}`);
});
