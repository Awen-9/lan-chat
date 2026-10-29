'use strict';

/**
 * Electron 主进程：启动内置服务端 + 打开应用窗口 + 系统托盘。
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer, getPort } = require('./server');

const PORT = Number(process.env.PORT || 3000);

let win = null;
let tray = null;
let quitting = false;

function iconPath() {
  const p = path.join(__dirname, 'build', 'icon.png');
  return fs.existsSync(p) ? p : null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    title: '局域网聊天室',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: iconPath() || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://localhost:${PORT}`);

  win.on('close', e => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => { win = null; });

  // 新窗口/外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  const p = iconPath();
  if (!p) return;
  const img = nativeImage.createFromPath(p);
  tray = new Tray(img);
  tray.setToolTip('局域网聊天室');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: () => win && win.show() },
    {
      label: `局域网地址 http://localhost:${PORT}`,
      enabled: false,
    },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { if (win) win.show(); });
}

app.whenReady().then(() => {
  // 打包后把上传目录放到可写位置（app.asar 只读）
  const uploadDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'uploads')
    : path.join(__dirname, 'uploads');
  startServer(PORT, { uploadDir });
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (win) win.show();
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  // 保持托盘/服务运行；真正退出走托盘「退出」
});
