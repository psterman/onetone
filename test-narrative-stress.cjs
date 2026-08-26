// Stress test: rapid back-and-forth, look for errors and visible glitches
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1) 快速上下滚
  const seq = [0, 900, 1800, 2700, 3500, 2700, 1800, 900, 0, 2400, 1200, 3000, 2000, 2700];
  for (const y of seq) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
  }

  // 2) 切英文
  await page.click('#langToggle');
  await page.waitForTimeout(500);
  // 3) 再快速滚一遍
  for (const y of [1500, 2200, 2900, 1800, 800, 2500]) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
  }

  console.log('Stress test done. Errors:', errors.length === 0 ? '(none)' : errors.length);
  if (errors.length) errors.forEach(e => console.log('  ' + e));

  await browser.close();
})();
