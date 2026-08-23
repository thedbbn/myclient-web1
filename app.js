// Dashboard Client Logic
window.refreshAll = function() {
  window.loadUsers();
  window.loadVersionData();
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
    alert('Введите никнейм!');
    return;
  }
  if (!pwd) {
    alert('Введите пароль!');
    return;
  }
  if (!email || email.indexOf('@') === -1) {
    email = nick.toLowerCase().replace(/[^a-z0-9]/g, '') + '@starly.client';
  }

  if (btn) btn.textContent = 'Создание...';

  fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nick, email: email, password: pwd })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (btn) btn.textContent = 'Создать аккаунт';
    if (res.success) {
      if (role !== 'user') {
        fetch('/api/user/set-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: nick, role: role })
        }).then(function() { window.loadUsers(); });
      }
      alert('Аккаунт ' + nick + ' успешно создан!');
      window.loadUsers();
    } else {
      alert('Ошибка: ' + (res.error || 'Не удалось создать'));
    }
  })
  .catch(function(err) {
    if (btn) btn.textContent = 'Создать аккаунт';
    alert('Ошибка: ' + err.message);
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #8b949e; padding: 24px;">Аккаунтов пока нет</td></tr>';
        return;
      }

      var html = '';
      for (var i = 0; i < users.length; i++) {
        var u = users[i];
        var nick = u.nickname || 'Unknown';
        var email = u.email || '-';
        var role = u.role || 'user';
        var hwidShort = u.hwid ? window.escapeHtml(u.hwid.substring(0, 16)) + '...' : '-';
        var badgeClass = 'badge-' + role;
        var statusBadge = u.banned 
          ? '<span class="badge badge-banned">ЗАБАНЕН</span>' 
          : '<span class="badge badge-active">АКТИВЕН</span>';

        var roleButtons = '';
        if (role !== 'beta') {
          roleButtons += '<button class="btn-purple btn-sm" onclick="window.setRole(\'' + window.escapeHtml(nick) + '\', \'beta\')">Beta</button> ';
        } else {
          roleButtons += '<button class="btn-blue btn-sm" onclick="window.setRole(\'' + window.escapeHtml(nick) + '\', \'user\')">Снять Beta</button> ';
        }
        if (role !== 'owner') {
          roleButtons += '<button class="btn-primary btn-sm" onclick="window.setRole(\'' + window.escapeHtml(nick) + '\', \'owner\')">Owner</button> ';
        }
        roleButtons += '<button class="btn-blue btn-sm" onclick="window.changePasswordPrompt(\'' + window.escapeHtml(nick) + '\')">Пароль</button> ';
        if (u.banned) {
          roleButtons += '<button class="btn-primary btn-sm" onclick="window.unban(\'' + window.escapeHtml(nick) + '\')">Разбанить</button>';
        } else {
          roleButtons += '<button class="btn-danger btn-sm" onclick="window.quickBan(\'' + window.escapeHtml(nick) + '\')">Бан</button>';
        }

        html += '<tr>' +
          '<td><strong>' + window.escapeHtml(nick) + '</strong></td>' +
          '<td>' + window.escapeHtml(email) + '</td>' +
          '<td><span class="badge ' + badgeClass + '">' + window.escapeHtml(role) + '</span></td>' +
          '<td>' + hwidShort + '</td>' +
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
      alert('Роль ' + nick + ' изменена на ' + role);
      window.loadUsers();
    } else {
      alert('Ошибка: ' + (data.error || 'Ошибка смены роли'));
    }
  });
};

window.changePasswordPrompt = function(nick) {
  var newPwd = prompt('Введите новый пароль для игрока ' + nick + ':', '');
  if (newPwd && newPwd.trim().length > 0) {
    fetch('/api/user/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nick, newPassword: newPwd.trim() })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        alert('Пароль для игрока ' + nick + ' успешно изменён на: ' + newPwd.trim());
      } else {
        alert('Ошибка: ' + (data.error || 'Не удалось изменить пароль'));
      }
    })
    .catch(function(err) {
      alert('Ошибка соединения: ' + err.message);
    });
  }
};

window.submitChangePasswordForm = function() {
  var nickInput = document.getElementById('pwd-input-nick');
  var pwdInput = document.getElementById('pwd-input-new');
  var nick = nickInput ? nickInput.value.trim() : '';
  var newPwd = pwdInput ? pwdInput.value.trim() : '';

  if (!nick) {
    alert('Введите никнейм игрока!');
    return;
  }
  if (!newPwd || newPwd.length < 3) {
    alert('Введите новый пароль (минимум 3 символа)!');
    return;
  }

  fetch('/api/user/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nick, newPassword: newPwd })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert(data.message || ('Пароль для игрока ' + nick + ' успешно изменен!'));
      if (pwdInput) pwdInput.value = '';
    } else {
      alert('Ошибка: ' + (data.error || 'Не удалось изменить пароль'));
    }
  })
  .catch(function(err) {
    alert('Ошибка соединения: ' + err.message);
  });
};

window.unban = function(nick) {
  fetch('/api/user/unban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nick })
  }).then(function() {
    alert('Игрок ' + nick + ' разбанен!');
    window.loadUsers();
  });
};

window.quickBan = function(nick) {
  var reason = prompt('Причина бана для ' + nick + ':', 'Нарушение правил');
  if (reason) {
    fetch('/api/user/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nick, reason: reason })
    }).then(function() {
      alert('Игрок ' + nick + ' забанен');
      window.loadUsers();
    });
  }
};

window.submitBan = function() {
  var nickInput = document.getElementById('ban-input-nick');
  var reasonInput = document.getElementById('ban-input-reason');
  var nick = nickInput ? nickInput.value.trim() : '';
  var reason = (reasonInput ? reasonInput.value.trim() : '') || 'Заблокирован';

  if (!nick) {
    alert('Введите никнейм для бана!');
    return;
  }

  fetch('/api/user/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nick, reason: reason })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success) {
      alert(data.message);
      if (nickInput) nickInput.value = '';
      window.loadUsers();
    } else {
      alert('Ошибка: ' + (data.error || 'Не удалось забанить'));
    }
  })
  .catch(function(e) {
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

  var version = verInput ? verInput.value.trim() : '';
  var changelog = logInput ? logInput.value.trim() : '';

  if (!version) {
    alert('Укажите версию обновления!');
    return;
  }

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
          alert((isBeta ? 'Beta' : 'Release') + ' обновление опубликовано!');
          window.loadVersionData();
        });
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert((isBeta ? 'Beta' : 'Release') + ' версия обновлена!');
      window.loadVersionData();
    }
  })
  .catch(function(err) {
    alert('Ошибка: ' + err.message);
  });
};

window.escapeHtml = function(str) {
  return (str || '').replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
};

// Start
window.loadUsers();
window.loadVersionData();
setInterval(window.loadUsers, 2500);
