#!/usr/bin/env node
'use strict';

/**
 * 隐私 / 敏感信息检查：防止本人的身份信息、密钥、本机路径被提交或推送到任何平台。
 *
 * 用法：
 *   node scripts/privacy-check.cjs --staged    # pre-commit：只看这次要提交的内容
 *   node scripts/privacy-check.cjs --all       # pre-push / CI：扫全部入库文件
 *   node scripts/privacy-check.cjs --files a.md src/b.js
 *
 * 三种放行方式（从弱到强）：
 *   1. 同一行写 `privacy-allow`（可跟原因），只放行这一行；
 *   2. 在 `.privacyignore` 里写路径 glob，整个文件不扫；
 *   3. 把只属于你自己的字符串（真名、手机号、家庭住址…）写进 `.privacy-denylist`，
 *      该文件已被 gitignore，只在本机生效，永远不会被提交。
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.svg',
  '.zip', '.dmg', '.exe', '.woff', '.woff2', '.ttf', '.pdf',
  '.mp4', '.webm', '.wasm', '.node', '.asar', '.map',
]);

const SKIP_DIRS = [
  'node_modules/', 'dist/', 'out/', '.git/',
  '.electron-cache/', '.electron-builder-cache/', '.npm-cache/', '.electron-dist/',
];

// 这些文件名一旦入库基本就是把密钥/私人数据传上去了
const FORBIDDEN_FILES = [
  { re: /^\.env(\.(?!example$|sample$|template$).*)?$/, why: '环境变量文件（.env）里通常有密钥，只提交 .env.example' },
  { re: /^\.privacy-denylist$/, why: '本地隐私名单（只应存在于本机）' },
  { re: /(^|\/)(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$/, why: 'SSH 私钥' },
  { re: /\.(pem|p12|pfx|key|kdbx|ovpn)$/i, why: '密钥/证书文件' },
  { re: /^uploads\//, why: '上传的文件目录（可能含私人文件）' },
];

const MAX_BYTES = 2 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* 规则                                                                */
/* ------------------------------------------------------------------ */

function isValidCnId(id) {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  const y = Number(id.slice(6, 10));
  const m = Number(id.slice(10, 12));
  const d = Number(id.slice(12, 14));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return false;
  if (y < 1900 || y > new Date().getFullYear()) return false;
  const weight = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const codes = '10X98765432';
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(id[i]) * weight[i];
  return codes[sum % 11] === id[17].toUpperCase();
}

const RULES = [
  {
    id: 'private-key',
    label: '私钥',
    severity: 'block',
    pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
    hint: '私钥不能进仓库',
  },
  {
    id: 'github-token',
    label: 'GitHub Token',
    severity: 'block',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
  },
  {
    id: 'aws-key',
    label: 'AWS Access Key',
    severity: 'block',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'llm-key',
    label: 'AI 服务 API Key',
    severity: 'block',
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'credential',
    label: '疑似口令/密钥赋值',
    severity: 'block',
    pattern: /(?:api[_-]?key|apikey|secret|token|passw(?:or)?d|authorization)["']?\s*[:=]\s*["'`]([A-Za-z0-9_\-./+=]{12,})["'`]/gi,
    allow: /(your|xxx|example|placeholder|changeme|dummy|sample|test|\*\*\*|\.\.\.|<[^>]+>|\$\{|process\.env)/i,
  },
  {
    id: 'cn-id',
    label: '身份证号',
    severity: 'block',
    pattern: /(?<![\dA-Za-z])[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?![\dA-Za-z])/g,
    validate: isValidCnId,
  },
  {
    id: 'cn-mobile',
    label: '手机号',
    severity: 'block',
    pattern: /(?<![\d.])1[3-9]\d{9}(?![\d.])/g,
    allow: /13800138000/, // 常见测试号码
  },
  {
    id: 'email',
    label: '邮箱地址',
    severity: 'block',
    // 域名首字符必须是字母，避免把 trayTemplate@2x.png 这类文件名当成邮箱
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z][A-Za-z0-9.-]*\.[A-Za-z]{2,}/g,
    allow: /(example\.(com|org|net)|@users\.noreply\.github\.com|@invalid|@localhost)/i,
  },
  {
    id: 'home-path',
    label: '本机家目录路径',
    severity: 'block',
    pattern: /\/(?:Users|home)\/([A-Za-z0-9._-]+)/g,
    allow: /\/(?:Users|home)\/(?:<[^>]+>|\$\{?[A-Za-z_]|Shared\b|runner\b|user\b|username\b|you\b|example\b)/,
  },
  {
    id: 'win-user-path',
    label: 'Windows 用户目录路径',
    severity: 'block',
    pattern: /[A-Za-z]:\\\\?Users\\\\?([A-Za-z0-9._-]+)/gi,
    allow: /Users\\+(?:<[^>]+>|\$\{?[A-Za-z_]|Public\b)/i,
  },
  {
    id: 'local-drive-path',
    label: '本机磁盘路径',
    severity: 'block',
    pattern: /(?<![A-Za-z0-9])[D-Z]:\\[^\s"'`]+/gi,
    hint: '换成本机路径会暴露目录结构，用相对路径或占位符代替',
  },
  {
    id: 'public-ip',
    label: '公网 IP',
    severity: 'warn',
    pattern: /(?<![\d.])(?!10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.|0\.)(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g,
    hint: '确认这不是你自己的出口 IP',
  },
];

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function loadIgnore(root) {
  const file = path.join(root, '.privacyignore');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => ({ glob: l, re: globToRegExp(l) }));
}

function loadDenylist(root) {
  const file = path.join(root, '.privacy-denylist');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.toLowerCase());
}

function isIgnored(relPath, ignore) {
  return ignore.some(({ re }) => re.test(relPath));
}

function isBinary(relPath, buf) {
  if (SKIP_EXT.has(path.extname(relPath).toLowerCase())) return true;
  const probe = buf.subarray(0, 8000);
  return probe.includes(0);
}

function mask(value) {
  const s = String(value);
  if (s.length <= 6) return '***';
  return `${s.slice(0, 3)}***${s.slice(-2)}`;
}

/**
 * 扫一段文本。返回命中列表，方便单元测试。
 */
function scanText(text, relPath = 'inline', denylist = []) {
  const hits = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/privacy-allow/.test(line)) return;

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const m of line.matchAll(rule.pattern)) {
        const value = m[0];
        if (rule.allow && rule.allow.test(line)) continue;
        if (rule.validate && !rule.validate(value)) continue;
        hits.push({
          file: relPath,
          line: lineNo,
          rule: rule.id,
          label: rule.label,
          severity: rule.severity,
          value: mask(value),
          hint: rule.hint,
        });
        break; // 同一行同一规则只报一次
      }
    }

    for (const term of denylist) {
      if (term.length >= 3 && line.toLowerCase().includes(term)) {
        hits.push({
          file: relPath,
          line: lineNo,
          rule: 'denylist',
          label: '本地隐私名单',
          severity: 'block',
          value: mask(term),
          hint: '`.privacy-denylist` 里登记过的内容',
        });
        break;
      }
    }
  });

  return hits;
}

function listFiles(mode, files) {
  if (mode === 'files') return files;
  if (mode === 'staged') {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], { encoding: 'utf8' });
    return out.split('\0').filter(Boolean);
  }
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function readTracked(relPath, mode) {
  if (mode === 'staged') {
    return execFileSync('git', ['show', `:${relPath}`], { maxBuffer: MAX_BYTES * 2, encoding: 'buffer' });
  }
  const full = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath);
  return fs.readFileSync(full);
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main(argv) {
  const root = repoRoot();
  process.chdir(root);

  let mode = 'staged';
  let files = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') mode = 'all';
    else if (a === '--staged') mode = 'staged';
    else if (a === '--files') { mode = 'files'; files = argv.slice(i + 1); break; }
    else if (a === '-h' || a === '--help') {
      console.log('用法: node scripts/privacy-check.cjs [--staged|--all|--files <paths...>]');
      return 0;
    }
  }

  const ignore = loadIgnore(root);
  const denylist = loadDenylist(root);

  let selected;
  try {
    selected = listFiles(mode, files);
  } catch (err) {
    console.error('隐私检查：无法读取文件列表（不是 git 仓库？）', err.message);
    return 0;
  }

  const hits = [];
  const skipped = [];
  let scanned = 0;

  for (const relPath of selected) {
    if (isIgnored(relPath, ignore)) { skipped.push(relPath); continue; }

    const forbidden = FORBIDDEN_FILES.find(f => f.re.test(relPath));
    if (forbidden) {
      hits.push({
        file: relPath, line: 0, rule: 'forbidden-file', label: '不该入库的文件',
        severity: 'block', value: path.basename(relPath), hint: forbidden.why,
      });
      continue;
    }

    let buf;
    try {
      buf = readTracked(relPath, mode);
    } catch (_) {
      skipped.push(relPath);
      continue;
    }
    if (buf.length > MAX_BYTES) { skipped.push(relPath); continue; }
    if (isBinary(relPath, buf)) { skipped.push(relPath); continue; }

    scanned++;
    hits.push(...scanText(buf.toString('utf8'), relPath, denylist));
  }

  const blocked = hits.filter(h => h.severity === 'block');
  const warned = hits.filter(h => h.severity === 'warn');

  const modeText = mode === 'staged' ? '提交内容' : mode === 'all' ? '全部入库文件' : '指定文件';
  console.log(`隐私检查（${modeText}）：扫描 ${scanned} 个文件，跳过 ${skipped.length} 个`);

  for (const h of [...blocked, ...warned]) {
    const where = h.line > 0 ? `${h.file}:${h.line}` : h.file;
    const tag = h.severity === 'block' ? '✗' : '!';
    console.log(`  ${tag} ${where}  ${h.label}  ${h.value}${h.hint ? `  — ${h.hint}` : ''}`);
  }

  if (blocked.length === 0 && warned.length === 0) {
    console.log('  ✓ 没有发现个人信息 / 密钥 / 本机路径');
    return 0;
  }

  if (warned.length) console.log(`  ${warned.length} 处提醒（不拦截）`);
  if (blocked.length === 0) return 0;

  console.log('');
  console.log(`  拦截了 ${blocked.length} 处可能泄露本人信息的内容：`);
  console.log('    · 删掉它们，或换成占位符；');
  console.log('    · 确实是误报就在同一行加 `privacy-allow: 原因`；');
  console.log('    · 个人专属字符串写进 `.privacy-denylist`（本机生效，不会上传）。');
  return 1;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { scanText, isValidCnId, globToRegExp, RULES };
