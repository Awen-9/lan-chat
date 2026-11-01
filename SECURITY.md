# 安全说明

## 定位

本项目是一个**局域网内**使用的聊天与文件互传工具，仅应在**受信任的本地网络**中使用。

## 重要提醒

- 本项目**默认没有登录鉴权，也没有传输加密**，同一局域网内的任何设备都可以访问并看到聊天与文件。可设置 `LAN_CHAT_PASSCODE` 启用一个可选口令（见下方「可选口令」）。
- **请勿通过本工具上传或发送个人隐私信息、身份证件、密码、密钥、token 等敏感内容。**
- 上传的文件会保存在运行服务端的那台机器上，请妥善保管该机器与其中的文件。

## 可选口令

- 设置环境变量 `LAN_CHAT_PASSCODE` 后，除静态页面和登录接口（`POST /api/login`）外，所有 API 都需要登录后才可访问。
- 口令用 `crypto.timingSafeEqual` 比较；登录成功后服务端下发一个随机 token，存到 `HttpOnly; SameSite=Strict` 的 cookie 里。
- **这只是弱防护**：口令与内容仍在局域网内明文传输，防的是「同网段陌生人顺手打开」，不防主动窃听或口令爆破。不要依赖它保护真正的敏感数据。

## 数据去向

- 应用只监听本机端口，聊天与文件**只在局域网内传输**，不向任何第三方服务器上报。
- 上传的文件仅保存在服务端那台机器的用户数据目录，不会离开局域网。

## 提交前自动检查（防止本人信息被传到 GitHub）

仓库自带一个零依赖的隐私检查器，提交、推送、CI 三个环节都会跑：

| 环节 | 触发方式 | 命令 |
| --- | --- | --- |
| 提交前 | `.githooks/pre-commit` | `node scripts/privacy-check.cjs --staged` |
| 推送前 | `.githooks/pre-push` | `node scripts/privacy-check.cjs --all` |
| CI | `.github/workflows/secret-scan.yml` 的 `privacy` job | `node scripts/privacy-check.cjs --all` |

装钩子（`npm install` 时会自动执行一次）：

```bash
npm run hooks:install
```

会拦下的内容：

- 手机号、身份证号（按校验位判断，假号码不误报）、邮箱
- 私钥、GitHub / AWS / AI 服务的 token、口令赋值
- 本机家目录、Windows 用户目录、`D:` 盘符开头的本机路径
- `.env`、`*.pem`、SSH 私钥、`uploads/` 等不该入库的文件

放行方式：

- 同一行加 `privacy-allow: 原因`，只放行这一行；
- 用 `.privacyignore` 忽略整个文件（锁文件、构建产物已默认忽略）；
- 工具只能匹配格式；**「这段内容会不会指向某个真人」由 agent 提交前通读 diff 判断**，
  清单见仓库根目录的 `AGENTS.md`，不需要向 agent 交代任何个人信息。

```bash
npm run check:privacy          # 手动全量扫描
npm run check:privacy:staged   # 只扫暂存区
npm run test:privacy           # 检查器自身的单元测试
```

## 报告安全问题

如发现安全漏洞，请通过 GitHub Issue 报告。请避免在公开 Issue 中披露可被直接利用的细节，必要时先私下联系维护者。
