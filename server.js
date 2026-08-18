const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Built-in CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-version, x-changelog, x-channel');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// JSON and URL-encoded body parsers
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '150mb' }));

const DATA_FILE = path.join(__dirname, 'data.json');
const MARKERS_FILE = path.join(__dirname, 'markers.json');
const USERS_FILE = path.join(__dirname, 'client_users.json');
const STORAGE_DIR = path.join(__dirname, 'storage');
const VERSION_FILE = path.join(STORAGE_DIR, 'version.json');
const JAR_PATH = path.join(STORAGE_DIR, 'Starly-Client-1.21.11.jar');
const BETA_JAR_PATH = path.join(STORAGE_DIR, 'Starly-Client-1.21.11-beta.jar');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// 1. Cosmetics & Player Data
let cosmeticsData = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    cosmeticsData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    cosmeticsData = {};
  }
}

function saveCosmeticsData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(cosmeticsData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving data.json:', e);
  }
}

// 2. Client Users System (user, beta, owner, customEarlyAccess, bans)
let clientUsers = {};
if (fs.existsSync(USERS_FILE)) {
  try {
    clientUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    clientUsers = {};
  }
}

function saveClientUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(clientUsers, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving client_users.json:', e);
  }
}

// 3. Friend Markers Storage
let markers = [];
if (fs.existsSync(MARKERS_FILE)) {
  try {
    markers = JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8'));
  } catch (e) {
    markers = [];
  }
}

function saveMarkers() {
  try {
    fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving markers.json:', e);
  }
}

// 4. OTA Version Data (Release & Beta Channels)
let versionData = {
  version: '1.21.11-v1.0.0',
  betaVersion: '1.21.11-v1.0.0-beta',
  changelog: 'Релиз Starly Client 1.21.11: обновленный кастомный хотбар, статус-бары, Modrinth каталог модов.',
  betaChangelog: 'Бета-версия с экспериментальными функциями и ранними обновлениями.',
  updatedAt: new Date().toISOString(),
  betaUpdatedAt: new Date().toISOString()
};

if (fs.existsSync(VERSION_FILE)) {
  try {
    versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  } catch (e) {}
}

function saveVersion() {
  try {
    fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving version.json:', e);
  }
}

// Helper: Ensure user exists and get info
function getOrCreateUser(nickname) {
  if (!nickname) return null;
  const key = nickname.trim().toLowerCase();
  if (!clientUsers[key]) {
    clientUsers[key] = {
      name: nickname.trim(),
      role: 'user', // 'user', 'beta', 'owner'
      customEarlyAccess: false,
      banned: false,
      banReason: '',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    saveClientUsers();
  } else {
    clientUsers[key].name = nickname.trim();
    clientUsers[key].lastSeen = new Date().toISOString();
    saveClientUsers();
  }
  return clientUsers[key];
}

// ==================== USER CHECK & AUTH API ====================
app.get('/api/user/check', (req, res) => {
  const nick = req.query.nickname;
  if (!nick) {
    return res.status(400).json({ allowed: false, error: 'Nickname required' });
  }

  const u = getOrCreateUser(nick);
  if (u.banned) {
    return res.json({
      allowed: false,
      banned: true,
      reason: u.banReason || 'Нарушение правил использования клиента',
      message: `Вы забанены в клиенте: ${u.banReason || 'Без указания причины'}`
    });
  }

  const hasEarlyAccess = u.role === 'beta' || u.role === 'owner' || u.customEarlyAccess;
  const token = 'starly_auth_' + Buffer.from(`${u.name}:${Date.now()}:${u.role}`).toString('base64');

  res.json({
    allowed: true,
    banned: false,
    role: u.role,
    isBeta: u.role === 'beta',
    isOwner: u.role === 'owner',
    customEarlyAccess: !!u.customEarlyAccess,
    hasEarlyAccess: !!hasEarlyAccess,
    authToken: token,
    downloadUrl: (hasEarlyAccess && fs.existsSync(BETA_JAR_PATH)) ? '/api/loader/download-beta' : '/api/loader/download',
    versionData: hasEarlyAccess ? {
      version: versionData.betaVersion || versionData.version,
      changelog: versionData.betaChangelog || versionData.changelog,
      updatedAt: versionData.betaUpdatedAt || versionData.updatedAt
    } : {
      version: versionData.version,
      changelog: versionData.changelog,
      updatedAt: versionData.updatedAt
    }
  });
});

// Admin endpoints for user management
app.get('/api/users', (req, res) => {
  res.json(Object.values(clientUsers));
});

app.post('/api/user/set-role', (req, res) => {
  const { nickname, role } = req.body;
  if (!nickname || !['user', 'beta', 'owner'].includes(role)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }
  const u = getOrCreateUser(nickname);
  u.role = role;
  saveClientUsers();
  res.json({ success: true, user: u });
});

app.post('/api/user/toggle-early-access', (req, res) => {
  const { nickname } = req.body;
  if (!nickname) {
    return res.status(400).json({ error: 'Nickname required' });
  }
  const u = getOrCreateUser(nickname);
  u.customEarlyAccess = !u.customEarlyAccess;
  saveClientUsers();
  res.json({ success: true, user: u });
});

app.post('/api/user/ban', (req, res) => {
  const { nickname, reason } = req.body;
  if (!nickname) {
    return res.status(400).json({ error: 'Nickname required' });
  }
  const u = getOrCreateUser(nickname);
  u.banned = true;
  u.banReason = reason || 'Заблокирован администратором';
  saveClientUsers();
  res.json({ success: true, user: u });
});

app.post('/api/user/unban', (req, res) => {
  const { nickname } = req.body;
  if (!nickname) {
    return res.status(400).json({ error: 'Nickname required' });
  }
  const u = getOrCreateUser(nickname);
  u.banned = false;
  u.banReason = '';
  saveClientUsers();
  res.json({ success: true, user: u });
});

// ==================== 1. COSMETICS API ====================
app.get('/api/cosmetics/:id', (req, res) => {
  const id = req.params.id.toLowerCase();
  let match = cosmeticsData[id];
  if (!match) {
    for (const key of Object.keys(cosmeticsData)) {
      const u = cosmeticsData[key];
      if (key.toLowerCase() === id || (u.name && u.name.toLowerCase() === id) || (u.uuid && u.uuid.toLowerCase() === id)) {
        match = u;
        break;
      }
    }
  }

  if (match) {
    res.json(match.cosmetics || match);
  } else {
    res.json([]);
  }
});

app.post('/api/cosmetics', (req, res) => {
  const body = req.body;
  const uuid = (body.uuid || '').toLowerCase();
  const name = (body.name || '').toLowerCase();
  const key = uuid || name || 'unknown';

  cosmeticsData[key] = {
    uuid: body.uuid || '',
    name: body.name || '',
    cosmetics: body.cosmetics || (Array.isArray(body) ? body : []),
    updatedAt: new Date().toISOString()
  };

  if (name && name !== key) {
    cosmeticsData[name] = cosmeticsData[key];
  }

  if (body.name) {
    getOrCreateUser(body.name);
  }

  saveCosmeticsData();
  res.json({ success: true, count: Object.keys(cosmeticsData).length });
});

// ==================== 2. FRIEND MARKERS API ====================
app.post('/api/markers', (req, res) => {
  const m = req.body;
  const id = 'marker_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const newMarker = {
    id,
    owner: m.owner || '',
    name: m.name || '',
    world: m.world || 'minecraft:overworld',
    x: m.x || 0,
    y: m.y || 0,
    z: m.z || 0,
    sharedWith: m.sharedWith || [],
    createdAt: Date.now()
  };

  const now = Date.now();
  markers = markers.filter(item => (now - item.createdAt) < 180000);
  markers.push(newMarker);
  saveMarkers();

  res.json({ success: true, id });
});

app.get('/api/markers/:id', (req, res) => {
  const id = req.params.id.toLowerCase();
  const now = Date.now();
  const active = markers.filter(m => {
    if (now - m.createdAt > 180000) return false;
    if (m.owner && m.owner.toLowerCase() === id) return true;
    if (m.name && m.name.toLowerCase() === id) return true;
    if (Array.isArray(m.sharedWith)) {
      return m.sharedWith.some(s => s && s.toLowerCase() === id);
    }
    return false;
  });

  res.json(active);
});

app.post('/api/markers/clear', (req, res) => {
  const { id } = req.body;
  if (id) {
    const cleanId = id.toLowerCase();
    markers = markers.filter(m => {
      return m.owner.toLowerCase() !== cleanId && m.name.toLowerCase() !== cleanId;
    });
    saveMarkers();
  }
  res.json({ success: true });
});

// ==================== 3. PLAYER STATUS API ====================
app.get('/api/player/test', (req, res) => {
  res.json({ status: 'online', server: 'Starly Client Network' });
});

app.post('/api/player', (req, res) => {
  res.json({ success: true });
});

// ==================== 4. LOADER OTA API ====================
app.get('/api/loader/version', (req, res) => {
  const nick = req.query.nickname;
  if (nick) {
    const u = getOrCreateUser(nick);
    const hasEarlyAccess = u.role === 'beta' || u.role === 'owner' || u.customEarlyAccess;
    if (hasEarlyAccess) {
      return res.json({
        version: versionData.betaVersion || versionData.version,
        changelog: versionData.betaChangelog || versionData.changelog,
        updatedAt: versionData.betaUpdatedAt || versionData.updatedAt,
        isBetaChannel: true,
        downloadUrl: fs.existsSync(BETA_JAR_PATH) ? '/api/loader/download-beta' : '/api/loader/download'
      });
    }
  }

  res.json({
    version: versionData.version,
    changelog: versionData.changelog,
    updatedAt: versionData.updatedAt,
    isBetaChannel: false,
    downloadUrl: '/api/loader/download'
  });
});

app.get('/api/loader/download', (req, res) => {
  if (fs.existsSync(JAR_PATH)) {
    res.download(JAR_PATH, 'Starly-Client-1.21.11.jar');
  } else {
    res.status(404).json({ error: 'Client release jar not uploaded yet' });
  }
});

app.get('/api/loader/download-beta', (req, res) => {
  if (fs.existsSync(BETA_JAR_PATH)) {
    res.download(BETA_JAR_PATH, 'Starly-Client-1.21.11-beta.jar');
  } else if (fs.existsSync(JAR_PATH)) {
    res.download(JAR_PATH, 'Starly-Client-1.21.11.jar');
  } else {
    res.status(404).json({ error: 'Beta jar not uploaded yet' });
  }
});

// Raw Stream Upload
app.post('/api/loader/upload-raw', (req, res) => {
  const version = req.headers['x-version'] || versionData.version;
  const changelog = req.headers['x-changelog'] ? decodeURIComponent(req.headers['x-changelog']) : versionData.changelog;
  const channel = req.headers['x-channel'] || 'release';

  const targetPath = channel === 'beta' ? BETA_JAR_PATH : JAR_PATH;
  const fileStream = fs.createWriteStream(targetPath);
  req.pipe(fileStream);

  fileStream.on('finish', () => {
    if (channel === 'beta') {
      versionData.betaVersion = version;
      versionData.betaChangelog = changelog;
      versionData.betaUpdatedAt = new Date().toISOString();
    } else {
      versionData.version = version;
      versionData.changelog = changelog;
      versionData.updatedAt = new Date().toISOString();
    }
    saveVersion();
    res.json({ success: true, message: `Jar updated in channel ${channel}`, versionData });
  });

  fileStream.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

// HTML Form Multipart Upload Handler
app.post('/api/loader/upload', (req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    
    if (boundaryMatch) {
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const parts = buffer.toString('binary').split('--' + boundary);

      let newVersion = versionData.version;
      let newChangelog = versionData.changelog;
      let channel = 'release';
      let jarBuffer = null;

      for (const part of parts) {
        if (part.includes('name="version"')) {
          const m = part.match(/\r\n\r\n([\s\S]*?)\r\n/);
          if (m) newVersion = m[1].trim();
        } else if (part.includes('name="changelog"')) {
          const m = part.match(/\r\n\r\n([\s\S]*?)\r\n/);
          if (m) newChangelog = m[1].trim();
        } else if (part.includes('name="channel"')) {
          const m = part.match(/\r\n\r\n([\s\S]*?)\r\n/);
          if (m) channel = m[1].trim();
        } else if (part.includes('name="clientJar"') && part.includes('filename=')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const rawBody = part.substring(headerEnd + 4);
            const cleanBody = rawBody.replace(/\r\n$/, '');
            jarBuffer = Buffer.from(cleanBody, 'binary');
          }
        }
      }

      const targetPath = channel === 'beta' ? BETA_JAR_PATH : JAR_PATH;

      if (jarBuffer && jarBuffer.length > 100) {
        fs.writeFileSync(targetPath, jarBuffer);
      }

      if (channel === 'beta') {
        versionData.betaVersion = newVersion;
        versionData.betaChangelog = newChangelog;
        versionData.betaUpdatedAt = new Date().toISOString();
      } else {
        versionData.version = newVersion;
        versionData.changelog = newChangelog;
        versionData.updatedAt = new Date().toISOString();
      }
      saveVersion();
    }

    res.redirect(`/?success=1&channel=${encodeURIComponent(req.query.channel || '1')}`);
  });
});

// ==================== 5. ADMIN WEB PANEL ====================
app.get(['/', '/admin'], (req, res) => {
  const hasJar = fs.existsSync(JAR_PATH);
  let jarSize = 'Не загружен';
  if (hasJar) {
    const st = fs.statSync(JAR_PATH);
    jarSize = (st.size / (1024 * 1024)).toFixed(2) + ' MB';
  }

  const hasBetaJar = fs.existsSync(BETA_JAR_PATH);
  let betaJarSize = 'Не загружен';
  if (hasBetaJar) {
    const st = fs.statSync(BETA_JAR_PATH);
    betaJarSize = (st.size / (1024 * 1024)).toFixed(2) + ' MB';
  }

  const userList = Object.values(clientUsers);
  const totalUsers = userList.length;
  const betaCount = userList.filter(u => u.role === 'beta').length;
  const customCount = userList.filter(u => u.customEarlyAccess).length;
  const bannedCount = userList.filter(u => u.banned).length;

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starly Cloud Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: radial-gradient(circle at 80% 20%, rgba(92, 124, 250, 0.12) 0%, transparent 40%),
                  radial-gradient(circle at 20% 80%, rgba(224, 86, 253, 0.1) 0%, transparent 45%),
                  #0c0e14;
      color: #f5f6fa;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 30px 20px;
    }
    .wrapper { width: 100%; max-width: 950px; display: flex; flex-direction: column; gap: 20px; }
    .card {
      background: rgba(22, 25, 38, 0.85);
      backdrop-filter: blur(30px);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
    }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .title { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 10px; }
    .badge { font-size: 11px; font-weight: 700; background: rgba(92, 124, 250, 0.15); color: #748ffc; padding: 4px 12px; border-radius: 99px; border: 1px solid rgba(92, 124, 250, 0.3); }
    
    .nav-tabs { display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 14px; }
    .nav-btn {
      background: transparent; border: none; color: #95a5a6; font-weight: 600; font-size: 14px; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: 0.2s;
    }
    .nav-btn.active, .nav-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.06); }
    .nav-btn.active { background: #5c7cfa; color: #fff; }

    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
    .stat-item {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 12px;
      padding: 14px;
    }
    .stat-label { font-size: 11.5px; color: #95a5a6; margin-bottom: 4px; font-weight: 500; }
    .stat-val { font-size: 15px; font-weight: 700; color: #fff; }

    .field { margin-bottom: 18px; display: flex; flex-direction: column; gap: 7px; }
    label { font-size: 12.5px; font-weight: 600; color: #95a5a6; }
    input[type="text"], textarea, select {
      background: rgba(14, 16, 24, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 12px 14px;
      color: #fff;
      font-size: 13.5px;
      font-family: inherit;
      outline: none;
    }
    input[type="file"] {
      background: rgba(14, 16, 24, 0.9);
      border: 1px dashed rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 16px;
      color: #95a5a6;
      cursor: pointer;
    }
    
    .btn-group { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 15px; }
    .btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 10px;
      color: #fff;
      font-size: 13.5px;
      font-weight: 800;
      cursor: pointer;
      transition: 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn:hover { transform: translateY(-2px); }
    .btn-release { background: linear-gradient(135deg, #5c7cfa 0%, #3b5bdb 100%); box-shadow: 0 6px 20px rgba(92, 124, 250, 0.35); }
    .btn-beta-pub { background: linear-gradient(135deg, #f59f00 0%, #d9480f 100%); box-shadow: 0 6px 20px rgba(245, 159, 0, 0.35); color: #fff; }

    .alert { background: rgba(46, 213, 115, 0.15); border: 1px solid rgba(46, 213, 115, 0.3); color: #2ed573; padding: 12px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; font-weight: 600; text-align: center; }

    /* Users table */
    .table-box { width: 100%; overflow-x: auto; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
    th { padding: 12px; background: rgba(255, 255, 255, 0.04); color: #95a5a6; font-weight: 600; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
    td { padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .role-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .role-user { background: rgba(255, 255, 255, 0.08); color: #ced4da; }
    .role-beta { background: rgba(255, 212, 59, 0.15); color: #ffd43b; border: 1px solid rgba(255, 212, 59, 0.3); }
    .role-owner { background: rgba(255, 107, 107, 0.15); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.3); }
    .status-banned { color: #ff6b6b; font-weight: 700; }
    .status-active { color: #51cf66; font-weight: 600; }
    
    .action-btn { padding: 5px 10px; font-size: 11px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; transition: 0.15s; margin-right: 4px; margin-bottom: 2px; }
    .btn-beta { background: #ffd43b; color: #1e1e24; }
    .btn-early { background: #e056fd; color: #fff; }
    .btn-early-active { background: #4834d4; color: #fff; }
    .btn-ban { background: #ff6b6b; color: #fff; }
    .btn-unban { background: #51cf66; color: #fff; }
    .btn-user { background: #868e96; color: #fff; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1 class="title">✦ Starly Client Cloud Hub</h1>
        <span class="badge">Онлайн</span>
      </div>

      <div class="nav-tabs">
        <button class="nav-btn active" onclick="switchTab('updates')">📦 Обновления (OTA)</button>
        <button class="nav-btn" onclick="switchTab('users')">👥 Пользователи (${totalUsers})</button>
      </div>

      <!-- TAB 1: UPDATES -->
      <div id="tab-updates">
        ${req.query.success ? '<div class="alert">✓ Обновление успешно загружено и опубликовано!</div>' : ''}
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-label">Релизная версия:</div>
            <div class="stat-val" style="color: #748ffc;">${versionData.version} (${jarSize})</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Бета версия:</div>
            <div class="stat-val" style="color: #ffd43b;">${versionData.betaVersion || '—'} (${betaJarSize})</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Всего игроков:</div>
            <div class="stat-val">${totalUsers}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Бета-тестеров:</div>
            <div class="stat-val" style="color: #ffd43b;">${betaCount} (персонально: ${customCount})</div>
          </div>
        </div>

        <form id="uploadForm" action="/api/loader/upload" method="POST" enctype="multipart/form-data">
          <input type="hidden" name="channel" id="targetChannelInput" value="release">

          <div class="field">
            <label>Файл обновления клиента (.jar)</label>
            <input type="file" name="clientJar" accept=".jar" required>
          </div>

          <div class="field">
            <label>Номер версии (например: 1.21.11-v1.0.1 или 1.21.11-v1.0.1-beta)</label>
            <input type="text" name="version" id="versionInput" value="${versionData.version}" required>
          </div>

          <div class="field">
            <label>Список изменений (Changelog)</label>
            <textarea name="changelog" id="changelogInput" rows="3">${versionData.changelog || ''}</textarea>
          </div>

          <div class="btn-group">
            <button type="button" class="btn btn-release" onclick="submitUpload('release')">
              🚀 ОПУБЛИКОВАТЬ (ДЛЯ ВСЕХ)
            </button>
            <button type="button" class="btn btn-beta-pub" onclick="submitUpload('beta')">
              ⚡ ОПУБЛИКОВАТЬ ДЛЯ BETA-ЮЗЕРОВ
            </button>
          </div>
        </form>
      </div>

      <!-- TAB 2: USERS -->
      <div id="tab-users" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <h3 style="font-size: 16px; font-weight: 700;">Управление игроками и доступом к апдейтам</h3>
          <div style="font-size: 12px; color: #95a5a6;">Забанено: <b style="color: #ff6b6b;">${bannedCount}</b></div>
        </div>

        <div class="table-box">
          <table>
            <thead>
              <tr>
                <th>Никнейм</th>
                <th>Роль</th>
                <th>Доступ к апдейтам</th>
                <th>Статус</th>
                <th>Причина бана</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              ${userList.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: #868e96; padding: 24px;">Пока нет зарегистрированных игроков. Они появятся при первом запуске клиента.</td></tr>' : ''}
              ${userList.map(u => `
                <tr>
                  <td><b>${u.name}</b></td>
                  <td>
                    <span class="role-badge role-${u.role}">
                      ${u.role === 'owner' ? '👑 Владелец' : (u.role === 'beta' ? '⚡ Beta-юзер' : '👤 Юзер')}
                    </span>
                  </td>
                  <td>
                    ${u.role === 'owner' || u.role === 'beta' 
                      ? '<span style="color: #ffd43b; font-weight: 700; font-size: 12px;">⚡ Все бета-апдейты</span>' 
                      : (u.customEarlyAccess 
                          ? '<span style="color: #e056fd; font-weight: 700; font-size: 12px;">🎁 Персональный апдейт</span>' 
                          : '<span style="color: #95a5a6; font-size: 12px;">Только релиз</span>')}
                  </td>
                  <td>
                    ${u.banned ? '<span class="status-banned">✖ Забанен</span>' : '<span class="status-active">✓ Активен</span>'}
                  </td>
                  <td style="color: #95a5a6; font-size: 11.5px;">${u.banReason || '—'}</td>
                  <td>
                    ${u.role !== 'owner' ? `
                      ${u.role === 'beta' 
                        ? `<button class="action-btn btn-user" onclick="setRole('${u.name}', 'user')">Снять Бету</button>` 
                        : `<button class="action-btn btn-beta" onclick="setRole('${u.name}', 'beta')">★ Дать Бету</button>`}
                      
                      ${u.customEarlyAccess 
                        ? `<button class="action-btn btn-early-active" onclick="toggleEarlyAccess('${u.name}')">✓ Выдан апдейт</button>` 
                        : `<button class="action-btn btn-early" onclick="toggleEarlyAccess('${u.name}')">🎁 Выдать апдейт</button>`}

                      ${u.banned 
                        ? `<button class="action-btn btn-unban" onclick="unbanUser('${u.name}')">Разбанить</button>` 
                        : `<button class="action-btn btn-ban" onclick="banUser('${u.name}')">Забанить</button>`}
                    ` : '<span style="color: #868e96; font-size: 11px;">Создатель</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  </div>

  <script>
    function switchTab(tab) {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('tab-updates').style.display = tab === 'updates' ? 'block' : 'none';
      document.getElementById('tab-users').style.display = tab === 'users' ? 'block' : 'none';
      event.target.classList.add('active');
    }

    function submitUpload(channel) {
      document.getElementById('targetChannelInput').value = channel;
      const form = document.getElementById('uploadForm');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      form.submit();
    }

    async function setRole(nickname, role) {
      if (!confirm('Изменить роль для ' + nickname + ' на ' + role + '?')) return;
      const res = await fetch('/api/user/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, role })
      });
      if (res.ok) location.reload();
    }

    async function toggleEarlyAccess(nickname) {
      const res = await fetch('/api/user/toggle-early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname })
      });
      if (res.ok) location.reload();
    }

    async function banUser(nickname) {
      const reason = prompt('Укажите причину бана для ' + nickname + ':', 'Нарушение правил клиента');
      if (reason === null) return;
      const res = await fetch('/api/user/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, reason })
      });
      if (res.ok) location.reload();
    }

    async function unbanUser(nickname) {
      if (!confirm('Разбанить пользователя ' + nickname + '?')) return;
      const res = await fetch('/api/user/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname })
      });
      if (res.ok) location.reload();
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Starly server running on port ${PORT}`);
});
