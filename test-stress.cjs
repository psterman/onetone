// Stress test: rapid scroll back and forth, look for console errors and visible glitches
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      errors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Rapid back-and-forth
  const sequence = [0, 900, 1800, 2700, 3500, 2700, 1800, 900, 0, 2000, 1000, 3000, 1500, 2500];
  for (const y of sequence) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
  }

  // Wait and check final state
  await page.waitForTimeout(500);
  const final = await page.evaluate(() => {
    const out = {};
    ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
      const el = document.getElementById(id);
      const lens = el.querySelector('.camera-rig-lens');
      const lensStyle = window.getComputedStyle(lens);
      out[id] = {
        top: Math.round(el.getBoundingClientRect().top),
        vis: lensStyle.visibility,
        active: el.classList.contains('is-chapter-active'),
      };
    });
    return out;
  });
  console.log('Final state at scrollY ~2500:', JSON.stringify(final));

  console.log('\n=== Errors ===');
  if (errors.length === 0) console.log('(none)');
  else errors.forEach(e => console.log(e));

  await browser.close();
})();
