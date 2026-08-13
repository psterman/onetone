// 截 5 张图:主页 / 调试场景 / 试一下 / 编辑步骤 1 / 编辑步骤 2
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto('http://127.0.0.1:47291/big-mode.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. 主页(写代码场景)
  await page.screenshot({ path: path.join(__dirname, 'demo-v2-1-home.png') });
  console.log('1 home');

  // 2. 切换到"调试"场景
  await page.click('.scene:has-text("调试")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v2-2-debug.png') });
  console.log('2 debug');

  // 切回"写代码"
  await page.click('.scene:has-text("写代码")');
  await page.waitForTimeout(500);

  // 3. 打开"试一下"演示 - 第一个 habit (Chrome 写代码)
  await page.click('.habit:first-child .hbtn.primary');
  await page.waitForTimeout(1800); // 等到第一段 typewrite 完
  await page.screenshot({ path: path.join(__dirname, 'demo-v2-3-demo.png') });
  console.log('3 demo');

  // 关闭
  await page.click('.demo-close');
  await page.waitForTimeout(400);

  // 4. 打开"改这个" - 步骤 1
  await page.click('.habit:first-child .hbtn.secondary');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v2-4-edit1.png') });
  console.log('4 edit step 1');

  // 5. 切到步骤 2
  await page.click('#next-btn');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v2-5-edit2.png') });
  console.log('5 edit step 2');

  await browser.close();
  console.log('done');
})();
