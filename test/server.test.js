'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startServer } = require('../server.js');

// ---- 工具 ----
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

async function withServer(options, fn) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchat-test-'));
  const opts = { uploadDir, ...options };
  const candidates = [
    20000 + Math.floor(Math.random() * 20000),
    20000 + Math.floor(Math.random() * 20000),
    3000,
  ];
  let server = null;
  for (const port of candidates) {
    try {
      server = startServer(port, opts);
      await listen(server);
      break;
    } catch (err) {
      if (server) server.close();
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  if (!server) throw new Error('无法启动测试服务器');
  const port = server.address().port;
  try {
    await fn({ port, uploadDir });
  } finally {
    server.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

function upload(port, name, body) {
  const url = `http://127.0.0.1:${port}/api/upload?name=${encodeURIComponent(name)}&user=test`;
  return fetch(url, { method: 'POST', body });
}

async function waitUntil(predicate, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise(r => setTimeout(r, 30));
  }
  return predicate();
}

// ---- L1：/api/view 同源漏洞 ----
test('L1: /api/view 对非图片（evil.html）走 attachment 且非 text/html', async () => {
  await withServer({}, async ({ port, uploadDir }) => {
    await upload(port, 'evil.html', '<script>alert(1)</script>');
    const res = await fetch(`http://127.0.0.1:${port}/api/view/evil.html`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') || '', /^attachment/);
    assert.notEqual(res.headers.get('content-type'), 'text/html');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});

test('L1: /api/view 对 SVG 内联但带 CSP，直接打开不执行脚本', async () => {
  await withServer({}, async ({ port }) => {
    await upload(port, 'a.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const res = await fetch(`http://127.0.0.1:${port}/api/view/a.svg`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
    assert.equal(res.headers.get('content-disposition'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy') || '', /default-src 'none'/);
  });
});

test('L1: /api/view 对 PNG 行为不变（内联 image/png）', async () => {
  await withServer({}, async ({ port }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await upload(port, 'a.png', png);
    const res = await fetch(`http://127.0.0.1:${port}/api/view/a.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('content-disposition'), null);
  });
});

// ---- L2：上传大小上限与残缺文件 ----
test('L2: Content-Length 超限直接 413，不创建文件', async () => {
  await withServer({ maxUploadBytes: 100 }, async ({ port, uploadDir }) => {
    const res = await upload(port, 'big.bin', Buffer.alloc(200));
    assert.equal(res.status, 413);
    assert.equal(fs.readdirSync(uploadDir).length, 0);
  });
});

test('L2: 无 Content-Length 流式超限 413 且不残留文件', async () => {
  await withServer({ maxUploadBytes: 100 }, async ({ port, uploadDir }) => {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/upload?name=big.bin&user=test', method: 'POST' },
        resolve
      );
      req.on('error', reject);
      req.write(Buffer.alloc(200)); // chunked，超过 100 字节
      req.end();
    });
    assert.equal(res.statusCode, 413);
    assert.equal(await waitUntil(() => fs.readdirSync(uploadDir).length === 0), true);
    assert.equal(fs.readdirSync(uploadDir).length, 0);
  });
});

test('L2: 中途断开不残留文件', async () => {
  await withServer({ maxUploadBytes: 1024 * 1024 }, async ({ port, uploadDir }) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/upload?name=partial.bin&user=test', method: 'POST' }
    );
    req.on('error', () => {});
    req.write(Buffer.alloc(512));
    setTimeout(() => req.destroy(), 50); // 不 end，直接断开
    assert.equal(await waitUntil(() => fs.readdirSync(uploadDir).length === 0), true);
    assert.equal(fs.readdirSync(uploadDir).length, 0);
  });
});
