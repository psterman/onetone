// Final verification: scroll through, check chapter visibility and lens transform at every step
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

  // 文档高度 + 章节位置
  const docInfo = await page.evaluate(() => {
    const out = { docHeight: document.documentElement.scrollHeight, viewport: window.innerHeight };
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

  // 每 100vh 抓一帧
  console.log('\ny       | ch-trigger                  | ch-voice                     | ch-softpad');
  console.log('--------|-----------------------------|------------------------------|-----------------------------');
  for (let y = 0; y <= docInfo.docHeight; y += 150) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(100);
    const snap = await page.evaluate(() => {
      const out = {};
      ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const lens = el.querySelector('.camera-rig-lens');
        const cs = window.getComputedStyle(lens);
        out[id] = {
          top: Math.round(r.top),
          inView: r.top < window.innerHeight && r.bottom > 0,
          ty: cs.transform.includes('matrix') ? 'transform' : 'none',
          op: parseFloat(cs.opacity).toFixed(2),
        };
      });
      return out;
    });
    const f = (lens) => lens ? `top=${String(lens.top).padStart(4)} ${lens.inView ? 'VIEW' : '----'} op=${lens.op}` : 'n/a';
    console.log(`${String(y).padStart(5)}    | ${f(snap['ch-trigger']).padEnd(28)} | ${f(snap['ch-voice']).padEnd(29)} | ${f(snap['ch-softpad'])}`);
  }

  console.log('\n=== Errors ===');
  console.log(errors.length === 0 ? '(none)' : errors.join('\n'));

  await browser.close();
})();
