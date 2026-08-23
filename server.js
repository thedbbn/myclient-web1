const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD_SALT = 'STARLY_AUTH_SALT_v1_2026';

// Permissive CORS and Security Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-version, x-changelog, x-channel, x-hwid');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Parsers
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

// 1. Cosmetics
let cosmeticsData = {};
if (fs.existsSync(DATA_FILE)) {
  try { cosmeticsData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { cosmeticsData = {}; }
}
function saveCosmeticsData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(cosmeticsData, null, 2), 'utf8'); } catch (e) {}
}

// 2. Accounts
let accounts = {};
if (fs.existsSync(ACCOUNTS_FILE)) {
  try { accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); } catch (e) { accounts = {}; }
}

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + PASSWORD_SALT).digest('hex');
}

// Default Admin Account
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

// 3. Markers
let markers = [];
if (fs.existsSync(MARKERS_FILE)) {
  try { markers = JSON.parse(fs.readFileSync(MARKERS_FILE, 'utf8')); } catch (e) { markers = []; }
}
function saveMarkers() {
  try { fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2), 'utf8'); } catch (e) {}
}

// 4. OTA
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

// ==================== ALL-IN-ONE SINGLE PAGE DASHBOARD ====================
const DASHBOARD_HTML = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Starly Client — Панель управления</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: #0b0f17; color: #e6edf3; min-height: 100vh; padding: 30px 20px; }
    .container { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
    
    /* Header */
    .main-header { display: flex; justify-content: space-between; align-items: center; background: #131a26; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 20px 28px; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
    .brand-group { display: flex; align-items: center; gap: 12px; }
    .star-logo { font-size: 28px; color: #5c7cfa; }
    .brand-title { font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 800; color: #fff; }
    .brand-sub { color: #5c7cfa; font-size: 14px; font-weight: 600; }
    
    /* Cards */
    .card { background: #131a26; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px; }
    .card-header h2 { font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; }
    
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .col { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 12px; font-weight: 600; color: #8b949e; }
    
    input, textarea, select { width: 100%; background: #0b0f17; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s ease; }
    input:focus, textarea:focus, select:focus { border-color: #5c7cfa; }
    textarea { min-height: 80px; resize: vertical; }
    
    button { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 6px; user-select: none; }
    button:hover { filter: brightness(1.15); transform: translateY(-1px); }
    button:active { transform: translateY(0); }
    
    .btn-primary { background: #238636 !important; color: #fff !important; }
    .btn-blue { background: #5c7cfa !important; color: #fff !important; }
    .btn-purple { background: #845ef7 !important; color: #fff !important; }
    .btn-danger { background: #da3633 !important; color: #fff !important; }
    .btn-sm { padding: 6px 11px; font-size: 11.5px; border-radius: 6px; margin-right: 4px; margin-bottom: 4px; }
    
    /* Table */
    .table-responsive { overflow-x: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th { text-align: left; padding: 12px 14px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.08); color: #8b949e; font-size: 12px; }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
    .data-table tr:hover { background: rgba(255,255,255,0.02); }
    
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .badge-owner { background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
    .badge-beta { background: rgba(163, 113, 247, 0.2); color: #a371f7; border: 1px solid rgba(163, 113, 247, 0.4); }
    .badge-user { background: rgba(88, 166, 255, 0.2); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.4); }
    .badge-banned { background: rgba(248, 81, 73, 0.2); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
    .badge-active { background: rgba(46, 160, 67, 0.2); color: #3fb950; border: 1px solid rgba(46, 160, 67, 0.4); }
    
    .actions-group { display: flex; gap: 4px; flex-wrap: wrap; }
    .mono { font-family: monospace; font-size: 11.5px; color: #8b949e; }
    .code-box { background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); padding: 14px; border-radius: 8px; font-family: monospace; font-size: 12px; overflow-x: auto; max-height: 300px; white-space: pre-wrap; color: #7ee787; }
    
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat-card { background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 6px; }
    .stat-title { font-size: 12px; color: #8b949e; }
    .stat-value { font-size: 18px; font-weight: 800; color: #fff; }
    .sub-note { font-size: 12px; color: #8b949e; margin-bottom: 12px; }

    /* Toast Notification */
    #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .toast { padding: 14px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5); animation: slideIn 0.25s ease; max-width: 380px; pointer-events: auto; }
    .toast-success { background: #238636; border: 1px solid #2ea043; }
    .toast-error { background: #da3633; border: 1px solid #f85149; }
    .toast-info { background: #1f6feb; border: 1px solid #388bfd; }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  </style>
</head>
<body>
  <div id="toast-container"></div>

  <div class="container">
    
    <!-- Top Header -->
    <header class="main-header">
      <div class="brand-group">
        <span class="star-logo">✦</span>
        <div>
          <h1 class="brand-title">Starly Client</h1>
          <span class="brand-sub">Панель управления</span>
        </div>
      </div>
      <button id="btn-top-refresh" onclick="window.refreshAll()" class="btn-blue">🔄 Обновить данные</button>
    </header>

    <!-- SECTION 1: SYSTEM STATUS -->
    <div class="card">
      <div class="card-header">
        <h2>⚡ Статус сервера и защита</h2>
      </div>
      <div class="status-grid">
        <div class="stat-card">
          <span class="stat-title">Сервер API</span>
          <span class="stat-value" style="color: #3fb950;">ONLINE</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Текущая версия релиза</span>
          <span class="stat-value" id="stat-version">1.21.11</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Бета версия (Early Access)</span>
          <span class="stat-value" style="color: #a371f7;" id="stat-beta-version">1.21.11-beta</span>
        </div>
        <div class="stat-card">
          <span class="stat-title">Защита от обхода банов</span>
          <span class="stat-value" style="color: #58a6ff;">HWID Lock Active</span>
        </div>
      </div>
    </div>

    <!-- SECTION 2: USERS LIST & MANAGEMENT -->
    <div class="card">
      <div class="card-header">
        <h2>👥 Зарегистрированные аккаунты (<span id="user-count-badge">1</span>)</h2>
        <button id="btn-refresh-users" onclick="window.loadUsers()" class="btn-blue btn-sm">🔄 Обновить список</button>
      </div>
      <p class="sub-note">Все зарегистрированные игроки. Вы можете выдавать Beta-доступ, Owner или банить по HWID.</p>
      
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Email</th>
              <th>Роль</th>
              <th>HWID устройства</th>
              <th>Статус</th>
              <th>Управление (Beta / Owner / Бан)</th>
            </tr>
          </thead>
          <tbody id="users-table-body">
            <tr>
              <td><strong>Admin</strong></td>
              <td>admin@starly.client</td>
              <td><span class="badge badge-owner">owner</span></td>
              <td class="mono">—</td>
              <td><span class="badge badge-active">АКТИВЕН</span></td>
              <td>
                <div class="actions-group">
                  <button class="btn-purple btn-sm" onclick="window.setRole('Admin', 'beta')">✨ Выдать Beta</button>
                  <button class="btn-danger btn-sm" onclick="window.quickBan('Admin')">🚫 Бан</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- SECTION 3: CREATE USER & BAN USER -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      
      <!-- Create Account -->
      <div class="card">
        <div class="card-header">
          <h2>➕ Создать / Зарегистрировать аккаунт</h2>
        </div>
        <div class="row">
          <div class="col">
            <label>Игровой никнейм</label>
            <input id="create-nick" value="Player1" placeholder="Введите ник">
          </div>
          <div class="col">
            <label>Email почта (необязательно)</label>
            <input id="create-email" value="player1@starly.client" type="email" placeholder="user@gmail.com">
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Пароль</label>
            <input id="create-pwd" value="123456" type="text" placeholder="Введите пароль">
          </div>
          <div class="col">
            <label>Роль</label>
            <select id="create-role">
              <option value="owner">👑 Владелец (Owner)</option>
              <option value="beta">✨ Beta тестер</option>
              <option value="user" selected>👤 Игрок (User)</option>
            </select>
          </div>
        </div>
        <button id="btn-create-acc" onclick="window.createAccountDirectly()" class="btn-primary" style="width: 100%; margin-top: 4px;">➕ Создать аккаунт</button>
      </div>

      <!-- Ban User -->
      <div class="card">
        <div class="card-header">
          <h2>🚫 Бан игрока и его устройства (HWID)</h2>
        </div>
        <div class="row">
          <div class="col">
            <label>Никнейм или Email</label>
            <input id="ban-input-nick" placeholder="Никнейм игрока для бана">
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Причина блокировки</label>
            <input id="ban-input-reason" value="Нарушение правил" placeholder="Причина бана">
          </div>
        </div>
        <button id="btn-ban-action" onclick="window.submitBan()" class="btn-danger" style="width: 100%; margin-top: 4px;">🚫 Забанить (Аккаунт + HWID)</button>
      </div>

    </div>

    <!-- SECTION 4: OTA RELEASES (RELEASE & BETA) -->
    <div class="card">
      <div class="card-header">
        <h2>🚀 Публикация обновлений клиента (OTA)</h2>
        <button id="btn-refresh-ota" onclick="window.loadVersionData()" class="btn-blue btn-sm">🔄 Обновить версии</button>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
        
        <!-- Release Channel -->
        <div style="background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px;">
          <h3 style="color: #3fb950; margin-bottom: 12px;">📦 Релизная версия (Для всех)</h3>
          <div class="row">
            <div class="col">
              <label>Версия релиза</label>
              <input id="ota-release-version" value="1.21.11-v1.0.1" placeholder="1.21.11-v1.0.1">
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Список изменений (Changelog)</label>
              <textarea id="ota-release-changelog" placeholder="Описание обновления для игроков...">Релиз Starly Client 1.21.11: обновленный кастомный хотбар, статус-бары, Modrinth каталог модов.</textarea>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Файл мода (Starly-Client-1.21.11.jar)</label>
              <input type="file" id="ota-release-file" accept=".jar">
            </div>
          </div>
          <button id="btn-pub-release" onclick="window.publishRelease(false)" class="btn-primary" style="width: 100%; margin-top: 8px;">🚀 Опубликовать Релиз</button>
        </div>

        <!-- Beta Channel -->
        <div style="background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px;">
          <h3 style="color: #a371f7; margin-bottom: 12px;">🧪 Бета-версия (Для Beta-юзеров)</h3>
          <div class="row">
            <div class="col">
              <label>Beta Версия</label>
              <input id="ota-beta-version" value="1.21.11-v1.0.1-beta" placeholder="1.21.11-v1.0.1-beta">
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Beta Changelog</label>
              <textarea id="ota-beta-changelog" placeholder="Экспериментальные фичи...">Бета-версия с экспериментальными функциями и ранними обновлениями.</textarea>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Файл бета-мода (Starly-Client-1.21.11-beta.jar)</label>
              <input type="file" id="ota-beta-file" accept=".jar">
            </div>
          </div>
          <button id="btn-pub-beta" onclick="window.publishRelease(true)" class="btn-purple" style="width: 100%; margin-top: 8px;">⚡ Опубликовать Beta</button>
        </div>

      </div>
    </div>

    <!-- SECTION 5: COSMETICS & MARKERS -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
      
      <!-- Cosmetics -->
      <div class="card">
        <div class="card-header">
          <h2>✨ Активная косметика и аватары</h2>
          <button id="btn-refresh-cosmetics" onclick="window.loadCosmetics()" class="btn-blue btn-sm">🔄 Обновить</button>
        </div>
        <pre id="cosmetics-json" class="code-box">Загрузка данных косметики...</pre>
      </div>

      <!-- Markers -->
      <div class="card">
        <div class="card-header">
          <h2>📍 Метки игроков на серверах</h2>
          <button id="btn-refresh-markers" onclick="window.loadMarkers()" class="btn-blue btn-sm">🔄 Обновить</button>
        </div>
        <pre id="markers-json" class="code-box">Загрузка меток...</pre>
      </div>

    </div>

  </div>

  <script>
    // Global Toast
    window.showToast = function(msg, type) {
      type = type || 'info';
      var container = document.getElementById('toast-container');
      if (!container) return;
      var t = document.createElement('div');
      t.className = 'toast toast-' + type;
      t.textContent = msg;
      container.appendChild(t);
      setTimeout(function() {
        t.style.opacity = '0';
        setTimeout(function() { t.remove(); }, 300);
      }, 3500);
    };

    window.refreshAll = function() {
      window.showToast('Обновление данных...', 'info');
      window.loadUsers();
      window.loadVersionData();
      window.loadCosmetics();
      window.loadMarkers();
    };

    window.createAccountDirectly = function() {
      var nickInput = document.getElementById('create-nick');
      var emailInput = document.getElementById('create-email');
      var pwdInput = document.getElementById('create-pwd');
      var roleInput = document.getElementById('create-role');
      var btn = document.getElementById('btn-create-acc');

      var nick = (nickInput ? nickInput.value : '').trim();
      var email = (emailInput ? emailInput.value : '').trim();
      var pwd = (pwdInput ? pwdInput.value : '').trim();
      var role = roleInput ? roleInput.value : 'user';

      if (!nick) {
        window.showToast('Введите никнейм!', 'error');
        alert('Введите никнейм!');
        return;
      }
      if (!pwd) {
        window.showToast('Введите пароль!', 'error');
        alert('Введите пароль!');
        return;
      }
      if (!email || email.indexOf('@') === -1) {
        email = nick.toLowerCase().replace(/[^a-z0-9]/g, '') + '@starly.client';
      }

      if (btn) btn.textContent = '⏳ Создание...';

      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, email: email, password: pwd })
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        if (btn) btn.textContent = '➕ Создать аккаунт';
        if (res.success) {
          if (role !== 'user') {
            fetch('/api/user/set-role', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nickname: nick, role: role })
            }).then(function() { window.loadUsers(); });
          }
          window.showToast('Аккаунт ' + nick + ' успешно создан!', 'success');
          alert('Аккаунт ' + nick + ' успешно создан!');
          window.loadUsers();
        } else {
          window.showToast('Ошибка: ' + (res.error || 'Не удалось создать'), 'error');
          alert('Ошибка: ' + (res.error || 'Не удалось создать'));
        }
      })
      .catch(function(err) {
        if (btn) btn.textContent = '➕ Создать аккаунт';
        window.showToast('Сетевая ошибка: ' + err.message, 'error');
        alert('Сетевая ошибка: ' + err.message);
      });
    };

    window.loadUsers = function() {
      var tbody = document.getElementById('users-table-body');
      var badge = document.getElementById('user-count-badge');
      if (!tbody) return;

      fetch('/api/users')
        .then(function(res) { return res.json(); })
        .then(function(users) {
          if (!users || !Array.isArray(users)) return;
          if (badge) badge.textContent = users.length;
          if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #8b949e; padding: 24px;">Аккаунтов пока нет. Нажмите «Создать аккаунт» выше!</td></tr>';
            return;
          }

          var html = '';
          for (var i = 0; i < users.length; i++) {
            var u = users[i];
            var nick = u.nickname || 'Unknown';
            var email = u.email || '—';
            var role = u.role || 'user';
            var hwidShort = u.hwid ? window.escapeHtml(u.hwid.substring(0, 16)) + '...' : '—';
            var badgeClass = 'badge-' + role;
            var statusBadge = u.banned 
              ? '<span class="badge badge-banned">ЗАБАНЕН (' + window.escapeHtml(u.banReason || 'Бан') + ')</span>' 
              : '<span class="badge badge-active">АКТИВЕН</span>';

            var roleButtons = '<div class="actions-group">';
            if (role !== 'beta') {
              roleButtons += '<button class="btn-purple btn-sm" onclick="window.setRole(\'' + window.escapeHtml(nick) + '\', \'beta\')">✨ Выдать Beta</button>';
            } else {
              roleButtons += '<button class="btn-blue btn-sm" onclick="window.setRole(\'' + window.escapeHtml(nick) + '\', \'user\')">Снять Beta</button>';
            }
            if (role !== 'owner') {
              roleButtons += '<button class="btn-primary btn-sm" onclick="window.setRole(\'' + window.escapeHtml(nick) + '\', \'owner\')">👑 Owner</button>';
            }
            if (u.banned) {
              roleButtons += '<button class="btn-primary btn-sm" onclick="window.unban(\'' + window.escapeHtml(nick) + '\')">✅ Разбанить</button>';
            } else {
              roleButtons += '<button class="btn-danger btn-sm" onclick="window.quickBan(\'' + window.escapeHtml(nick) + '\')">🚫 Бан</button>';
            }
            roleButtons += '</div>';

            html += '<tr>' +
              '<td><strong>' + window.escapeHtml(nick) + '</strong></td>' +
              '<td>' + window.escapeHtml(email) + '</td>' +
              '<td><span class="badge ' + badgeClass + '">' + window.escapeHtml(role) + '</span></td>' +
              '<td class="mono">' + hwidShort + '</td>' +
              '<td>' + statusBadge + '</td>' +
              '<td>' + roleButtons + '</td>' +
              '</tr>';
          }
          tbody.innerHTML = html;
        })
        .catch(function(err) {
          console.error('loadUsers error:', err);
        });
    };

    window.setRole = function(nick, role) {
      fetch('/api/user/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, role: role })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.success) {
          window.showToast('Роль игрока ' + nick + ' изменена на ' + role, 'success');
          alert('Роль игрока ' + nick + ' изменена на ' + role);
          window.loadUsers();
        } else {
          window.showToast('Ошибка: ' + (data.error || 'Не удалось сменить роль'), 'error');
          alert('Ошибка: ' + (data.error || 'Не удалось сменить роль'));
        }
      });
    };

    window.unban = function(nick) {
      fetch('/api/user/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick })
      }).then(function() {
        window.showToast('Игрок ' + nick + ' разбанен!', 'success');
        alert('Игрок ' + nick + ' разбанен!');
        window.loadUsers();
      });
    };

    window.quickBan = function(nick) {
      var reason = prompt('Причина бана для игрока ' + nick + ':', 'Нарушение правил');
      if (reason) {
        fetch('/api/user/ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: nick, reason: reason })
        }).then(function() {
          window.showToast('Игрок ' + nick + ' забанен по HWID', 'error');
          alert('Игрок ' + nick + ' забанен по HWID');
          window.loadUsers();
        });
      }
    };

    window.submitBan = function() {
      var nickInput = document.getElementById('ban-input-nick');
      var reasonInput = document.getElementById('ban-input-reason');
      var nick = nickInput ? nickInput.value.trim() : '';
      var reason = (reasonInput ? reasonInput.value.trim() : '') || 'Заблокирован администратором';
      var btn = document.getElementById('btn-ban-action');

      if (!nick) {
        window.showToast('Введите никнейм игрока для бана!', 'error');
        alert('Введите никнейм игрока для бана!');
        return;
      }

      if (btn) btn.textContent = '⏳ Блокировка...';

      fetch('/api/user/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, reason: reason })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (btn) btn.textContent = '🚫 Забанить (Аккаунт + HWID)';
        if (data.success) {
          window.showToast(data.message, 'success');
          alert(data.message);
          if (nickInput) nickInput.value = '';
          window.loadUsers();
        } else {
          window.showToast('Ошибка: ' + (data.error || 'Не удалось забанить'), 'error');
          alert('Ошибка: ' + (data.error || 'Не удалось забанить'));
        }
      })
      .catch(function(e) {
        if (btn) btn.textContent = '🚫 Забанить (Аккаунт + HWID)';
        window.showToast('Ошибка: ' + e.message, 'error');
        alert('Ошибка: ' + e.message);
      });
    };

    window.loadVersionData = function() {
      fetch('/api/loader/version')
        .then(function(res) { return res.json(); })
        .then(function(v) {
          var rVer = document.getElementById('ota-release-version');
          var rLog = document.getElementById('ota-release-changelog');
          var bVer = document.getElementById('ota-beta-version');
          var bLog = document.getElementById('ota-beta-changelog');
          var statV = document.getElementById('stat-version');
          var statBV = document.getElementById('stat-beta-version');

          if (rVer && v.version) rVer.value = v.version;
          if (rLog && v.changelog) rLog.value = v.changelog;
          if (bVer && v.betaVersion) bVer.value = v.betaVersion;
          if (bLog && v.betaChangelog) bLog.value = v.betaChangelog;
          if (statV) statV.textContent = v.version || '1.21.11';
          if (statBV) statBV.textContent = v.betaVersion || '1.21.11-beta';
        });
    };

    window.publishRelease = function(isBeta) {
      var verInput = document.getElementById(isBeta ? 'ota-beta-version' : 'ota-release-version');
      var logInput = document.getElementById(isBeta ? 'ota-beta-changelog' : 'ota-release-changelog');
      var fileInput = document.getElementById(isBeta ? 'ota-beta-file' : 'ota-release-file');
      var btn = document.getElementById(isBeta ? 'btn-pub-beta' : 'btn-pub-release');

      var version = verInput ? verInput.value.trim() : '';
      var changelog = logInput ? logInput.value.trim() : '';

      if (!version) {
        window.showToast('Укажите версию обновления!', 'error');
        alert('Укажите версию обновления!');
        return;
      }

      if (btn) btn.textContent = '⏳ Публикация...';

      fetch('/api/loader/set-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: version, changelog: changelog, isBeta: isBeta })
      })
      .then(function() {
        if (fileInput && fileInput.files.length > 0) {
          var file = fileInput.files[0];
          var reader = new FileReader();
          reader.onload = function() {
            var buffer = reader.result;
            var uploadEndpoint = isBeta ? '/api/loader/upload-beta' : '/api/loader/upload';
            fetch(uploadEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: buffer
            }).then(function() {
              if (btn) btn.textContent = isBeta ? '⚡ Опубликовать Beta' : '🚀 Опубликовать Релиз';
              window.showToast((isBeta ? 'Beta' : 'Релизное') + ' обновление с JAR файлом успешно опубликовано!', 'success');
              alert((isBeta ? 'Beta' : 'Релизное') + ' обновление с JAR файлом успешно опубликовано!');
              window.loadVersionData();
            });
          };
          reader.readAsArrayBuffer(file);
        } else {
          if (btn) btn.textContent = isBeta ? '⚡ Опубликовать Beta' : '🚀 Опубликовать Релиз';
          window.showToast((isBeta ? 'Beta' : 'Релизное') + ' обновление опубликовано (версия обновлена)!', 'success');
          alert((isBeta ? 'Beta' : 'Релизное') + ' обновление опубликовано (версия обновлена)!');
          window.loadVersionData();
        }
      })
      .catch(function(err) {
        if (btn) btn.textContent = isBeta ? '⚡ Опубликовать Beta' : '🚀 Опубликовать Релиз';
        window.showToast('Ошибка публикации: ' + err.message, 'error');
        alert('Ошибка публикации: ' + err.message);
      });
    };

    window.loadCosmetics = function() {
      var box = document.getElementById('cosmetics-json');
      if (!box) return;
      fetch('/api/cosmetics/all')
        .then(function(res) { return res.json(); })
        .then(function(data) { box.textContent = JSON.stringify(data, null, 2); })
        .catch(function(e) { box.textContent = 'Ошибка загрузки: ' + e.message; });
    };

    window.loadMarkers = function() {
      var box = document.getElementById('markers-json');
      if (!box) return;
      fetch('/api/markers')
        .then(function(res) { return res.json(); })
        .then(function(data) { box.textContent = JSON.stringify(data, null, 2); })
        .catch(function(e) { box.textContent = 'Ошибка загрузки: ' + e.message; });
    };

    window.escapeHtml = function(str) {
      return (str || '').replace(/[&<>"']/g, function(m) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
      });
    };

    // Immediate Initialization on load
    window.loadUsers();
    window.loadVersionData();
    setInterval(window.loadUsers, 2500);
  </script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(DASHBOARD_HTML);
});

// ==================== AUTH & REGISTRATION API ====================

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

// ==================== OTA RELEASES & VERSION CONTROL ====================

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

// ==================== COSMETICS & MARKERS API ====================

app.get('/api/cosmetics/all', (req, res) => {
  res.json(cosmeticsData);
});

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

app.listen(PORT, () => {
  console.log(`[StarlyServer] Running on port ${PORT} with Global Window Click Bindings`);
});
