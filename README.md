# lan-chat

局域网聊天室 + 文件互传，Electron 桌面应用（服务端零运行时依赖，仅用 Node 内置模块）。

一台机器（建议台式机）运行应用当服务器，同一局域网的其它电脑用浏览器访问即可聊天、传文件。

## 功能

- 实时文字聊天（SSE 推送，断线自动重连）
- 文件上传 / 下载 / 删除，拖拽上传，支持中文文件名与上传进度
- 图片消息在聊天里直接预览缩略图
- 在线用户列表（昵称 + 头像色）
- 深色 / 浅色主题切换
- 消息复制、按天分组、加入/离开提醒
- 系统托盘：关闭窗口最小化到托盘，服务继续运行
- 消息历史（最近 200 条）

## 怎么跑

### 方式一：Electron 桌面应用

```bash
npm install        # 首次装 electron 依赖
npm start          # 启动应用
```

打包成双击即用的安装包/绿色版：

```bash
npm run dist:win   # 产物在 dist/ 目录
```

### 方式二：只用网页版（不装 Electron）

```bash
node server.js     # 默认端口 3000，可 node server.js 8080
```

## 其它电脑怎么连

启动后终端会打印「局域网访问」地址（形如 `http://192.168.1.3:3000`），
同网段其它电脑用浏览器打开该地址即可，无需安装任何东西。

## 连接不上的排查

1. 三台电脑必须在同一网段（都是 `192.168.1.x`）。
2. 路由器关闭「AP 隔离 / 客户端隔离」。
3. Windows 防火墙首次运行要放行 3000 端口（勾「专用网络 → 允许访问」）。
   手动放行：
   ```powershell
   netsh advfirewall firewall add rule name="lan-chat" dir=in action=allow protocol=TCP localport=3000
   ```

## 说明

- 上传文件存在 `uploads/`（gitignore，不入库）；打包成应用后存到用户数据目录。
- 默认端口 3000，可改：`node server.js 8080` 或 `PORT=8080 npm start`。
- 这是局域网信任环境用的工具，没有登录鉴权。

## 结构

- `main.js` — Electron 主进程（启动服务端 + 窗口 + 托盘）
- `server.js` — HTTP 服务端（聊天 + 文件，零依赖）
- `public/` — 网页前端（原生 HTML/CSS/JS）
- `build/` — 应用图标等打包资源

## 约定

遵循本机规范：代码入口 `D:\Dev\bootstrap\AGENTS.md`，细则见 `dev-machine-layout` 技能。
密钥走 `.env`（不入库），示例见 `.env.example`。
