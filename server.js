const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "data.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function load() {
  if (!fs.existsSync(DB)) {
    fs.writeFileSync(DB, JSON.stringify({ players: {}, markers: [] }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB, "utf8"));
  } catch (e) {
    return { players: {}, markers: [] };
  }
}

function save(db) {
  try {
    fs.writeFileSync(DB, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Failed to save DB:", e);
  }
}

function findPlayer(db, id) {
  const q = id.toLowerCase();
  return db.players[id] ||
    Object.values(db.players).find(x =>
      (x.name && x.name.toLowerCase() === q) ||
      (x.uuid && x.uuid.toLowerCase() === q)
    );
}

// Get player info
app.get("/api/player/:id", (req, res) => {
  const db = load();
  const p = findPlayer(db, req.params.id) ||
    { uuid: req.params.id, name: "Unknown", cosmetics: [], friends: [] };
  res.json(p);
});

// Register player
app.post("/api/player", (req, res) => {
  const { uuid, name } = req.body || {};
  if (!uuid) return res.status(400).json({ error: "uuid is required" });
  const db = load();
  db.players[uuid] = db.players[uuid] || { uuid, name: name || "Player", cosmetics: [], friends: [] };
  if (name) db.players[uuid].name = name;
  save(db);
  res.json(db.players[uuid]);
});

// Get cosmetics - returns full objects with style/color/scale/speed
app.get("/api/cosmetics/:id", (req, res) => {
  const db = load();
  const p = findPlayer(db, req.params.id);
  res.json(p ? (p.cosmetics || []) : []);
});

// Save cosmetics - accepts full objects [{id, style, colorMode, customColor, scale, speed}]
app.post("/api/cosmetics", (req, res) => {
  const { uuid, cosmetics = [] } = req.body || {};
  if (!uuid) return res.status(400).json({ error: "uuid is required" });
  const db = load();
  db.players[uuid] = db.players[uuid] || { uuid, name: "Player", cosmetics: [], friends: [] };
  db.players[uuid].cosmetics = cosmetics;
  save(db);
  res.json({ ok: true, cosmetics });
});

// Get markers
app.get("/api/markers/:id", (req, res) => {
  const db = load();
  const q = req.params.id.toLowerCase();
  // Remove expired markers (>5 min)
  const now = Date.now();
  db.markers = db.markers.filter(m => (now - (m.createdAt || now)) < 300000);
  save(db);
  res.json(db.markers.filter(m =>
    (m.owner && m.owner.toLowerCase() === q) ||
    (m.name && m.name.toLowerCase() === q) ||
    (m.sharedWith || []).some(s => s && s.toLowerCase() === q)
  ));
});

// Create marker - replaces old ones from same player
app.post("/api/markers", (req, res) => {
  const { owner, name, world, x, y, z, sharedWith = [] } = req.body || {};
  if (!owner || !name || !world || [x, y, z].some(v => typeof v !== "number")) {
    return res.status(400).json({ error: "owner, name, world, x, y, z are required" });
  }
  const db = load();

  // Remove old markers from this player (owner OR name match)
  const qOwner = owner.toLowerCase();
  const qName = name.toLowerCase();
  db.markers = db.markers.filter(m =>
    !((m.owner && m.owner.toLowerCase() === qOwner) || (m.name && m.name.toLowerCase() === qName))
  );

  // Remove expired (>5 min)
  const now = Date.now();
  db.markers = db.markers.filter(m => (now - (m.createdAt || now)) < 300000);

  const marker = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    owner, name, world, x, y, z, sharedWith,
    createdAt: now
  };
  db.markers.push(marker);
  save(db);
  res.json(marker);
});

// Clear markers for a player
app.post("/api/markers/clear", (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: "id is required" });
  const db = load();
  const q = id.toLowerCase();
  const before = db.markers.length;
  db.markers = db.markers.filter(m =>
    !((m.owner && m.owner.toLowerCase() === q) || (m.name && m.name.toLowerCase() === q))
  );
  save(db);
  res.json({ cleared: before - db.markers.length });
});

// Delete marker by ID
app.delete("/api/markers/:id", (req, res) => {
  const db = load();
  const before = db.markers.length;
  db.markers = db.markers.filter(m => m.id !== req.params.id);
  save(db);
  res.json({ deleted: before !== db.markers.length });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`MyClient API: http://localhost:${PORT}`);
});