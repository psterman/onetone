// Stress test with new clip-path transition
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

  const seq = [0, 950, 1750, 1900, 2100, 2700, 2900, 3100, 3500, 2700, 1900, 1000, 0, 2200];
  for (const y of seq) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
  }

  console.log('Errors:', errors.length === 0 ? '(none)' : errors.length);
  if (errors.length) errors.forEach(e => console.log('  ' + e));

  await browser.close();
})();
