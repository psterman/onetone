// Verify: lens should be MOVING across the entire chapter scroll, not static
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const docInfo = await page.evaluate(() => {
    const out = { docHeight: document.documentElement.scrollHeight };
    ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const r = el.getBoundingClientRect();
        out[id] = { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
      }
    });
    return out;
  });
  console.log('Doc info:', JSON.stringify(docInfo));

  console.log('\n--- ch-trigger lens transform at every 50px ---');
  console.log('y       | top  | scale | opacity');
  for (let y = 900; y <= 1900; y += 50) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(60);
    const snap = await page.evaluate(() => {
      const lens = document.querySelector('#ch-trigger .camera-rig-lens');
      const cs = window.getComputedStyle(lens);
      const m = cs.transform.match(/matrix3d\(([^)]+)\)/);
      let sc = 1, ty = 0, op = 1;
      if (m) {
        const parts = m[1].split(',').map(s => parseFloat(s.trim()));
        ty = parts[13];
        sc = parts[0];
      }
      op = parseFloat(cs.opacity);
      const r = lens.getBoundingClientRect();
      return { sc: sc.toFixed(3), ty: Math.round(ty), op: op.toFixed(2), top: Math.round(r.top) };
    });
    console.log(`${String(y).padStart(5)}    | ${String(snap.top).padStart(4)} | ${snap.sc} | ${snap.op}`);
  }

  console.log('\nErrors:', errors.length === 0 ? '(none)' : errors.join('\n'));

  await browser.close();
})();
