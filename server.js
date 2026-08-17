const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');
const STORAGE_DIR = path.join(__dirname, 'storage');
const VERSION_FILE = path.join(STORAGE_DIR, 'version.json');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// 1. Cosmetics Storage
let users = {};
if (fs.existsSync(DATA_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    users = {};
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving data.json:', e);
  }
}

// 2. OTA Version Data
let versionData = {
  version: '1.21.11-v1.0.0',
  changelog: 'Релиз Starly Client 1.21.11: обновленный хотбар, статус-бары, Modrinth каталог и оптимизация.',
  updatedAt: new Date().toISOString()
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_DIR),
  filename: (req, file, cb) => cb(null, 'Starly-Client-1.21.11.jar')
});
const upload = multer({ storage });

// ==================== COSMETICS API ====================
app.get('/api/cosmetics/:uuid', (req, res) => {
  const uuid = req.params.uuid;
  const user = users[uuid];
  if (user) {
    res.json({ success: true, cosmetics: user.cosmetics || [] });
  } else {
    res.json({ success: true, cosmetics: [] });
  }
});

app.post('/api/cosmetics', (req, res) => {
  const { uuid, cosmetics } = req.body;
  if (!uuid) return res.status(400).json({ error: 'UUID required' });
  users[uuid] = {
    cosmetics: cosmetics || [],
    updatedAt: new Date().toISOString()
  };
  saveData();
  res.json({ success: true });
});

// ==================== LOADER OTA API ====================
app.get('/api/loader/version', (req, res) => {
  res.json(versionData);
});

app.get('/api/loader/download', (req, res) => {
  const jarPath = path.join(STORAGE_DIR, 'Starly-Client-1.21.11.jar');
  if (fs.existsSync(jarPath)) {
    res.download(jarPath, 'Starly-Client-1.21.11.jar');
  } else {
    res.status(404).json({ error: 'Client jar not uploaded yet' });
  }
});

app.post('/api/loader/upload', upload.single('clientJar'), (req, res) => {
  const { version, changelog } = req.body;
  if (version) versionData.version = version;
  if (changelog) versionData.changelog = changelog;
  versionData.updatedAt = new Date().toISOString();

  saveVersion();
  console.log(`[OTA] Uploaded new version: ${versionData.version}`);
  res.redirect('/?success=1');
});

// ==================== ADMIN WEB PANEL ====================
app.get(['/', '/admin'], (req, res) => {
  const jarPath = path.join(STORAGE_DIR, 'Starly-Client-1.21.11.jar');
  const hasJar = fs.existsSync(jarPath);
  let jarSize = '0 KB';
  if (hasJar) {
    const st = fs.statSync(jarPath);
    jarSize = (st.size / (1024 * 1024)).toFixed(2) + ' MB';
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <title>Starly Cloud OTA Dashboard</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', sans-serif;
          background: radial-gradient(circle at 80% 20%, rgba(224, 86, 253, 0.12) 0%, transparent 40%),
                      radial-gradient(circle at 20% 80%, rgba(255, 71, 87, 0.12) 0%, transparent 45%),
                      #0c0e14;
          color: #f5f6fa;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          width: 100%;
          max-width: 580px;
          background: rgba(22, 25, 38, 0.75);
          backdrop-filter: blur(25px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
        }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .title { font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: #fff; }
        .badge { font-size: 11px; font-weight: 700; background: rgba(255, 71, 87, 0.15); color: #ff6b81; padding: 4px 10px; border-radius: 99px; border: 1px solid rgba(255, 71, 87, 0.3); }
        .status-box {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }
        .field { margin-bottom: 18px; display: flex; flex-direction: column; gap: 6px; }
        label { font-size: 12.5px; font-weight: 600; color: #95a5a6; }
        input[type="text"], textarea {
          background: rgba(14, 16, 24, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fff;
          font-size: 13.5px;
          font-family: inherit;
          outline: none;
        }
        input[type="file"] {
          background: rgba(14, 16, 24, 0.85);
          border: 1px dashed rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 16px;
          color: #95a5a6;
          cursor: pointer;
        }
        .btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #ff4757 0%, #e056fd 100%);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 14.5px;
          font-weight: 800;
          cursor: pointer;
          margin-top: 10px;
          box-shadow: 0 8px 25px rgba(255, 71, 87, 0.35);
          transition: transform 0.15s;
        }
        .btn:hover { transform: translateY(-2px); }
        .alert { background: rgba(46, 213, 115, 0.15); border: 1px solid rgba(46, 213, 115, 0.3); color: #2ed573; padding: 12px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; font-weight: 600; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1 class="title">✦ Starly Cloud OTA</h1>
          <span class="badge">1.21.11 Auto-Updater</span>
        </div>

        ${req.query.success ? '<div class="alert">✓ Обновление успешно загружено и опубликовано для всех игроков!</div>' : ''}

        <div class="status-box">
          <div>Текущая версия: <b>${versionData.version}</b></div>
          <div>Размер: <b>${jarSize}</b></div>
        </div>

        <form action="/api/loader/upload" method="POST" enctype="multipart/form-data">
          <div class="field">
            <label>Файл обновления клиента (.jar)</label>
            <input type="file" name="clientJar" accept=".jar" required>
          </div>

          <div class="field">
            <label>Номер версии (например: 1.21.11-v1.0.1)</label>
            <input type="text" name="version" value="${versionData.version}" required>
          </div>

          <div class="field">
            <label>Список изменений (Changelog)</label>
            <textarea name="changelog" rows="3">${versionData.changelog || ''}</textarea>
          </div>

          <button type="submit" class="btn">ОПУБЛИКОВАТЬ ОБНОВЛЕНИЕ</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
