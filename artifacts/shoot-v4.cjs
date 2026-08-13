// v4:3 tab 切换截图
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', err => console.log('ERR:', err.message));

  await page.goto('http://127.0.0.1:47291/big-mode.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. 小白模式默认(Chrome / 按键 / 启动输入)
  await page.screenshot({ path: path.join(__dirname, 'demo-v4-1-novice.png'), fullPage: false });
  console.log('1 novice');

  // 2. 切到快速设置
  await page.click('.mode-tab[data-tab="quick"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v4-2-quick.png'), fullPage: false });
  console.log('2 quick');

  // 3. 切到程序员模式
  await page.click('.mode-tab[data-tab="pro"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v4-3-pro.png'), fullPage: false });
  console.log('3 pro');

  // 4. 回到小白模式,切到"语音"维度
  await page.click('.mode-tab[data-tab="novice"]');
  await page.waitForTimeout(400);
  await page.click('.dim-tab:has-text("语音")');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'demo-v4-4-novice-voice.png'), fullPage: false });
  console.log('4 novice voice');

  // 5. 切回按键 + 启动,点 +加一个 走 4 步
  await page.click('.dim-tab:has-text("按键")');
  await page.waitForTimeout(300);
  await page.click('.scene-chip:has-text("启动输入")');
  await page.waitForTimeout(300);
  await page.locator('.add-inline').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v4-5-addstep.png'), fullPage: false });
  console.log('5 add step');

  await browser.close();
  console.log('done');
})();
