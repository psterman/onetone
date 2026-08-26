// Test: scan lens transform at multiple scroll positions to confirm cinematic motion
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 取一个慢速扫掠：每 5vh 抓一帧的 transform
  const samples = [];
  for (let y = 800; y <= 3700; y += 80) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(120);
    const snap = await page.evaluate(() => {
      const out = {};
      ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
        const el = document.getElementById(id);
        const lens = el.querySelector('.camera-rig-lens');
        const cs = window.getComputedStyle(lens);
        // 解析 transform matrix 拿 y / scale / opacity
        const m = cs.transform.match(/matrix3d\(([^)]+)\)/);
        let ty = 0, sc = 1, op = 1;
        if (m) {
          const parts = m[1].split(',').map(s => parseFloat(s.trim()));
          ty = parts[13];
          sc = parts[0];
        }
        op = parseFloat(cs.opacity);
        out[id] = {
          ty: Math.round(ty),
          sc: sc.toFixed(3),
          op: op.toFixed(2),
          vis: cs.visibility,
        };
      });
      return out;
    });
    samples.push({ y, ...snap });
  }

  console.log('y       | ch-trigger            | ch-voice              | ch-softpad');
  console.log('--------|----------------------|----------------------|----------------------');
  for (const s of samples) {
    const f = (lens) => `y=${String(lens.ty).padStart(5)} sc=${lens.sc} op=${lens.op} ${lens.vis[0]}`;
    console.log(`${String(s.y).padStart(5)}    | ${f(s['ch-trigger']).padEnd(22)} | ${f(s['ch-voice']).padEnd(22)} | ${f(s['ch-softpad'])}`);
  }

  await browser.close();
})();
