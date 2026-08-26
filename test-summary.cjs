// Compact test: just check visibility of each chapter's lens at each scroll point
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const scrollPoints = [
    { y: 0, label: 'hero' },
    { y: 850, label: 'pin start' },
    { y: 1100, label: 'ch-trigger enter' },
    { y: 1700, label: 'ch-trigger exit' },
    { y: 1900, label: 'ch-voice enter' },
    { y: 2700, label: 'ch-voice exit' },
    { y: 3000, label: 'ch-softpad enter' },
    { y: 3500, label: 'ch-softpad exit' },
    { y: 4000, label: 'past pin' },
  ];

  for (const point of scrollPoints) {
    await page.evaluate((y) => window.scrollTo(0, y), point.y);
    await page.waitForTimeout(400);

    const info = await page.evaluate(() => {
      const out = {};
      ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
        const el = document.getElementById(id);
        const lens = el.querySelector('.camera-rig-lens');
        const lensStyle = window.getComputedStyle(lens);
        out[id] = {
          active: el.classList.contains('is-chapter-active'),
          visible: el.classList.contains('is-chapter-visible'),
          lensVis: lensStyle.visibility,
          top: Math.round(el.getBoundingClientRect().top),
        };
      });
      return out;
    });
    const line = Object.entries(info).map(([k, v]) => {
      return `${k}:${v.lensVis[0]}${v.active ? '*' : ''}${v.visible ? '+' : ''}@${v.top}`;
    }).join('  ');
    console.log(`y=${String(point.y).padStart(4)} (${point.label.padEnd(20)}) ${line}`);
  }

  await browser.close();
})();
