'use strict';

const $ = sel => document.querySelector(sel);
const messagesEl = $('#messages');
const fileListEl = $('#fileList');
const inputEl = $('#input');
const nickEl = $('#nick');
const connDot = $('#connDot');
const statusText = $('#statusText');
const onlineEl = $('#online');
const themeBtn = $('#themeBtn');
const uploadBar = $('#uploadBar');
const uploadBarFill = $('#uploadBarFill');
const uploadBarText = $('#uploadBarText');
const lanAddr = $('#lanAddr');
const copyAddr = $('#copyAddr');
const unreadBadge = $('#unreadBadge');
const emojiBtn = $('#emojiBtn');
const emojiPanel = $('#emojiPanel');
const fileSearch = $('#fileSearch');
const fileSort = $('#fileSort');
const lightbox = $('#lightbox');
const lightboxImg = $('#lightboxImg');
const lightboxClose = $('#lightboxClose');
const tabsEl = $('#tabs');

let myName = localStorage.getItem('lanchat.nick') || '';
nickEl.value = myName;
nickEl.addEventListener('change', () => {
  myName = nickEl.value.trim().slice(0, 30);
  localStorage.setItem('lanchat.nick', myName);
});

// ---- 主题（dark / light / auto）----
const THEMES = ['dark', 'light', 'auto'];
function applyTheme(t) {
  const effective = t === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t;
  document.body.setAttribute('data-theme', effective);
  themeBtn.textContent = t === 'auto' ? '🌗' : t === 'light' ? '☀️' : '🌙';
  themeBtn.title = t === 'auto' ? '主题：跟随系统' : t === 'light' ? '主题：浅色' : '主题：深色';
  localStorage.setItem('lanchat.theme', t);
}
let theme = localStorage.getItem('lanchat.theme') || 'dark';
applyTheme(theme);
themeBtn.addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme(theme);
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (theme === 'auto') applyTheme(theme);
});

// ---- 工具 ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}
function fmtTime(t) {
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
let lastDay = '';
function dayLabel(t) {
  const d = new Date(t);
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return '今天';
  if (sameDay(d, yest)) return '昨天';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('复制失败'));
}

// ---- 像素小动物头像（确定性生成）----
const avatarCache = new Map();
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const BODY_COLORS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#06b6d4', '#f43f5e', '#84cc16', '#6366f1'];
function renderPixelAnimal(name) {
  const rnd = mulberry32(hashStr(name));
  const body = BODY_COLORS[Math.floor(rnd() * BODY_COLORS.length)];
  const earType = Math.floor(rnd() * 4); // 0 猫耳 1 熊耳 2 兔耳 3 圆脸
  const blush = rnd() < 0.6;

  const N = 12;
  const grid = Array.from({ length: N }, () => new Array(N).fill(null));
  const set = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) grid[r][c] = v; };
  const both = (r, c, v) => { set(r, c, v); set(r, N - 1 - c, v); };

  // 头（圆角方块）
  for (let r = 3; r <= 10; r++) for (let c = 1; c <= 10; c++) set(r, c, body);
  set(3, 1, null); set(3, 10, null); set(10, 1, null); set(10, 10, null);

  // 耳朵（盖在头上，向上凸出）
  const ears = cells => cells.forEach(([r, c]) => both(r, c, body));
  if (earType === 0) ears([[1, 2], [2, 1], [2, 2], [2, 3]]);                 // 猫
  else if (earType === 1) ears([[1, 1], [1, 2], [2, 1], [2, 2]]);            // 熊
  else if (earType === 2) ears([[0, 1], [0, 2], [1, 1], [1, 2], [2, 1], [2, 2]]); // 兔

  // 眼睛（深色 + 高光）
  const eye = '#1c1f26';
  both(5, 4, eye); both(6, 4, eye); both(5, 7, eye); both(6, 7, eye);
  both(5, 4, '#ffffff');
  // 鼻子
  both(8, 5, '#1c1f26');
  // 腮红
  if (blush) { both(8, 3, '#ffb3c1'); both(8, 8, '#ffb3c1'); }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (grid[r][c]) { ctx.fillStyle = grid[r][c]; ctx.fillRect(c, r, 1, 1); }
  }
  return canvas.toDataURL();
}
function avatarDataUrl(name) {
  if (!avatarCache.has(name)) avatarCache.set(name, renderPixelAnimal(name));
  return avatarCache.get(name);
}
function avatarHtml(name) {
  return `<img class="avatar-img" src="${avatarDataUrl(name)}" alt="" draggable="false">`;
}

let audioCtx;
function playBeep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880; o.type = 'sine';
    g.gain.setValueAtTime(0.06, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    o.start(); o.stop(audioCtx.currentTime + 0.25);
  } catch (_) {}
}
function notify(m) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const body = m.file ? `发来文件：${m.file.name}` : m.text;
    new Notification(m.name, { body });
  }
}
function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

// ---- 消息 ----
const seen = new Set();
let lastAuthor = null;
let lastAuthorTime = 0;
let unread = 0;

function addMessage(m) {
  if (seen.has(m.id)) return;
  seen.add(m.id);

  const day = dayLabel(m.time);
  if (day !== lastDay) {
    lastDay = day;
    const sep = document.createElement('div');
    sep.className = 'day-sep';
    sep.textContent = day;
    messagesEl.appendChild(sep);
  }

  const div = document.createElement('div');
  const mine = !m.system && m.name === myName;

  if (m.system) {
    lastAuthor = null;
    div.className = 'msg system';
    div.innerHTML = `<div class="bubble">${escapeHtml(m.text)}</div>`;
  } else {
    const merge = m.name === lastAuthor && (m.time - lastAuthorTime) < 5 * 60 * 1000;
    lastAuthor = m.name;
    lastAuthorTime = m.time;
    div.className = 'msg' + (mine ? ' mine' : '') + (merge ? ' merged' : '');

    let body;
    if (m.file) {
      const img = m.file.type === 'image'
        ? `<div class="img-preview"><img src="/api/view/${encodeURIComponent(m.file.name)}" alt="${escapeHtml(m.file.name)}" loading="lazy"></div>`
        : '';
      body = `${img}<div class="file-card">📎 <a href="/api/download/${encodeURIComponent(m.file.name)}">${escapeHtml(m.file.name)}</a> <span class="fsize">${fmtSize(m.file.size)}</span></div>`;
    } else {
      body = `<div class="bubble">${escapeHtml(m.text)}</div>`;
    }

    const avatar = merge ? '<span class="avatar-img ghost"></span>' : avatarHtml(m.name);
    const meta = merge
      ? `<div class="meta"><span>${fmtTime(m.time)}</span></div>`
      : `<div class="meta"><span class="who">${escapeHtml(m.name)}</span> · ${fmtTime(m.time)}${m.file ? '' : '<button class="copy" title="复制">复制</button>'}</div>`;

    div.innerHTML = `<div class="row">${avatar}<div class="content">${meta}${body}</div></div>`;

    if (!m.file && !merge) {
      div.querySelector('.copy').addEventListener('click', () => {
        copyText(m.text).then(() => {
          const b = div.querySelector('.copy');
          b.textContent = '已复制';
          setTimeout(() => { b.textContent = '复制'; }, 1200);
        }).catch(() => {});
      });
    }
  }
  messagesEl.appendChild(div);
  scrollBottom();

  if (!m.system && !mine) {
    if (document.hidden) { unread++; updateUnread(); notify(m); }
    playBeep();
  }
}

function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
function setConn(on) {
  connDot.className = 'dot ' + (on ? 'on' : 'off');
  statusText.textContent = on ? '已连接' : '连接断开，重连中…';
}
function updateUnread() {
  unreadBadge.hidden = unread === 0;
  unreadBadge.textContent = unread > 99 ? '99+' : unread;
  document.title = unread > 0 ? `(${unread}) 局域网聊天室` : '局域网聊天室';
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { unread = 0; updateUnread(); }
});

function renderUsers(names) {
  onlineEl.innerHTML = '';
  for (const n of names || []) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = avatarHtml(n) + `<span>${escapeHtml(n)}</span>`;
    onlineEl.appendChild(chip);
  }
}

// ---- SSE ----
function connect() {
  const es = new EventSource('/api/events?name=' + encodeURIComponent(myName || '匿名'));
  es.onopen = () => setConn(true);
  es.onerror = () => setConn(false);
  es.addEventListener('history', e => {
    const list = JSON.parse(e.data);
    messagesEl.innerHTML = '';
    seen.clear();
    lastDay = '';
    lastAuthor = null; lastAuthorTime = 0;
    for (const m of list) addMessage(m);
  });
  es.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    addMessage(m);
    if (m.file) loadFiles();
  });
  es.addEventListener('users', e => {
    const d = JSON.parse(e.data);
    renderUsers(d.users);
  });
}

// ---- 发送消息 ----
const composer = $('#composer');
composer.addEventListener('submit', async e => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  inputEl.style.height = 'auto';
  try {
    await fetch('/api/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: myName || '匿名', text }),
    });
  } catch (err) {
    addMessage({ id: crypto.randomUUID(), name: '系统', text: '发送失败：' + err.message, time: Date.now(), system: true });
  }
});
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
});

// ---- emoji ----
const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '👍', '👎', '🙏', '🎉', '❤️', '🔥', '👌', '😅', '😭', '😴', '🤯', '💯', '✨', '🎁', '⭐', '☕', '🍺', '🍔', '🍕', '🐱', '🐶', '🌈', '⚽', '🚀', '🌙', '☀️', '🍀', '🎵', '📌', '💡', '✅', '❌', '⚠️', '👀', '💪'];
(function buildEmojiPanel() {
  for (const em of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    b.addEventListener('click', () => insertEmoji(em));
    emojiPanel.appendChild(b);
  }
})();
emojiBtn.addEventListener('click', () => { emojiPanel.hidden = !emojiPanel.hidden; });
function insertEmoji(em) {
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;
  inputEl.value = inputEl.value.slice(0, start) + em + inputEl.value.slice(end);
  inputEl.focus();
  inputEl.selectionStart = inputEl.selectionEnd = start + em.length;
  inputEl.dispatchEvent(new Event('input'));
}

// ---- 文件 ----
let allFiles = [];
async function loadFiles() {
  try {
    allFiles = await (await fetch('/api/files')).json();
    applyFileFilter();
  } catch (_) {}
}
function applyFileFilter() {
  const q = fileSearch.value.trim().toLowerCase();
  const sort = fileSort.value;
  let list = allFiles.filter(f => !q || f.name.toLowerCase().includes(q));
  if (sort === 'time-desc') list = list.slice().sort((a, b) => b.time - a.time);
  else if (sort === 'time-asc') list = list.slice().sort((a, b) => a.time - b.time);
  else if (sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  else if (sort === 'size') list = list.slice().sort((a, b) => b.size - a.size);
  renderFileItems(list);
}
function renderFileItems(files) {
  fileListEl.innerHTML = '';
  if (!files.length) {
    fileListEl.innerHTML = '<div class="empty">📂 还没有文件<br>拖拽文件到此处，或 Ctrl+V 粘贴图片</div>';
    return;
  }
  for (const f of files) {
    const div = document.createElement('div');
    div.className = 'file-item';
    const icon = f.image ? '🖼️' : '📄';
    div.innerHTML = `
      <span class="fname">${icon} ${escapeHtml(f.name)}</span>
      <span class="fmeta">${fmtSize(f.size)} · ${fmtTime(f.time)}</span>
      <a href="/api/download/${encodeURIComponent(f.name)}" download>下载</a>
      <button class="del" title="删除">删除</button>`;
    div.querySelector('.del').addEventListener('click', () => deleteFile(f.name));
    fileListEl.appendChild(div);
  }
}
async function deleteFile(name) {
  if (!confirm(`确定删除「${name}」？`)) return;
  await fetch('/api/files/' + encodeURIComponent(name), { method: 'DELETE' });
  loadFiles();
}
function uploadFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = '?name=' + encodeURIComponent(file.name) + '&user=' + encodeURIComponent(myName || '匿名');
    xhr.open('POST', '/api/upload' + qs);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else {
        let msg = 'HTTP ' + xhr.status;
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.send(file);
  });
}
async function uploadFiles(files) {
  const list = [...files];
  if (!list.length) return;
  uploadBar.hidden = false;
  uploadBarFill.style.width = '0%';
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    try {
      await uploadFile(f, p => {
        const pct = Math.round(p * 100);
        uploadBarText.textContent = `正在上传 ${f.name}（${i + 1}/${list.length}）${pct}%`;
        uploadBarFill.style.width = pct + '%';
      });
    } catch (err) {
      addMessage({ id: crypto.randomUUID(), name: '系统', text: `上传「${f.name}」失败：${err.message}`, time: Date.now(), system: true });
    }
  }
  uploadBar.hidden = true;
  uploadBarFill.style.width = '0%';
  uploadBarText.textContent = '';
  loadFiles();
}
$('#uploadBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', e => {
  if (e.target.files.length) uploadFiles(e.target.files);
  e.target.value = '';
});
fileSearch.addEventListener('input', applyFileFilter);
fileSort.addEventListener('change', applyFileFilter);

// 粘贴图片直接上传
document.addEventListener('paste', e => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  const files = [];
  for (const it of items) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) uploadFiles(files);
});

// 拖拽上传
const dropHint = $('#dropHint');
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; dropHint.classList.add('drag'); });
window.addEventListener('dragover', e => { e.preventDefault(); });
window.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; dropHint.classList.remove('drag'); } });
window.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0; dropHint.classList.remove('drag');
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

// ---- 局域网地址 ----
async function loadInfo() {
  try {
    const info = await (await fetch('/api/info')).json();
    const addrs = info.addresses || [];
    if (addrs.length) {
      lanAddr.textContent = `http://${addrs[0]}:${info.port}`;
      lanAddr.title = addrs.map(a => `http://${a}:${info.port}`).join('\n');
    } else {
      lanAddr.textContent = `http://localhost:${info.port}`;
    }
  } catch (_) {
    lanAddr.textContent = '未知（运行 node server.js 查看地址）';
  }
}
copyAddr.addEventListener('click', () => {
  copyText(lanAddr.textContent).then(() => {
    copyAddr.textContent = '已复制';
    setTimeout(() => { copyAddr.textContent = '复制'; }, 1200);
  }).catch(() => {});
});

// ---- 移动端 Tab ----
tabsEl.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const p = tab.dataset.pane;
    $('#paneChat').classList.toggle('active', p === 'chat');
    $('#paneFiles').classList.toggle('active', p === 'files');
  });
});

// ---- 灯箱 ----
function openLightbox(src) { lightboxImg.src = src; lightbox.hidden = false; }
function closeLightbox() { lightbox.hidden = true; lightboxImg.src = ''; }
messagesEl.addEventListener('click', e => {
  const img = e.target.closest('.img-preview img');
  if (img) openLightbox(img.src);
});
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
lightboxClose.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeLightbox(); if (!emojiPanel.hidden) emojiPanel.hidden = true; }
});

// ---- 口令登录 ----
const passcodeModal = $('#passcodeModal');
const passcodeInput = $('#passcodeInput');
const passcodeOk = $('#passcodeOk');
const passcodeCancel = $('#passcodeCancel');

function promptPasscode() {
  return new Promise(resolve => {
    passcodeInput.value = '';
    passcodeModal.hidden = false;
    passcodeInput.focus();
    const ok = () => { passcodeModal.hidden = true; cleanup(); resolve(passcodeInput.value); };
    const cancel = () => { passcodeModal.hidden = true; cleanup(); resolve(null); };
    const key = e => { if (e.key === 'Enter') ok(); else if (e.key === 'Escape') cancel(); };
    const cleanup = () => {
      passcodeOk.removeEventListener('click', ok);
      passcodeCancel.removeEventListener('click', cancel);
      passcodeInput.removeEventListener('keydown', key);
    };
    passcodeOk.addEventListener('click', ok);
    passcodeCancel.addEventListener('click', cancel);
    passcodeInput.addEventListener('keydown', key);
  });
}

async function login(passcode) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passcode }),
  });
  return res.ok;
}

async function ensureAuth() {
  try {
    const res = await fetch('/api/info');
    if (res.status !== 401) return;
  } catch (_) { return; }
  // 需要口令：循环弹框，直到输入正确或取消
  while (true) {
    const p = await promptPasscode();
    if (p == null) return;
    if (await login(p)) return;
  }
}

// ---- 初始化 ----
if (!myName) {
  myName = '访客' + Math.floor(1000 + Math.random() * 9000);
  nickEl.value = myName;
  localStorage.setItem('lanchat.nick', myName);
}
document.addEventListener('click', requestNotifyPermission, { once: true });
(async function init() {
  await ensureAuth();
  connect();
  loadFiles();
  loadInfo();
})();
