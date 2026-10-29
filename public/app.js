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

let myName = localStorage.getItem('lanchat.nick') || '';
nickEl.value = myName;
nickEl.addEventListener('change', () => {
  myName = nickEl.value.trim().slice(0, 30);
  localStorage.setItem('lanchat.nick', myName);
});

// ---- 主题 ----
function applyTheme(t) {
  document.body.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'light' ? '☀️' : '🌙';
  localStorage.setItem('lanchat.theme', t);
}
let theme = localStorage.getItem('lanchat.theme') || 'dark';
applyTheme(theme);
themeBtn.addEventListener('click', () => {
  theme = document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(theme);
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

const PALETTE = ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
function avatarColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function avatarHtml(name) {
  const c = avatarColor(name);
  const first = [...String(name)][0] || '?';
  return `<span class="avatar" style="background:${c}">${escapeHtml(first)}</span>`;
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('复制失败'));
}

// ---- 消息渲染 ----
const seen = new Set();
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
  div.className = 'msg' + (m.system ? ' system' : mine ? ' mine' : '');

  if (m.system) {
    div.innerHTML = `<div class="bubble">${escapeHtml(m.text)}</div>`;
  } else {
    let body;
    if (m.file) {
      const img = m.file.type === 'image'
        ? `<div class="img-preview"><a href="/api/view/${encodeURIComponent(m.file.name)}" target="_blank" rel="noopener"><img src="/api/view/${encodeURIComponent(m.file.name)}" alt="${escapeHtml(m.file.name)}" loading="lazy"></a></div>`
        : '';
      body = `${img}<div class="file-card">📎 <a href="/api/download/${encodeURIComponent(m.file.name)}">${escapeHtml(m.file.name)}</a> <span class="fsize">${fmtSize(m.file.size)}</span></div>`;
    } else {
      body = `<div class="bubble">${escapeHtml(m.text)}</div>`;
    }
    const copyBtn = m.file ? '' : '<button class="copy" title="复制">复制</button>';
    div.innerHTML = `
      <div class="row">
        ${avatarHtml(m.name)}
        <div class="content">
          <div class="meta"><span class="who">${escapeHtml(m.name)}</span> · ${fmtTime(m.time)}${copyBtn}</div>
          ${body}
        </div>
      </div>`;
    if (!m.file) {
      const btn = div.querySelector('.copy');
      btn.addEventListener('click', () => {
        copyText(m.text).then(() => {
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = '复制'; }, 1200);
        }).catch(() => {});
      });
    }
  }
  messagesEl.appendChild(div);
  scrollBottom();
}

function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function setConn(on) {
  connDot.className = 'dot ' + (on ? 'on' : 'off');
  statusText.textContent = on ? '已连接' : '连接断开，重连中…';
}

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
$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
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

// ---- 文件 ----
async function loadFiles() {
  try {
    const files = await (await fetch('/api/files')).json();
    renderFiles(files);
  } catch (_) {}
}

function renderFiles(files) {
  fileListEl.innerHTML = '';
  if (!files.length) {
    fileListEl.innerHTML = '<div class="empty">还没有文件，拖拽文件到右侧上传</div>';
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
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error('HTTP ' + xhr.status));
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

// ---- 拖拽上传 ----
const dropHint = $('#dropHint');
let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; dropHint.classList.add('drag'); });
window.addEventListener('dragover', e => { e.preventDefault(); });
window.addEventListener('dragleave', e => { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; dropHint.classList.remove('drag'); } });
window.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  dropHint.classList.remove('drag');
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

// ---- 初始化 ----
if (!myName) {
  myName = '访客' + Math.floor(1000 + Math.random() * 9000);
  nickEl.value = myName;
  localStorage.setItem('lanchat.nick', myName);
}
connect();
loadFiles();
