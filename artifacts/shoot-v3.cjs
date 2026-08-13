// 截 6 张:v3 各状态(强制关 popover)
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  async function closeAnyPopover() {
    await page.evaluate(() => {
      if (typeof closePopover === 'function') closePopover();
    });
    await page.waitForTimeout(200);
  }

  await page.goto('http://127.0.0.1:47291/big-mode.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. 主页
  await page.screenshot({ path: path.join(__dirname, 'demo-v3-1-home.png'), fullPage: false });
  console.log('1 home');

  // 2. 滚到 Chrome,点 key
  await page.evaluate(() => document.getElementById('sec-Chrome').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.locator('#sec-Chrome .habit').first().locator('.key').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'demo-v3-2-keypop.png') });
  console.log('2 key popover');
  await closeAnyPopover();

  // 3. 点 action
  await page.locator('#sec-Chrome .habit').first().locator('.action-tag').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'demo-v3-3-actionpop.png') });
  console.log('3 action popover');
  await closeAnyPopover();

  // 4. 点 app
  await page.locator('#sec-Chrome .habit').first().locator('.app-tag').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'demo-v3-4-apppop.png') });
  console.log('4 app popover');
  await closeAnyPopover();

  // 5. 点 + 加新
  await page.evaluate(() => document.getElementById('sec-Chrome').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.locator('#sec-Chrome .add-habit').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v3-5-addstep.png') });
  console.log('5 add step 1');
  await page.locator('.edit-head .back').click();
  await page.waitForTimeout(400);

  // 6. 试一下
  await page.locator('#sec-Chrome .habit').first().locator('.hbtn.primary').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, 'demo-v3-6-demo.png') });
  console.log('6 demo');

  await browser.close();
  console.log('done');
})();
