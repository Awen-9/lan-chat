'use strict';

/**
 * 隐私检查器自己的单元测试：node --test scripts/privacy-check.test.cjs
 *
 * 注意：测试用例里的手机号 / 身份证 / 邮箱 / 本机路径都是「用变量拼出来的」，
 * 不在源码里写成完整字面量，否则这个测试文件自己就会被检查器拦下来。
 */

const test = require('node:test');
const assert = require('node:assert');

const { scanText, isValidCnId } = require('./privacy-check.cjs');

const rules = hits => hits.map(h => h.rule);

test('手机号会被拦截', () => {
  const phone = '138' + '12345678';
  assert.deepStrictEqual(rules(scanText(`联系电话 ${phone}`)), ['cn-mobile']);
});

test('常见测试号码不误报', () => {
  const fake = '138' + '00138000';
  assert.deepStrictEqual(scanText(`示例号码 ${fake}`), []);
});

test('邮箱会被拦截，示例域名放行', () => {
  const mail = 'zhang.san' + '@' + 'qq.com';
  assert.deepStrictEqual(rules(scanText(`联系 ${mail}`)), ['email']);
  assert.deepStrictEqual(scanText('联系 someone@example.com'), []);
});

test('@2x 文件名不会被当成邮箱', () => {
  assert.deepStrictEqual(scanText('build/trayTemplate@2x.png'), []);
});

test('身份证按校验位判断，假号码不误报', () => {
  const id = '11010519491231002' + 'X';
  assert.strictEqual(isValidCnId(id), true);
  assert.deepStrictEqual(rules(scanText(`身份证 ${id}`)), ['cn-id']);
  assert.strictEqual(isValidCnId('110105194912310021'), false);
  assert.deepStrictEqual(scanText('身份证 110105194912310021'), []);
});

test('本机家目录路径会被拦截，占位符放行', () => {
  const home = ['', 'Users', 'wuzeyu', 'secret.txt'].join('/');
  assert.deepStrictEqual(rules(scanText(`文件在 ${home}`)), ['home-path']);
  assert.deepStrictEqual(scanText('文件在 /Users/<你的用户名>/secret.txt'), []);
});

test('Windows 个人目录与本地盘符会被拦截', () => {
  const winHome = 'C' + ':' + '\\' + 'Users' + '\\' + 'wuzeyu';
  assert.deepStrictEqual(rules(scanText(`路径 ${winHome}`)), ['win-user-path']);

  const drive = 'D' + ':' + '\\' + 'Dev' + '\\' + 'bootstrap';
  assert.deepStrictEqual(rules(scanText(`路径 ${drive}`)), ['local-drive-path']);
});

test('密钥类内容会被拦截', () => {
  const token = 'ghp_' + 'a'.repeat(36);
  assert.deepStrictEqual(rules(scanText(`token: ${token}`)), ['github-token']);

  const secret = 'apiKey = "' + 'abcdef1234567890' + '"';
  assert.deepStrictEqual(rules(scanText(secret)), ['credential']);
  assert.deepStrictEqual(scanText('apiKey = "your-api-key-here"'), []);
});

test('privacy-allow 可以放行整行', () => {
  const phone = '138' + '12345678';
  assert.deepStrictEqual(scanText(`示例 ${phone} // privacy-allow: 文档里的假号码`), []);
});

test('干净文本不产生任何命中', () => {
  assert.deepStrictEqual(scanText('局域网聊天室，端口 3000，浏览器打开即可。'), []);
});
