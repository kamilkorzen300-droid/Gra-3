
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, "users.json");

app.use(express.json());

let users = {};
let sessions = new Map();
let players = new Map();

if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    users = {};
  }
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/client.js", (req, res) => {
  res.sendFile(path.join(__dirname, "client.js"));
});

app.post("/api/register", (req, res) => {
  const nick = String(req.body.nick || "").trim();
  const password = String(req.body.password || "");

  if (!/^[a-zA-Z0-9_]{3,16}$/.test(nick)) {
    return res.status(400).json({
      error: "Nick musi mieć 3–16 znaków."
    });
  }

  if (password.length < 6 || password.length > 100) {
    return res.status(400).json({
      error: "Hasło musi mieć od 6 do 100 znaków."
    });
  }

  const key = nick.toLowerCase();

  if (users[key]) {
    return res.status(409).json({
      error: "Ten nick jest już zajęty."
    });
  }

  const salt = crypto.randomBytes(16).toString("hex");

  users[key] = {
    nick,
    salt,
    passwordHash: hashPassword(password, salt)
  };

  saveUsers();

  const token = makeToken();
  sessions.set(token, nick);

  res.json({ token, nick });
});

app.post("/api/login", (req, res) => {
  const nick = String(req.body.nick || "").trim();
  const password = String(req.body.password || "");
  const key = nick.toLowerCase();
  const user = users[key];

  if (!user || password.length > 100) {
    return res.status(401).json({
      error: "Nieprawidłowy nick lub hasło."
    });
  }

  const attempted = Buffer.from(
    hashPassword(password, user.salt),
    "hex"
  );

  const saved = Buffer.from(user.passwordHash, "hex");

  if (
    attempted.length !== saved.length ||
    !crypto.timingSafeEqual(attempted, saved)
  ) {
    return res.status(401).json({
      error: "Nieprawidłowy nick lub hasło."
    });
  }

  const token = makeToken();
  sessions.set(token, user.nick);

  res.json({ token, nick: user.nick });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const nick = sessions.get(token);

  if (!nick) {
    return next(new Error("Musisz się zalogować."));
  }

  socket.nick = nick;
  next();
});

io.on("connection", socket => {
  const player = {
    id: socket.id,
    nick: socket.nick,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0
  };

  players.set(socket.id, player);

  socket.emit("world:players", [...players.values()]);

  socket.broadcast.emit("player:joined", player);

  socket.on("player:move", data => {
    if (!data || typeof data !== "object") return;

    const p = players.get(socket.id);
    if (!p) return;

    const x = Number(data.x);
    const y = Number(data.y);
    const z = Number(data.z);
    const rotation = Number(data.rotation);

    if (![x, y, z, rotation].every(Number.isFinite)) return;

    p.x = Math.max(-1000, Math.min(1000, x));
    p.y = Math.max(-10, Math.min(100, y));
    p.z = Math.max(-1000, Math.min(1000, z));
    p.rotation = rotation;

    socket.broadcast.emit("player:moved", p);
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("player:left", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Serwer działa na porcie " + PORT);
});
