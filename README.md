# lan-chat

局域网聊天室 + 文件互传，Electron 桌面应用（服务端零运行时依赖，仅用 Node 内置模块）。

一套代码同时支持 **Windows / macOS / Linux**：一台机器（建议台式机）运行应用当服务器，
同一局域网的其它电脑用浏览器访问即可聊天、传文件。

## 功能

- 实时文字聊天（SSE 推送，断线自动重连）
- 文件上传 / 下载 / 删除，拖拽上传，支持中文文件名与上传进度
- 图片消息在聊天里直接预览缩略图
- 在线用户列表（昵称 + 头像色）
- 深色 / 浅色主题切换
- 消息复制、按天分组、加入/离开提醒
- 系统托盘 / 菜单栏：关闭窗口收进托盘，服务继续运行
- 消息历史（最近 200 条）

## 怎么跑

先装依赖（首次需要联网下载 Electron，国内网络慢可以加镜像）：

```bash
npm install
# 国内镜像：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

### 方式一：Electron 桌面应用（三平台通用）

```bash
npm start
```

- **Windows**：窗口 + 任务栏右下角托盘图标；点 × 收进托盘，右键托盘「退出」才真正退出。
- **macOS**：窗口 + 菜单栏图标；点红点 / ⌘W 隐藏窗口（服务继续跑），
  点 Dock 图标或菜单栏图标回到窗口，⌘Q 退出。
- **Linux**：同 Windows（托盘依赖桌面环境支持 StatusNotifier / AppIndicator）。

### 方式二：只用网页版（不装 Electron）

```bash
node server.js        # 默认端口 3000，可 node server.js 8080
```

两种方式都会在终端打印访问地址，形如：

```
本机访问:     http://127.0.0.1:3000
局域网访问:   http://192.168.1.3:3000
```

## 打包

```bash
npm run dist:win     # Windows：NSIS 安装包 + 免安装版
npm run dist:mac     # macOS：dmg + zip（默认当前架构）
npm run dist:linux   # Linux：AppImage
```

产物都在 `dist/`。`npm run dist` 等于按当前系统打包。

要一次出 Apple Silicon 和 Intel 两个架构：

```bash
npm run dist:mac -- --arm64 --x64
```

`dist:win` 建议在 Windows 上跑（macOS 上跑需要装 wine）。

macOS 包默认用 **ad-hoc 签名**（`build.mac.identity: null` + `scripts/after-pack.cjs`），
本机和小范围分发够用；拷到别人电脑时第一次打开仍需确认：

1. 在「访达」里右键 App → 「打开」（或到「系统设置 › 隐私与安全性」点「仍要打开」）；
2. 或者命令行去掉隔离标记：

   ```bash
   xattr -dr com.apple.quarantine "/Applications/局域网聊天室.app"
   ```

要正式分发（过公证）就把 `mac.identity` 换成你的开发者证书并配置 `notarize`，
摘掉 `identity: null` 后 ad-hoc 钩子会自动跳过。

Windows 包保持 `signAndEditExecutable: false`，不签名，避免 winCodeSign 符号链接报错。

打包时如果卡在下载 Electron 或报 `x509: certificate signed by unknown authority`
（公司代理 / 证书拦截），可以走镜像：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm run dist:mac
```

## 其它电脑怎么连

启动后终端会打印「局域网访问」地址（形如 `http://192.168.x.x:3000`），
同网段其它电脑用浏览器打开该地址即可，无需安装任何东西。

## 连接不上的排查

1. 几台电脑必须在同一网段（都是 `192.168.1.x`）。
2. 路由器关闭「AP 隔离 / 客户端隔离」。
3. 首次运行要放行端口 3000：
   - **Windows**：防火墙提示里勾「专用网络 → 允许访问」，或手动放行
     ```powershell
     netsh advfirewall firewall add rule name="lan-chat" dir=in action=allow protocol=TCP localport=3000
     ```
   - **macOS**：弹出「允许局域网连接」时点「允许」；误点了拒绝就到
     「系统设置 › 隐私与安全性 › 本地网络」重新打开。系统自带防火墙若开启，
     也要在「系统设置 › 网络 › 防火墙 › 选项」里放行本应用。
   - **Linux**：`sudo ufw allow 3000/tcp`。

## 说明

- 上传文件存在 `uploads/`（gitignore，不入库）；打包成应用后存到用户数据目录
  （macOS 是 `~/Library/Application Support/局域网聊天室/uploads`，
  Windows 是 `%APPDATA%\局域网聊天室\uploads`）。
- 默认端口 3000，可改：`node server.js 8080` 或 `PORT=8080 npm start`
  （Windows PowerShell：`$env:PORT=8080; npm start`）。
- 这是局域网信任环境用的工具，没有登录鉴权。

## 隐私保护

- 应用只在局域网内收发，不向任何第三方服务器上报数据（见 [SECURITY.md](SECURITY.md)）。
- 仓库带自动检查，**提交、推送、CI 三个环节都会拦截**手机号、身份证号、邮箱、密钥、本机路径等内容，
  避免本人信息被传到 GitHub：

```bash
npm run hooks:install     # 装 git 钩子（npm install 时也会自动装）
npm run check:privacy     # 手动全量扫描
```

  误报可以在同一行写 `privacy-allow: 原因`，或用 `.privacyignore` 忽略整个文件；
  自己的真名、手机号等写进 `.privacy-denylist`（已 gitignore，只在本机生效）。

## 结构

- `main.js` — Electron 主进程（启动服务端 + 窗口 + 托盘，平台差异都在这里）
- `server.js` — HTTP 服务端（聊天 + 文件，零依赖）
- `public/` — 网页前端（原生 HTML/CSS/JS）
- `build/` — 应用图标（`icon.ico` Windows / `icon.icns` macOS / `trayTemplate*.png` 菜单栏模板图）
- `scripts/after-pack.cjs` — 打包钩子，macOS 上补 ad-hoc 签名
- `scripts/privacy-check.cjs` — 隐私检查器（零依赖，钩子与 CI 共用）
- `.githooks/` — pre-commit / pre-push 钩子
- `.privacyignore` / `.privacy-denylist.example` — 检查白名单与本地隐私名单示例

## 约定

密钥走 `.env`（不入库），示例见 `.env.example`。
