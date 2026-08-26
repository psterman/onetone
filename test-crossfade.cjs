// Verify crossfade: during transition, are TWO chapters' lenses visible simultaneously?
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 关键切换区：ch1→ch2 在 pin 100vh 末尾，ch2→ch3 在 pin 215vh 末尾
  // totalSegments = 315, pin start = 836
  // ch1 end = 836 + 100vh = 1736
  // ch2 end = 836 + 215vh = 1736 + 115vh = 2771
  const transitions = [
    { name: 'ch1→ch2', yStart: 1620, yEnd: 1820 },
    { name: 'ch2→ch3', yStart: 2660, yEnd: 2860 },
  ];

  for (const t of transitions) {
    console.log(`\n--- ${t.name} transition ---`);
    for (let y = t.yStart; y <= t.yEnd; y += 30) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(120);
      const snap = await page.evaluate(() => {
        const out = {};
        ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
          const el = document.getElementById(id);
          const lens = el.querySelector('.camera-rig-lens');
          const cs = window.getComputedStyle(lens);
          out[id] = { vis: cs.visibility, op: parseFloat(cs.opacity).toFixed(2) };
        });
        return out;
      });
      const list = Object.entries(snap).map(([k, v]) => `${k.replace('ch-','')}:${v.vis[0]}(${v.op})`).join(' ');
      console.log(`y=${y}  ${list}`);
    }
  }

  await browser.close();
})();
