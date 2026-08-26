// Test all transform axes including rotateX/Y/Z
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  for (let y = 1700; y <= 2900; y += 100) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
    const snap = await page.evaluate(() => {
      const out = {};
      ['ch-voice'].forEach(id => {
        const el = document.getElementById(id);
        const lens = el.querySelector('.camera-rig-lens');
        const cs = window.getComputedStyle(lens);
        out[id] = {
          transform: cs.transform.slice(0, 120),
        };
      });
      return out;
    });
    console.log(`y=${y}  voice: ${snap['ch-voice'].transform}`);
  }

  await browser.close();
})();
