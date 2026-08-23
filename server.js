const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD_SALT = 'STARLY_AUTH_SALT_v1_2026';

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-version, x-changelog, x-channel, x-hwid');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '150mb' }));

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

let cosmeticsData = {};
if (fs.existsSync(DATA_FILE)) {
  try { cosmeticsData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { cosmeticsData = {}; }
}
function saveCosmeticsData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(cosmeticsData, null, 2), 'utf8'); } catch (e) {}
}

let accounts = {};
if (fs.existsSync(ACCOUNTS_FILE)) {
  try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch (e) { accounts = {}; }
}

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + PASSWORD_SALT).digest('hex');
}

if (Object.keys(accounts).length === 0) {
  accounts['admin@starly.client'] = {
    email: 'admin@starly.client',
    nickname: 'Admin',
    passwordHash: hashPassword('admin123'),
    hwid: '',
    role: 'owner',
    customEarlyAccess: true,
    banned: false,
    banReason: '',
    registeredAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
}

function saveAccounts() {
  try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8'); } catch (e) {}
}
saveAccounts();

let bannedHwids = {};
if (fs.existsSync(BANNED_HWIDS_FILE)) {
  try { bannedHwids = JSON.parse(fs.readFileSync(BANNED_HWIDS_FILE, 'utf8')); } catch (e) { bannedHwids = {}; }
}
function saveBannedHwids() {
  try { fs.writeFileSync(BANNED_HWIDS_FILE, JSON.stringify(bannedHwids, null, 2), 'utf8'); } catch (e) {}
}

let markers = [];
if (fs.existsSync(MARKERS_FILE)) {
  try { markers = JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')); } catch (e) { markers = []; }
}
function saveMarkers() {
  try { fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2), 'utf8'); } catch (e) {}
}

let versionData = {
  version: '1.21.11-v1.0.0',
  betaVersion: '1.21.11-v1.0.0-beta',
  changelog: 'Starly Client 1.21.11 Release',
  betaChangelog: 'Starly Client 1.21.11 Beta channel',
  updatedAt: new Date().toISOString(),
  betaUpdatedAt: new Date().toISOString()
};

if (fs.existsSync(VERSION_FILE)) {
  try { versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); } catch (e) {}
}
function saveVersion() {
  try { fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2), 'utf8'); } catch (e) {}
}

function isHwidBanned(hwid) {
  if (!hwid) return false;
  return !!bannedHwids[hwid.toLowerCase().trim()];
}

function getHwidBanReason(hwid) {
  if (!hwid) return 'Blocked';
  return bannedHwids[hwid.toLowerCase().trim()] || 'Device banned';
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
    
    let acc = Object.values(accounts).find(a => a.email.toLowerCase() === email.toLowerCase());
    if (!acc) {
      acc = {
        email: email.toLowerCase(),
        nickname: nickname,
        passwordHash: '',
        hwid: '',
        role: role || 'user',
        customEarlyAccess: role === 'beta' || role === 'owner',
        banned: false,
        banReason: '',
        registeredAt: new Date(parseInt(timeStr) || Date.now()).toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      accounts[email.toLowerCase()] = acc;
      saveAccounts();
    }
    return acc;
  } catch (e) {
    return null;
  }
}

const DASHBOARD_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Starly Client - Control Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #0b0f17; color: #e6edf3; min-height: 100vh; padding: 30px 20px; }
    .container { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
    
    .main-header { display: flex; justify-content: space-between; align-items: center; background: #131a26; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 20px 28px; }
    .brand-title { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; color: #fff; }
    .brand-sub { color: #5c7cfa; font-size: 14px; font-weight: 600; }
    
    .card { background: #131a26; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 24px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px; }
    .card-header h2 { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #fff; }
    
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 12px; font-weight: 600; color: #8b949e; }
    
    input, textarea, select { width: 100%; background: #0b0f17; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 13px; font-family: inherit; outline: none; }
    input:focus, textarea:focus, select:focus { border-color: #5c7cfa; }
    textarea { min-height: 80px; resize: vertical; }
    
    button { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    button:hover { filter: brightness(1.15); }
    
    .btn-primary { background: #238636 !important; color: #fff !important; }
    .btn-blue { background: #5c7cfa !important; color: #fff !important; }
    .btn-purple { background: #845ef7 !important; color: #fff !important; }
    .btn-danger { background: #da3633 !important; color: #fff !important; }
    .btn-sm { padding: 6px 11px; font-size: 11.5px; border-radius: 6px; margin-right: 4px; margin-bottom: 4px; }
    
    .table-responsive { overflow-x: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th { text-align: left; padding: 12px 14px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.08); color: #8b949e; font-size: 12px; }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
    
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .badge-owner { background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
    .badge-beta { background: rgba(163, 113, 247, 0.2); color: #a371f7; border: 1px solid rgba(163, 113, 247, 0.4); }
    .badge-user { background: rgba(88, 166, 255, 0.2); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.4); }
    .badge-banned { background: rgba(248, 81, 73, 0.2); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
    .badge-active { background: rgba(46, 160, 67, 0.2); color: #3fb950; border: 1px solid rgba(46, 160, 67, 0.4); }
    
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat-card { background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 6px; }
    .stat-title { font-size: 12px; color: #8b949e; }
    .stat-value { font-size: 18px; font-weight: 800; color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    
    <header class="main-header">
      <div>
        <h1 class="brand-title">Starly Client</h1>
        <span class="brand-sub">Панель управления</span>
      </div>
      <button id="btn-top-refresh" onclick="window.refreshAll()" class="btn-blue">Обновить данные</button>
    </header>

    <div class="card">
      <div class="card-header">
        <h2>Статус сервера</h2>
      </div>
      <div class="status-grid">
        <div class="stat-card">
          <span class="stat-title">Сервер API</span>
          <span class="stat-value" style="color: #3fb950;">ONLINE</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Релизная версия</span>
          <span class="stat-value" id="stat-version">1.21.11</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Бета версия</span>
          <span class="stat-value" style="color: #a371f7;" id="stat-beta-version">1.21.11-beta</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Защита HWID</span>
          <span class="stat-value" style="color: #58a6ff;">Активна</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Зарегистрированные аккаунты (<span id="user-count-badge">1</span>)</h2>
        <button id="btn-refresh-users" onclick="window.loadUsers()" class="btn-blue btn-sm">Обновить список</button>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Email</th>
              <th>Роль</th>
              <th>HWID</th>
              <th>Статус</th>
              <th>Управление</th>
            </tr>
          </thead>
          <tbody id="users-table-body">
            <tr>
              <td><strong>Admin</strong></td>
              <td>admin@starly.client</td>
              <td><span class="badge badge-owner">owner</span></td>
              <td>-</td>
              <td><span class="badge badge-active">АКТИВЕН</span></td>
              <td>
                <button class="btn-purple btn-sm" onclick="window.setRole('Admin', 'beta')">Выдать Beta</button>
                <button class="btn-danger btn-sm" onclick="window.quickBan('Admin')">Бан</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      
      <div class="card">
        <div class="card-header">
          <h2>Создать аккаунт</h2>
        </div>
        <div class="row">
          <div class="col">
            <label>Никнейм</label>
            <input id="create-nick" value="Player1" placeholder="Никнейм">
          </div>
          <div class="col">
            <label>Email</label>
            <input id="create-email" value="player1@starly.client" type="email" placeholder="Email">
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Пароль</label>
            <input id="create-pwd" value="123456" type="text" placeholder="Пароль">
          </div>
          <div class="col">
            <label>Роль</label>
            <select id="create-role">
              <option value="owner">Владелец (Owner)</option>
              <option value="beta">Beta тестер</option>
              <option value="user" selected>Игрок (User)</option>
            </select>
          </div>
        </div>
        <button id="btn-create-acc" onclick="window.createAccountDirectly()" class="btn-primary" style="width: 100%;">Создать аккаунт</button>
      </div>

      <div class="card">
        <div class="card-header">
          <h2>Бан по HWID</h2>
        </div>
        <div class="row">
          <div class="col">
            <label>Никнейм</label>
            <input id="ban-input-nick" placeholder="Никнейм">
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Причина бана</label>
            <input id="ban-input-reason" value="Нарушение правил" placeholder="Причина">
          </div>
        </div>
        <button id="btn-ban-action" onclick="window.submitBan()" class="btn-danger" style="width: 100%;">Забанить (HWID)</button>
      </div>

    </div>

    <div class="card">
      <div class="card-header">
        <h2>Выпуск обновлений</h2>
        <button id="btn-refresh-ota" onclick="window.loadVersionData()" class="btn-blue btn-sm">Обновить</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
        
        <div style="background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px;">
          <h3 style="color: #3fb950; margin-bottom: 12px;">Релизный канал</h3>
          <div class="row">
            <div class="col">
              <label>Версия</label>
              <input id="ota-release-version" value="1.21.11-v1.0.1">
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Changelog</label>
              <textarea id="ota-release-changelog">Релиз обновления Starly Client 1.21.11.</textarea>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>JAR файл</label>
              <input type="file" id="ota-release-file" accept=".jar">
            </div>
          </div>
          <button id="btn-pub-release" onclick="window.publishRelease(false)" class="btn-primary" style="width: 100%;">Опубликовать Релиз</button>
        </div>

        <div style="background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px;">
          <h3 style="color: #a371f7; margin-bottom: 12px;">Бета канал</h3>
          <div class="row">
            <div class="col">
              <label>Beta Версия</label>
              <input id="ota-beta-version" value="1.21.11-v1.0.1-beta">
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Beta Changelog</label>
              <textarea id="ota-beta-changelog">Бета версия с ранними функциями.</textarea>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Beta JAR файл</label>
              <input type="file" id="ota-beta-file" accept=".jar">
            </div>
          </div>
          <button id="btn-pub-beta" onclick="window.publishRelease(true)" class="btn-purple" style="width: 100%;">Опубликовать Beta</button>
        </div>

      </div>
    </div>

  </div>

  <script src="/app.js"></script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(DASHBOARD_HTML);
});

app.get('/app.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'app.js'));
});

// APIs
app.post('/api/auth/register', (req, res) => {
  const { email, nickname, password, hwid } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ success: false, error: 'Заполните никнейм и пароль' });
  }

  const cleanNick = nickname.trim();
  const cleanEmail = (email || `${cleanNick.toLowerCase()}@starly.client`).trim().toLowerCase();
  const cleanHwid = (hwid || '').trim().toLowerCase();

  if (cleanNick.length < 3 || cleanNick.length > 20) {
    return res.status(400).json({ success: false, error: 'Никнейм должен быть от 3 до 20 символов' });
  }

  if (password.length < 3) {
    return res.status(400).json({ success: false, error: 'Пароль должен содержать минимум 3 символа' });
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

app.post('/api/loader/set-version', (req, res) => {
  const { version, changelog, isBeta } = req.body;
  if (isBeta) {
    if (version) versionData.betaVersion = version;
    if (changelog) versionData.betaChangelog = changelog;
    versionData.betaUpdatedAt = new Date().toISOString();
  } else {
    if (version) versionData.version = version;
    if (changelog) versionData.changelog = changelog;
    versionData.updatedAt = new Date().toISOString();
  }
  saveVersion();
  res.json({ success: true, versionData });
});

app.post('/api/loader/upload', (req, res) => {
  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'Пустой файл' });
  }
  fs.writeFileSync(JAR_PATH, req.body);
  console.log(`[OTA] Uploaded new release jar (${req.body.length} bytes)`);
  res.json({ success: true, size: req.body.length });
});

app.post('/api/loader/upload-beta', (req, res) => {
  if (!req.body || req.body.length === 0) {
    return res.status(400).json({ error: 'Пустой файл' });
  }
  fs.writeFileSync(BETA_JAR_PATH, req.body);
  console.log(`[OTA] Uploaded new beta jar (${req.body.length} bytes)`);
  res.json({ success: true, size: req.body.length });
});

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
  console.log(`[StarlyServer] Running on port ${PORT}`);
});
