'use strict';

/**
 * 局域网聊天室 — 服务端（零第三方依赖，仅用 Node 内置模块）
 * 可被 Electron 主进程 require 调用 startServer(port, options)，也可直接 `node server.js` 启动。
 * options.uploadDir 可覆盖上传目录（打包后需指向可写位置）。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_HISTORY = 200;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

let currentPort = 0;

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function isImage(name) {
  return IMAGE_EXT.has(path.extname(String(name)).toLowerCase());
}

function isVirtualAddr(addr) {
  const p = String(addr).split('.').map(Number);
  if (p[0] === 127) return true;                             // 回环
  if (p[0] === 169 && p[1] === 254) return true;             // 链路本地
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // WSL/Hyper-V/Docker 虚拟网段
  return false;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !isVirtualAddr(a.address)) {
        out.push(a.address);
      }
    }
  }
  return [...new Set(out)];
}

function sanitizeFilename(raw) {
  let name = String(raw || 'file')
    .replace(/[\\/]/g, '_')
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 120);
  return name || 'file';
}

function startServer(port, options) {
  const opts = options || {};
  port = Number(port || process.env.PORT || 3000);
  currentPort = port;
  const HOST = '0.0.0.0';
  const uploadDir = opts.uploadDir || path.join(ROOT, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  const clients = new Map(); // res -> { name }
  let history = [];

  function sendEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function broadcast(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients.keys()) {
      try { res.write(frame); } catch (_) { clients.delete(res); }
    }
  }

  function broadcastUsers() {
    const names = [...new Set([...clients.values()].map(c => c.name))];
    broadcast('users', { users: names });
  }

  function pushMessage(entry) {
    history.push(entry);
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    broadcast('message', entry);
  }

  function systemMessage(text) {
    pushMessage({ id: crypto.randomUUID(), name: '系统', text, time: Date.now(), system: true });
  }

  function uniquePath(name) {
    const ext = path.extname(name);
    const stem = path.basename(name, ext);
    let candidate = name;
    let i = 1;
    while (fs.existsSync(path.join(uploadDir, candidate))) {
      candidate = `${stem} (${i})${ext}`;
      i++;
    }
    return path.join(uploadDir, candidate);
  }

  function serveStatic(res, urlPath) {
    if (urlPath === '/') urlPath = '/index.html';
    const p = path.normalize(path.join(PUBLIC_DIR, urlPath));
    if (p !== PUBLIC_DIR && !p.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    fs.readFile(p, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
      const ext = path.extname(p).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (_) { pathname = url.pathname; }

    // ---- SSE 实时推送 ----
    if (pathname === '/api/events') {
      const name = (url.searchParams.get('name') || '匿名').slice(0, 30);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`retry: 3000\n\n`);
      sendEvent(res, 'history', history);
      clients.set(res, { name });
      systemMessage(`${name} 加入了聊天室`);
      broadcastUsers();
      req.on('close', () => {
        if (clients.delete(res)) {
          systemMessage(`${name} 离开了聊天室`);
          broadcastUsers();
        }
      });
      return;
    }

    // ---- 发送消息 ----
    if (pathname === '/api/message' && req.method === 'POST') {
      let body = '';
      req.on('data', c => {
        body += c;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body);
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';
          if (!text) return json(res, 400, { ok: false, error: '消息不能为空' });
          pushMessage({
            id: crypto.randomUUID(),
            name: String(msg.name || '匿名').slice(0, 30) || '匿名',
            text: text.slice(0, 4000),
            time: Date.now(),
          });
          json(res, 200, { ok: true });
        } catch (_) {
          json(res, 400, { ok: false, error: '消息格式错误' });
        }
      });
      return;
    }

    // ---- 文件列表 ----
    if (pathname === '/api/files' && req.method === 'GET') {
      const files = [];
      for (const name of fs.readdirSync(uploadDir)) {
        const p = path.join(uploadDir, name);
        const st = fs.statSync(p);
        if (st.isFile()) files.push({ name, size: st.size, time: st.mtimeMs, image: isImage(name) });
      }
      files.sort((a, b) => b.time - a.time);
      return json(res, 200, files);
    }

    // ---- 上传（原始二进制 body，文件名走查询参数）----
    if (pathname === '/api/upload' && req.method === 'POST') {
      const rawName = sanitizeFilename(url.searchParams.get('name') || req.headers['x-file-name']);
      const uploader = String(url.searchParams.get('user') || '匿名').slice(0, 30) || '匿名';
      const dest = uniquePath(rawName);
      const finalName = path.basename(dest);
      const ws = fs.createWriteStream(dest);
      let size = 0;

      req.on('data', c => { size += c.length; });
      req.pipe(ws);
      req.on('error', () => ws.destroy());
      ws.on('error', () => { try { fs.unlinkSync(dest); } catch (_) {} });
      ws.on('finish', () => {
        pushMessage({
          id: crypto.randomUUID(),
          name: uploader,
          text: '上传了一个文件',
          time: Date.now(),
          file: { name: finalName, size, type: isImage(finalName) ? 'image' : 'file' },
        });
        json(res, 200, { ok: true, name: finalName, size });
      });
      return;
    }

    // ---- 下载（强制下载）----
    if (pathname.startsWith('/api/download/') && req.method === 'GET') {
      const name = path.basename(pathname.slice('/api/download/'.length));
      const p = path.join(uploadDir, name);
      fs.stat(p, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('文件不存在');
        }
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': st.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        });
        fs.createReadStream(p).pipe(res);
      });
      return;
    }

    // ---- 内联预览（图片用，浏览器直接显示）----
    if (pathname.startsWith('/api/view/') && req.method === 'GET') {
      const name = path.basename(pathname.slice('/api/view/'.length));
      const p = path.join(uploadDir, name);
      fs.stat(p, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('文件不存在');
        }
        const ext = path.extname(name).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Content-Length': st.size,
          'Cache-Control': 'max-age=3600',
        });
        fs.createReadStream(p).pipe(res);
      });
      return;
    }

    // ---- 删除 ----
    if (pathname.startsWith('/api/files/') && req.method === 'DELETE') {
      const name = path.basename(pathname.slice('/api/files/'.length));
      const p = path.join(uploadDir, name);
      fs.stat(p, (err, st) => {
        if (err || !st.isFile()) return json(res, 404, { ok: false, error: '文件不存在' });
        fs.unlink(p, err2 => {
          if (err2) return json(res, 500, { ok: false, error: '删除失败' });
          json(res, 200, { ok: true });
        });
      });
      return;
    }

    // ---- 服务信息（局域网地址）----
    if (pathname === '/api/info' && req.method === 'GET') {
      return json(res, 200, { port, addresses: lanAddresses() });
    }

    // ---- 静态资源 ----
    if (req.method === 'GET') return serveStatic(res, url.pathname);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${port} 已被占用，换个端口或先关掉占用进程。`);
    } else {
      console.error('服务启动失败：', err.message);
    }
  });

  server.listen(port, HOST, () => {
    printBanner(port, process.platform);
  });

  return server;
}

function getPort() {
  return currentPort;
}

/** 各平台放行端口的提示不一样，别让 macOS 用户去找「Windows 防火墙」 */
function firewallHint(platform, port) {
  switch (platform) {
    case 'darwin':
      return '  首次启动若弹「允许局域网连接」提示，请点「允许」；如果之前误点了拒绝，\n' +
        '  到「系统设置 › 隐私与安全性 › 本地网络」里重新打开。';
    case 'win32':
      return '  若首次弹 Windows 防火墙提示，请勾选「专用网络」并点「允许访问」。';
    default:
      return `  若系统开了防火墙，请放行 TCP ${port}（例如 ufw allow ${port}/tcp）。`;
  }
}

function printBanner(port, platform) {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │              局域网聊天室已启动              │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
  console.log(`  本机访问:     http://127.0.0.1:${port}`);
  for (const addr of lanAddresses()) {
    console.log(`  局域网访问:   http://${addr}:${port}`);
  }
  console.log('');
  console.log('  其他电脑用浏览器打开上面的「局域网访问」地址即可。');
  console.log(firewallHint(platform, port));
  console.log('');
}

module.exports = { startServer, getPort, printBanner, firewallHint, lanAddresses };

if (require.main === module) {
  startServer(process.argv[2]);
}
