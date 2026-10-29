'use strict';

/**
 * electron-builder afterPack 钩子：macOS 上做 ad-hoc 签名。
 *
 * 为什么不直接交给 electron-builder：没有开发者证书时（build.mac.identity = null）
 * 它会整体跳过签名，产出的 .app 里 Info.plist 和可执行文件的签名对不上，
 * Apple Silicon 上双击会提示「已损坏」。这里用 `codesign --sign -`（ad-hoc）补一刀，
 * 本机和小范围分发就够用了。正式分发请配好证书 + 公证，那时这个钩子会自动跳过。
 */

const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const { appOutDir, packager } = context;
  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  const macOptions = packager.platformSpecificBuildOptions || {};

  // 配了证书（identity 不是 null）就交给 electron-builder 自己签
  if (macOptions.identity !== null && macOptions.identity !== undefined) return;

  try {
    execFileSync('xattr', ['-cr', appPath], { stdio: 'inherit' });
  } catch (_) {
    // 没有扩展属性可清也无所谓
  }

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`  • ad-hoc 签名完成：${path.basename(appPath)}`);
};
