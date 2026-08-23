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

// ==================== DASHBOARD UI ====================
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
    body { font-family: 'Inter', sans-serif; background: #0b0f17; color: #e6edf3; min-height: 100vh; }
    .app { display: flex; min-height: 100vh; }
    
    /* Sidebar */
    .sidebar { width: 270px; background: #131a26; border-right: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; padding: 24px 16px; }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; padding-left: 6px; }
    .star-icon { font-size: 24px; color: #5c7cfa; filter: drop-shadow(0 0 10px rgba(92,124,250,0.5)); }
    .brand h1 { font-family: 'Outfit', sans-serif; font-size: 20px; color: #fff; font-weight: 800; }
    .brand .sub { color: #5c7cfa; font-size: 13px; font-weight: 600; }
    
    .nav-menu { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .nav-tab-btn { background: transparent; border: none; color: #8b949e; padding: 11px 14px; text-align: left; border-radius: 8px; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all 0.18s ease; display: flex; align-items: center; gap: 8px; }
    .nav-tab-btn:hover { background: rgba(255, 255, 255, 0.05); color: #c9d1d9; }
    .nav-tab-btn.active { background: rgba(92, 124, 250, 0.18) !important; color: #748ffc !important; border: 1px solid rgba(92, 124, 250, 0.35) !important; }
    .sidebar-footer { font-size: 11px; color: #5c6370; text-align: center; padding-top: 12px; }
    
    /* Content Area */
    .content { flex: 1; padding: 32px 40px; overflow-y: auto; }
    .page-section { display: none !important; }
    .page-section.active { display: block !important; }
    
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .page-header h2 { font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 700; color: #fff; }
    
    .card { background: #131a26; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 22px; margin-bottom: 22px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .card h3 { font-size: 15px; margin-bottom: 14px; color: #e6edf3; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .col { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 6px; }
    label { font-size: 12px; font-weight: 600; color: #8b949e; }
    
    input, textarea, select { width: 100%; background: #0b0f17; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 13px; font-family: inherit; outline: none; transition: border-color 0.15s ease; }
    input:focus, textarea:focus, select:focus { border-color: #5c7cfa; box-shadow: 0 0 0 2px rgba(92,124,250,0.2); }
    textarea { min-height: 80px; resize: vertical; }
    
    button { padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s ease; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    .btn-primary { background: #238636; color: #fff; }
    .btn-primary:hover { background: #2ea043; }
    .btn-blue { background: #5c7cfa; color: #fff; }
    .btn-blue:hover { background: #748ffc; }
    .btn-purple { background: #845ef7; color: #fff; }
    .btn-purple:hover { background: #9775fa; }
    .btn-danger { background: #da3633; color: #fff; }
    .btn-danger:hover { background: #f85149; }
    .btn-sm { padding: 5px 10px; font-size: 11.5px; border-radius: 6px; }
    
    .table-responsive { overflow-x: auto; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); }
    .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .data-table th { text-align: left; padding: 12px 14px; background: rgba(0,0,0,0.25); border-bottom: 1px solid rgba(255,255,255,0.08); color: #8b949e; font-size: 12px; }
    .data-table td { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
    .data-table tr:hover { background: rgba(255,255,255,0.02); }
    
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; display: inline-block; }
    .badge-owner { background: rgba(210, 153, 34, 0.2); color: #d29922; border: 1px solid rgba(210, 153, 34, 0.4); }
    .badge-beta { background: rgba(163, 113, 247, 0.2); color: #a371f7; border: 1px solid rgba(163, 113, 247, 0.4); }
    .badge-user { background: rgba(88, 166, 255, 0.2); color: #58a6ff; border: 1px solid rgba(88, 166, 255, 0.4); }
    .badge-banned { background: rgba(248, 81, 73, 0.2); color: #f85149; border: 1px solid rgba(248, 81, 73, 0.4); }
    .badge-active { background: rgba(46, 160, 67, 0.2); color: #3fb950; border: 1px solid rgba(46, 160, 67, 0.4); }
    
    .actions-group { display: flex; gap: 6px; flex-wrap: wrap; }
    .mono { font-family: monospace; font-size: 11.5px; color: #8b949e; }
    .code-box { background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); padding: 14px; border-radius: 8px; font-family: monospace; font-size: 12px; overflow-x: auto; max-height: 400px; white-space: pre-wrap; color: #7ee787; }
    
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .stat-card { background: #0b0f17; border: 1px solid rgba(255,255,255,0.08); padding: 18px; border-radius: 10px; display: flex; flex-direction: column; gap: 6px; }
    .stat-title { font-size: 12px; color: #8b949e; }
    .stat-value { font-size: 19px; font-weight: 800; color: #fff; }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <span class="star-icon">✦</span>
        <div>
          <h1>Starly Client</h1>
          <span class="sub">Панель управления</span>
        </div>
      </div>
      <nav class="nav-menu">
        <button id="nav-btn-users" class="nav-tab-btn active" onclick="switchPage('users')">👥 Пользователи и Бан-лист</button>
        <button id="nav-btn-ota" class="nav-tab-btn" onclick="switchPage('ota')">🚀 Выпуск обновлений (OTA)</button>
        <button id="nav-btn-cosmetics" class="nav-tab-btn" onclick="switchPage('cosmetics')">✨ Косметика и Аватары</button>
        <button id="nav-btn-markers" class="nav-tab-btn" onclick="switchPage('markers')">📍 Метки игроков</button>
        <button id="nav-btn-status" class="nav-tab-btn" onclick="switchPage('status')">⚡ Статус сервера</button>
      </nav>
      <div class="sidebar-footer">
        <span>Starly Client 1.21.11 Fabric</span>
      </div>
    </aside>

    <main class="content">
      <!-- TAB 1: USERS & BANS -->
      <section id="page-users" class="page-section active">
        <div class="page-header">
          <h2>👥 Управление пользователями, ролями и банами по HWID</h2>
          <button onclick="loadUsers()" class="btn-blue">🔄 Обновить список</button>
        </div>

        <div class="card">
          <h3>🚫 Быстрый бан пользователя и его устройства</h3>
          <div class="row">
            <div class="col">
              <label>Никнейм или Email</label>
              <input id="ban-input-nick" placeholder="Например: Player123 или user@gmail.com">
            </div>
            <div class="col">
              <label>Причина блокировки</label>
              <input id="ban-input-reason" placeholder="Например: Чит, декомпиляция, мультиаккаунт">
            </div>
            <div style="align-self: flex-end;">
              <button onclick="handleBanSubmit()" class="btn-danger">Забанить (Аккаунт + HWID)</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>📋 Зарегистрированные аккаунты (<span id="user-count-badge">0</span>)</h3>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>HWID устройства</th>
                  <th>Статус</th>
                  <th>Управление ролями и доступом</th>
                </tr>
              </thead>
              <tbody id="users-table-body">
                <tr><td colspan="6" style="text-align: center; color: #8b949e; padding: 24px;">Загрузка аккаунтов...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- TAB 2: OTA RELEASES -->
      <section id="page-ota" class="page-section">
        <div class="page-header">
          <h2>🚀 Публикация и управление обновлениями мода (OTA)</h2>
          <button onclick="loadVersionData()" class="btn-blue">🔄 Обновить</button>
        </div>

        <div class="card">
          <h3>📦 Релизный канал (Основная версия для всех)</h3>
          <div class="row">
            <div class="col">
              <label>Версия релиза</label>
              <input id="ota-release-version" placeholder="1.21.11-v1.0.1">
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Список изменений (Changelog для всех игроков)</label>
              <textarea id="ota-release-changelog" placeholder="Опишите новые функции, фиксы и изменения..."></textarea>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Загрузить файл мода (Starly-Client-1.21.11.jar)</label>
              <input type="file" id="ota-release-file" accept=".jar">
            </div>
          </div>
          <div style="margin-top: 10px;">
            <button onclick="publishReleaseUpdate(false)" class="btn-primary">🚀 Опубликовать релизное обновление</button>
          </div>
        </div>

        <div class="card">
          <h3>🧪 Бета-канал (Для пользователей с ролью Beta / Early Access)</h3>
          <div class="row">
            <div class="col">
              <label>Версия Beta</label>
              <input id="ota-beta-version" placeholder="1.21.11-v1.0.1-beta">
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Beta Changelog</label>
              <textarea id="ota-beta-changelog" placeholder="Экспериментальные функции и закрытые тесты..."></textarea>
            </div>
          </div>
          <div class="row">
            <div class="col">
              <label>Загрузить файл бета-мода (Starly-Client-1.21.11-beta.jar)</label>
              <input type="file" id="ota-beta-file" accept=".jar">
            </div>
          </div>
          <div style="margin-top: 10px;">
            <button onclick="publishReleaseUpdate(true)" class="btn-purple">⚡ Опубликовать Beta-обновление</button>
          </div>
        </div>
      </section>

      <!-- TAB 3: COSMETICS -->
      <section id="page-cosmetics" class="page-section">
        <div class="page-header">
          <h2>✨ Синхронизация 3D-косметики и Figura-аватаров</h2>
          <button onclick="loadCosmetics()" class="btn-blue">🔄 Обновить</button>
        </div>
        <div class="card">
          <p style="margin-bottom: 12px; font-size: 13px; color: #8b949e;">Здесь отображаются активные косметические наборы, отправленные игроками клиента.</p>
          <pre id="cosmetics-json" class="code-box">Загрузка...</pre>
        </div>
      </section>

      <!-- TAB 4: MARKERS -->
      <section id="page-markers" class="page-section">
        <div class="page-header">
          <h2>📍 Метки игроков на серверах (Friend Markers)</h2>
          <button onclick="loadMarkers()" class="btn-blue">🔄 Обновить</button>
        </div>
        <div class="card">
          <p style="margin-bottom: 12px; font-size: 13px; color: #8b949e;">Координаты меток, сохранённых игроками.</p>
          <pre id="markers-json" class="code-box">Загрузка...</pre>
        </div>
      </section>

      <!-- TAB 5: STATUS -->
      <section id="page-status" class="page-section">
        <div class="page-header">
          <h2>⚡ Статус и системная статистика</h2>
        </div>
        <div class="card">
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
              <span class="stat-title">Бета версия</span>
              <span class="stat-value" style="color: #a371f7;" id="stat-beta-version">1.21.11-beta</span>
            </div>
            <div class="stat-card">
              <span class="stat-title">Защита от обхода банов</span>
              <span class="stat-value" style="color: #58a6ff;">HWID Blacklist Active</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    function switchPage(pageId) {
      document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));

      const activeBtn = document.getElementById('nav-btn-' + pageId);
      const activeSection = document.getElementById('page-' + pageId);

      if (activeBtn) activeBtn.classList.add('active');
      if (activeSection) activeSection.classList.add('active');

      if (pageId === 'users') loadUsers();
      if (pageId === 'ota') loadVersionData();
      if (pageId === 'cosmetics') loadCosmetics();
      if (pageId === 'markers') loadMarkers();
    }

    async function loadUsers() {
      const tbody = document.getElementById('users-table-body');
      const badge = document.getElementById('user-count-badge');
      if (!tbody) return;
      try {
        const res = await fetch('/api/users');
        const users = await res.json();
        if (badge) badge.textContent = users.length || 0;
        renderUsersTable(users);
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #ff8787; padding: 24px;">Ошибка загрузки: ' + e.message + '</td></tr>';
      }
    }

    function renderUsersTable(users) {
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #8b949e; padding: 24px;">Зарегистрированных пользователей пока нет.</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(u => {
        const hwidShort = u.hwid ? escapeHtml(u.hwid.substring(0, 16)) + '...' : '—';
        const badgeClass = 'badge-' + (u.role || 'user');
        const statusBadge = u.banned 
          ? '<span class="badge badge-banned">ЗАБАНЕН (' + escapeHtml(u.banReason || 'Бан') + ')</span>' 
          : '<span class="badge badge-active">АКТИВЕН</span>';

        const roleButtons = 
          '<div class="actions-group">' +
            (u.role !== 'beta' ? '<button class="btn-purple btn-sm" onclick="setUserRole(\'' + escapeHtml(u.nickname) + '\', \'beta\')">✨ Выдать Beta</button>' : '<button class="btn-blue btn-sm" onclick="setUserRole(\'' + escapeHtml(u.nickname) + '\', \'user\')">Снять Beta</button>') +
            (u.role !== 'owner' ? '<button class="btn-primary btn-sm" onclick="setUserRole(\'' + escapeHtml(u.nickname) + '\', \'owner\')">👑 Owner</button>' : '') +
            (u.banned 
              ? '<button class="btn-primary btn-sm" onclick="unbanUser(\'' + escapeHtml(u.nickname) + '\')">✅ Разбанить</button>' 
              : '<button class="btn-danger btn-sm" onclick="quickBanUser(\'' + escapeHtml(u.nickname) + '\')">🚫 Бан</button>') +
          '</div>';

        return '<tr>' +
          '<td><strong>' + escapeHtml(u.nickname) + '</strong></td>' +
          '<td>' + escapeHtml(u.email) + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + escapeHtml(u.role) + '</span></td>' +
          '<td class="mono">' + hwidShort + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' + roleButtons + '</td>' +
          '</tr>';
      }).join('');
    }

    async function setUserRole(nick, role) {
      const res = await fetch('/api/user/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, role: role })
      });
      const data = await res.json();
      if (data.success) {
        loadUsers();
      } else {
        alert('Ошибка изменения роли: ' + (data.error || 'Неизвестная ошибка'));
      }
    }

    async function unbanUser(nick) {
      await fetch('/api/user/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick })
      });
      loadUsers();
    }

    async function quickBanUser(nick) {
      const reason = prompt('Причина бана для игрока ' + nick + ':', 'Нарушение правил / Чит');
      if (reason) {
        await fetch('/api/user/ban', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: nick, reason: reason })
        });
        loadUsers();
      }
    }

    async function handleBanSubmit() {
      const nickInput = document.getElementById('ban-input-nick');
      const reasonInput = document.getElementById('ban-input-reason');
      const nick = nickInput ? nickInput.value.trim() : '';
      const reason = (reasonInput ? reasonInput.value.trim() : '') || 'Заблокирован администратором';

      if (!nick) return alert('Введите никнейм или почту');

      const res = await fetch('/api/user/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick, reason: reason })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        if (nickInput) nickInput.value = '';
        if (reasonInput) reasonInput.value = '';
        loadUsers();
      } else {
        alert('Ошибка: ' + (data.error || 'Не удалось забанить'));
      }
    }

    async function loadVersionData() {
      try {
        const res = await fetch('/api/loader/version');
        const v = await res.json();
        const rVer = document.getElementById('ota-release-version');
        const rLog = document.getElementById('ota-release-changelog');
        const bVer = document.getElementById('ota-beta-version');
        const bLog = document.getElementById('ota-beta-changelog');
        const statV = document.getElementById('stat-version');
        const statBV = document.getElementById('stat-beta-version');

        if (rVer) rVer.value = v.version || '';
        if (rLog) rLog.value = v.changelog || '';
        if (bVer) bVer.value = v.betaVersion || '';
        if (bLog) bLog.value = v.betaChangelog || '';
        if (statV) statV.textContent = v.version || '1.21.11';
        if (statBV) statBV.textContent = v.betaVersion || '1.21.11-beta';
      } catch (e) {}
    }

    async function publishReleaseUpdate(isBeta) {
      const verInput = document.getElementById(isBeta ? 'ota-beta-version' : 'ota-release-version');
      const logInput = document.getElementById(isBeta ? 'ota-beta-changelog' : 'ota-release-changelog');
      const fileInput = document.getElementById(isBeta ? 'ota-beta-file' : 'ota-release-file');

      const version = verInput ? verInput.value.trim() : '';
      const changelog = logInput ? logInput.value.trim() : '';

      if (!version) return alert('Укажите версию');

      // 1. Update version & changelog
      await fetch('/api/loader/set-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, changelog, isBeta })
      });

      // 2. Upload JAR if selected
      if (fileInput && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const buffer = await file.arrayBuffer();
        const uploadEndpoint = isBeta ? '/api/loader/upload-beta' : '/api/loader/upload';
        
        await fetch(uploadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer
        });
        alert((isBeta ? 'Beta' : 'Релизное') + ' обновление с JAR файлом успешно опубликовано!');
      } else {
        alert((isBeta ? 'Beta' : 'Релизное') + ' обновление опубликовано (текст и версия обновлены)!');
      }

      loadVersionData();
    }

    async function loadCosmetics() {
      const box = document.getElementById('cosmetics-json');
      if (!box) return;
      try {
        const res = await fetch('/api/cosmetics/all');
        const data = await res.json();
        box.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        box.textContent = 'Ошибка загрузки: ' + e.message;
      }
    }

    async function loadMarkers() {
      const box = document.getElementById('markers-json');
      if (!box) return;
      try {
        const res = await fetch('/api/markers');
        const data = await res.json();
        box.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        box.textContent = 'Ошибка загрузки: ' + e.message;
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
      })[m]);
    }

    window.onload = function() {
      loadUsers();
    };
  </script>
</body>
</html>`;

// Serve Web Dashboard on GET /
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(DASHBOARD_HTML);
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
  console.log(`[StarlyServer] Running on port ${PORT} with Full Admin Panel & OTA Releases`);
});
