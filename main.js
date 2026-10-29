'use strict';

/**
 * Electron 主进程：启动内置服务端 + 打开应用窗口 + 系统托盘。
 * 同一份代码跑 Windows / macOS / Linux：托盘图标、窗口关闭行为和菜单按平台分支。
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, lanAddresses } = require('./server');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

const APP_ID = 'com.awen9.lanchat';
const APP_NAME = '局域网聊天室';
const PORT = Number(process.env.PORT || 3000);
// 用 127.0.0.1 而不是 localhost：某些系统 localhost 会先解析到 ::1，而服务端只监听 IPv4
const LOCAL_URL = `http://127.0.0.1:${PORT}`;

let win = null;
let tray = null;
let quitting = false;

app.setName(APP_NAME);
if (IS_WIN) app.setAppUserModelId(APP_ID);

function asset(name) {
  const p = path.join(__dirname, 'build', name);
  return fs.existsSync(p) ? p : null;
}

/** 托盘菜单里直接给出别人能用的地址，省得再去终端找（过滤虚拟网卡，和启动横幅同一套逻辑） */
function lanUrl() {
  const [addr] = lanAddresses();
  return addr ? `http://${addr}:${PORT}` : LOCAL_URL;
}

function showWindow() {
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    title: APP_NAME,
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: asset('icon.png') || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 服务端刚 listen 时窗口可能还没就绪，失败就稍后重试
  (async () => {
    for (let i = 0; i < 30; i++) {
      try {
        await win.loadURL(LOCAL_URL);
        return;
      } catch (_) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
  })();

  win.on('close', e => {
    if (!quitting) {
      e.preventDefault();
      // Windows/Linux：最小化到托盘；macOS：保留 Dock 图标，点 Dock 或菜单栏图标再回来
      win.hide();
      if (IS_MAC) win.setSkipTaskbar(false);
    }
  });

  win.on('closed', () => { win = null; });

  // 新窗口/外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function trayImage() {
  if (IS_MAC) {
    // 菜单栏需要 16pt 模板图，文件名带 Template 才会随深浅色自动反色
    const tpl = asset('trayTemplate.png');
    if (tpl) {
      const img = nativeImage.createFromPath(tpl);
      if (!img.isEmpty()) return { image: img, template: true };
    }
  }
  if (IS_WIN) {
    const ico = asset('icon.ico');
    if (ico) {
      const img = nativeImage.createFromPath(ico).resize({ width: 16, height: 16 });
      if (!img.isEmpty()) return { image: img, template: false };
    }
  }
  const png = asset('icon.png');
  if (!png) return null;
  const img = nativeImage.createFromPath(png).resize({ width: 16, height: 16 });
  return img.isEmpty() ? null : { image: img, template: false };
}

function createTray() {
  const icon = trayImage();
  if (!icon) return;
  if (icon.template) icon.image.setTemplateImage(true);

  tray = new Tray(icon.image);
  tray.setToolTip(APP_NAME);

  const menu = Menu.buildFromTemplate([
    { label: '显示窗口', click: showWindow },
    {
      label: `局域网地址 ${lanUrl()}（点击复制）`,
      click: () => clipboard.writeText(lanUrl()),
    },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);

  // macOS 上是菜单栏图标，单击默认弹出菜单；Windows/Linux 单击直接开窗口
  if (!IS_MAC) {
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
  }
}

function buildAppMenu() {
  if (!IS_MAC) return; // Windows/Linux 用窗口内的默认菜单即可
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `关于 ${APP_NAME}` },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${APP_NAME}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${APP_NAME}` },
      ],
    },
    { role: 'editMenu', label: '编辑' },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { type: 'separator' },
        { label: '重新打开窗口', accelerator: 'Cmd+0', click: showWindow },
        { role: 'close', label: '隐藏窗口' },
      ],
    },
  ]));
}

function bootstrap() {
  // 打包后把上传目录放到可写位置（app.asar 只读）
  const uploadDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'uploads')
    : path.join(__dirname, 'uploads');

  startServer(PORT, { uploadDir });

  buildAppMenu();
  createWindow();
  createTray();

  if (IS_MAC && !app.isPackaged) {
    // 开发态沿用应用图标，避免 Dock 里显示 Electron 默认图标
    const png = asset('icon.png');
    if (png && app.dock) app.dock.setIcon(png);
  }

  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
  });
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    bootstrap();

    app.on('activate', () => {
      // macOS：点 Dock 图标时窗口可能只是被隐藏了
      if (!win) createWindow();
      else showWindow();
    });
  });

  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {
    // 保持托盘/服务运行；真正退出走托盘菜单或 Cmd+Q
  });
} else {
  // 已经有一个实例在跑，交给它把窗口顶到前面
  app.quit();
}
