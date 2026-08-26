// Verify clip-path behavior during chapter transitions
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 抓 clip-path 在章节切换时的变化
  for (let y = 800; y <= 3700; y += 100) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
    const snap = await page.evaluate(() => {
      const out = {};
      ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
        const el = document.getElementById(id);
        const lens = el.querySelector('.camera-rig-lens');
        const cs = window.getComputedStyle(lens);
        out[id] = {
          clip: cs.clipPath.slice(0, 30),
          vis: cs.visibility,
          op: parseFloat(cs.opacity).toFixed(2),
        };
      });
      return out;
    });
    const fmt = (lens) => {
      const vis = lens.vis === 'visible' ? 'v' : 'h';
      return `${vis} ${lens.clip}`;
    };
    console.log(`y=${String(y).padStart(4)} | trigger:${fmt(snap['ch-trigger']).padEnd(28)} voice:${fmt(snap['ch-voice']).padEnd(28)} softpad:${fmt(snap['ch-softpad'])}`);
  }

  await browser.close();
})();
