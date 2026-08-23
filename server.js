const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD_SALT = 'STARLY_AUTH_SALT_v1_2026';

// Built-in CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-version, x-changelog, x-channel, x-hwid');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// JSON and URL-encoded body parsers
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '150mb' }));

// Static files for Web Dashboard
const PUBLIC_DIR = path.join(__dirname, 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

const DATA_FILE = path.join(__dirname, 'data.json');
const MARKERS_FILE = path.join(__dirname, 'markers.json');
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
const BANNED_HWIDS_FILE = path.join(__dirname, 'banned_hwids.json');
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
  try { cosmeticsData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { cosmeticsData = {}; }
}
function saveCosmeticsData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(cosmeticsData, null, 2), 'utf8'); } catch (e) {}
}

// 2. Accounts & HWID Bans
let accounts = {};
if (fs.existsSync(ACCOUNTS_FILE)) {
  try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch (e) { accounts = {}; }
}
function saveAccounts() {
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8'); } catch (e) {}
}

let bannedHwids = {};
if (fs.existsSync(BANNED_HWIDS_FILE)) {
  try { bannedHwids = JSON.parse(fs.readFileSync(BANNED_HWIDS_FILE, 'utf8')); } catch (e) { bannedHwids = {}; }
}
function saveBannedHwids() {
  try { fs.writeFileSync(BANNED_HWIDS_FILE, JSON.stringify(bannedHwids, null, 2), 'utf8'); } catch (e) {}
}

// 3. Friend Markers Storage
let markers = [];
if (fs.existsSync(MARKERS_FILE)) {
  try { markers = JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')); } catch (e) { markers = []; }
}
function saveMarkers() {
  try { fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2), 'utf8'); } catch (e) {}
}

// 4. OTA Version Data
let versionData = {
  version: '1.21.11-v1.0.0',
  betaVersion: '1.21.11-v1.0.0-beta',
  changelog: 'Релиз Starly Client 1.21.11: обновленный кастомный хотбар, статус-бары, Modrinth каталог модов.',
  betaChangelog: 'Бета-версия с экспериментальными функциями и ранними обновлениями.',
  updatedAt: new Date().toISOString(),
  betaUpdatedAt: new Date().toISOString()
};

if (fs.existsSync(VERSION_FILE)) {
  try { versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); } catch (e) {}
}
function saveVersion() {
  try { fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2), 'utf8'); } catch (e) {}
}

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + PASSWORD_SALT).digest('hex');
}

function isHwidBanned(hwid) {
  if (!hwid) return false;
  return !!bannedHwids[hwid.toLowerCase().trim()];
}

function getHwidBanReason(hwid) {
  if (!hwid) return 'Устройство заблокировано';
  return bannedHwids[hwid.toLowerCase().trim()] || 'Устройство заблокировано в системе';
}

function generateToken(user) {
  const payload = `${user.email}:${user.nickname}:${user.role}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', PASSWORD_SALT).update(payload).digest('hex');
  return Buffer.from(payload + ':' + sig).toString('base64');
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 5) return null;
    const [email, nickname, role, timeStr, sig] = parts;
    const payload = `${email}:${nickname}:${role}:${timeStr}`;
    const expectedSig = crypto.createHmac('sha256', PASSWORD_SALT).update(payload).digest('hex');
    if (sig !== expectedSig) return null;
    
    const acc = Object.values(accounts).find(a => a.email.toLowerCase() === email.toLowerCase());
    return acc || null;
  } catch (e) {
    return null;
  }
}

// Serve Web Dashboard on GET /
app.get('/', (req, res) => {
  const indexHtml = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.json({ name: 'Starly Client API Server', status: 'online', accounts: Object.keys(accounts).length });
  }
});

// ==================== AUTH & REGISTRATION API ====================

app.post('/api/auth/register', (req, res) => {
  const { email, nickname, password, hwid } = req.body;
  if (!email || !nickname || !password) {
    return res.status(400).json({ success: false, error: 'Заполните все поля (почта, никнейм, пароль)' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanNick = nickname.trim();
  const cleanHwid = (hwid || '').trim().toLowerCase();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ success: false, error: 'Введите корректный адрес электронной почты' });
  }

  if (cleanNick.length < 3 || cleanNick.length > 20) {
    return res.status(400).json({ success: false, error: 'Никнейм должен быть от 3 до 20 символов' });
  }

  if (password.length < 4) {
    return res.status(400).json({ success: false, error: 'Пароль должен содержать минимум 4 символа' });
  }

  if (isHwidBanned(cleanHwid)) {
    return res.status(403).json({
      success: false,
      banned: true,
      error: `Регистрация невозможна. Ваше устройство заблокировано: ${getHwidBanReason(cleanHwid)}`
    });
  }

  if (accounts[cleanEmail]) {
    return res.status(400).json({ success: false, error: 'Пользователь с такой почтой уже зарегистрирован' });
  }

  const nickExists = Object.values(accounts).some(a => a.nickname.toLowerCase() === cleanNick.toLowerCase());
  if (nickExists) {
    return res.status(400).json({ success: false, error: 'Этот никнейм уже занят другим игроком' });
  }

  const isFirstAccount = Object.keys(accounts).length === 0;
  const newAccount = {
    email: cleanEmail,
    nickname: cleanNick,
    passwordHash: hashPassword(password),
    hwid: cleanHwid,
    role: isFirstAccount ? 'owner' : 'user',
    customEarlyAccess: false,
    banned: false,
    banReason: '',
    registeredAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  accounts[cleanEmail] = newAccount;
  saveAccounts();

  const token = generateToken(newAccount);
  res.json({
    success: true,
    token: token,
    user: {
      email: newAccount.email,
      nickname: newAccount.nickname,
      role: newAccount.role,
      hasEarlyAccess: newAccount.role === 'beta' || newAccount.role === 'owner' || newAccount.customEarlyAccess
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { emailOrNick, password, hwid } = req.body;
  if (!emailOrNick || !password) {
    return res.status(400).json({ success: false, error: 'Введите логин (почту или ник) и пароль' });
  }

  const query = emailOrNick.trim().toLowerCase();
  const cleanHwid = (hwid || '').trim().toLowerCase();

  if (isHwidBanned(cleanHwid)) {
    return res.status(403).json({
      success: false,
      banned: true,
      error: `Вход заблокирован. Ваше устройство забанено: ${getHwidBanReason(cleanHwid)}`
    });
  }

  const acc = Object.values(accounts).find(a => 
    a.email.toLowerCase() === query || a.nickname.toLowerCase() === query
  );

  if (!acc) {
    return res.status(401).json({ success: false, error: 'Пользователь не найден' });
  }

  if (acc.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ success: false, error: 'Неверный пароль' });
  }

  if (acc.banned) {
    return res.status(403).json({
      success: false,
      banned: true,
      error: `Ваш аккаунт заблокирован: ${acc.banReason || 'Без указания причины'}`
    });
  }

  if (cleanHwid) {
    acc.hwid = cleanHwid;
  }
  acc.lastLoginAt = new Date().toISOString();
  saveAccounts();

  const token = generateToken(acc);
  res.json({
    success: true,
    token: token,
    user: {
      email: acc.email,
      nickname: acc.nickname,
      role: acc.role,
      hasEarlyAccess: acc.role === 'beta' || acc.role === 'owner' || acc.customEarlyAccess
    }
  });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '') || req.query.token;
  const hwid = (req.headers['x-hwid'] || req.query.hwid || '').trim().toLowerCase();

  if (isHwidBanned(hwid)) {
    return res.status(403).json({
      valid: false,
      banned: true,
      error: `Устройство заблокировано: ${getHwidBanReason(hwid)}`
    });
  }

  const acc = verifyToken(token);
  if (!acc) {
    return res.status(401).json({ valid: false, error: 'Сессия истекла или недействительна' });
  }

  if (acc.banned) {
    return res.status(403).json({
      valid: false,
      banned: true,
      error: `Аккаунт заблокирован: ${acc.banReason || 'Без причины'}`
    });
  }

  const hasEarlyAccess = acc.role === 'beta' || acc.role === 'owner' || acc.customEarlyAccess;
  res.json({
    valid: true,
    user: {
      email: acc.email,
      nickname: acc.nickname,
      role: acc.role,
      hasEarlyAccess: !!hasEarlyAccess
    },
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

// Admin: Ban User & HWID
app.post('/api/user/ban', (req, res) => {
  const { nickname, email, reason, banHwid } = req.body;
  const acc = Object.values(accounts).find(a => 
    (nickname && a.nickname.toLowerCase() === nickname.toLowerCase()) ||
    (email && a.email.toLowerCase() === email.toLowerCase())
  );

  if (!acc) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  acc.banned = true;
  acc.banReason = reason || 'Заблокирован администратором';
  
  if ((banHwid !== false) && acc.hwid) {
    bannedHwids[acc.hwid.toLowerCase()] = acc.banReason;
    saveBannedHwids();
  }

  saveAccounts();
  res.json({ success: true, message: `Пользователь ${acc.nickname} и HWID (${acc.hwid}) забанены`, user: acc });
});

// Admin: Unban User
app.post('/api/user/unban', (req, res) => {
  const { nickname, email } = req.body;
  const acc = Object.values(accounts).find(a => 
    (nickname && a.nickname.toLowerCase() === nickname.toLowerCase()) ||
    (email && a.email.toLowerCase() === email.toLowerCase())
  );

  if (!acc) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  acc.banned = false;
  acc.banReason = '';
  
  if (acc.hwid && bannedHwids[acc.hwid.toLowerCase()]) {
    delete bannedHwids[acc.hwid.toLowerCase()];
    saveBannedHwids();
  }

  saveAccounts();
  res.json({ success: true, message: `Пользователь ${acc.nickname} разбанен`, user: acc });
});

// Admin: Set Role
app.post('/api/user/set-role', (req, res) => {
  const { nickname, role } = req.body;
  const acc = Object.values(accounts).find(a => a.nickname.toLowerCase() === (nickname || '').toLowerCase());
  if (!acc || !['user', 'beta', 'owner'].includes(role)) {
    return res.status(400).json({ error: 'Неверные параметры' });
  }
  acc.role = role;
  saveAccounts();
  res.json({ success: true, user: acc });
});

// Admin: List all accounts
app.get('/api/users', (req, res) => {
  const list = Object.values(accounts).map(a => ({
    email: a.email,
    nickname: a.nickname,
    role: a.role,
    hwid: a.hwid,
    banned: a.banned,
    banReason: a.banReason,
    registeredAt: a.registeredAt,
    lastLoginAt: a.lastLoginAt
  }));
  res.json(list);
});

// ==================== COSMETICS API ====================
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
  if (!body) return res.status(400).json({ error: 'Empty body' });

  const uuid = (body.uuid || body.name || 'unknown').toLowerCase();
  cosmeticsData[uuid] = body;
  saveCosmeticsData();
  res.json({ success: true });
});

// ==================== MARKERS API ====================
app.get('/api/markers', (req, res) => {
  res.json(markers);
});

app.post('/api/markers', (req, res) => {
  const marker = req.body;
  if (!marker || !marker.owner || !marker.name) {
    return res.status(400).json({ error: 'Invalid marker data' });
  }

  const qOwner = marker.owner.toLowerCase();
  const qName = marker.name.toLowerCase();
  markers = markers.filter(m =>
    !((m.owner && m.owner.toLowerCase() === qOwner) || (m.name && m.name.toLowerCase() === qName))
  );

  marker.createdAt = Date.now();
  markers.push(marker);
  saveMarkers();
  res.json({ success: true, count: markers.length });
});

// ==================== OTA LOADER DOWNLOAD ====================
app.get('/api/loader/version', (req, res) => {
  const hwid = (req.headers['x-hwid'] || req.query.hwid || '').trim().toLowerCase();
  if (isHwidBanned(hwid)) {
    return res.status(403).json({ error: 'Устройство заблокировано', banned: true });
  }
  res.json(versionData);
});

app.get('/api/loader/download', (req, res) => {
  if (fs.existsSync(JAR_PATH)) {
    res.download(JAR_PATH, 'Starly-Client-1.21.11.jar');
  } else {
    res.status(404).json({ error: 'Jar not found' });
  }
});

app.get('/api/loader/download-beta', (req, res) => {
  if (fs.existsSync(BETA_JAR_PATH)) {
    res.download(BETA_JAR_PATH, 'Starly-Client-1.21.11-beta.jar');
  } else if (fs.existsSync(JAR_PATH)) {
    res.download(JAR_PATH, 'Starly-Client-1.21.11.jar');
  } else {
    res.status(404).json({ error: 'Jar not found' });
  }
});

app.listen(PORT, () => {
  console.log(`[StarlyServer] Running on port ${PORT} with Web Dashboard, Email Auth & HWID Protection`);
});
