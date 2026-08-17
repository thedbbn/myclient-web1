const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Built-in CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// JSON and URL-encoded body parsers
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '150mb' }));

const DATA_FILE = path.join(__dirname, 'data.json');
const STORAGE_DIR = path.join(__dirname, 'storage');
const VERSION_FILE = path.join(STORAGE_DIR, 'version.json');
const JAR_PATH = path.join(STORAGE_DIR, 'Starly-Client-1.21.11.jar');

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
  changelog: 'Релиз Starly Client 1.21.11: обновленный кастомный хотбар, статус-бары, Modrinth каталог модов.',
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
  if (fs.existsSync(JAR_PATH)) {
    res.download(JAR_PATH, 'Starly-Client-1.21.11.jar');
  } else {
    res.status(404).json({ error: 'Client jar not uploaded yet' });
  }
});

// Direct Jar Stream Upload
app.post('/api/loader/upload-raw', (req, res) => {
  const version = req.headers['x-version'] || versionData.version;
  const changelog = req.headers['x-changelog'] ? decodeURIComponent(req.headers['x-changelog']) : versionData.changelog;

  const fileStream = fs.createWriteStream(JAR_PATH);
  req.pipe(fileStream);

  fileStream.on('finish', () => {
    versionData.version = version;
    versionData.changelog = changelog;
    versionData.updatedAt = new Date().toISOString();
    saveVersion();
    res.json({ success: true, message: 'Jar updated successfully', versionData });
  });

  fileStream.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

// HTML Form Multipart Upload Handler (Zero-dependency parser)
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
      let jarBuffer = null;

      for (const part of parts) {
        if (part.includes('name="version"')) {
          const m = part.match(/\r\n\r\n([\s\S]*?)\r\n/);
          if (m) newVersion = m[1].trim();
        } else if (part.includes('name="changelog"')) {
          const m = part.match(/\r\n\r\n([\s\S]*?)\r\n/);
          if (m) newChangelog = m[1].trim();
        } else if (part.includes('name="clientJar"') && part.includes('filename=')) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const rawBody = part.substring(headerEnd + 4);
            const cleanBody = rawBody.replace(/\r\n$/, '');
            jarBuffer = Buffer.from(cleanBody, 'binary');
          }
        }
      }

      if (jarBuffer && jarBuffer.length > 100) {
        fs.writeFileSync(JAR_PATH, jarBuffer);
      }

      versionData.version = newVersion;
      versionData.changelog = newChangelog;
      versionData.updatedAt = new Date().toISOString();
      saveVersion();
    }

    res.redirect('/?success=1');
  });
});

// ==================== ADMIN WEB PANEL ====================
app.get(['/', '/admin'], (req, res) => {
  const hasJar = fs.existsSync(JAR_PATH);
  let jarSize = 'Не загружен';
  if (hasJar) {
    const st = fs.statSync(JAR_PATH);
    jarSize = (st.size / (1024 * 1024)).toFixed(2) + ' MB';
  }

  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starly Cloud OTA Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', sans-serif;
      background: radial-gradient(circle at 80% 20%, rgba(224, 86, 253, 0.14) 0%, transparent 40%),
                  radial-gradient(circle at 20% 80%, rgba(255, 71, 87, 0.14) 0%, transparent 45%),
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
      max-width: 560px;
      background: rgba(22, 25, 38, 0.85);
      backdrop-filter: blur(30px);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 18px;
      padding: 32px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
    }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
    .title { font-family: 'Outfit', sans-serif; font-size: 22px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; }
    .badge { font-size: 11px; font-weight: 700; background: rgba(255, 71, 87, 0.15); color: #ff6b81; padding: 4px 10px; border-radius: 99px; border: 1px solid rgba(255, 71, 87, 0.3); }
    .status-box {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.07);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
    }
    .field { margin-bottom: 18px; display: flex; flex-direction: column; gap: 7px; }
    label { font-size: 12.5px; font-weight: 600; color: #95a5a6; }
    input[type="text"], textarea {
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
    .alert { background: rgba(46, 213, 115, 0.15); border: 1px solid rgba(46, 213, 115, 0.3); color: #2ed573; padding: 12px; border-radius: 10px; font-size: 13px; margin-bottom: 20px; font-weight: 600; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="title">✦ Starly Cloud OTA</h1>
      <span class="badge">Render 1.21.11</span>
    </div>

    ${req.query.success ? '<div class="alert">✓ Обновление успешно опубликовано для всех пользователей лоадера!</div>' : ''}

    <div class="status-box">
      <div>Версия в облаке: <b>${versionData.version}</b></div>
      <div>Файл: <b>${jarSize}</b></div>
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
</html>`);
});

app.listen(PORT, () => {
  console.log(`Starly server running on port ${PORT}`);
});
