// Verify lens transform with proper scale extraction
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

  // 抓 ch-trigger 完整 enter-breathe-exit 期间的 lens 状态
  console.log('--- ch-trigger full scroll ---');
  console.log('y       | scale  | ty     | op     | note');
  for (let y = 150; y <= 1700; y += 50) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(50);
    const snap = await page.evaluate(() => {
      const lens = document.querySelector('#ch-trigger .camera-rig-lens');
      const inline = lens.getAttribute('style') || '';
      // 解析 scale(...)
      const scaleMatch = inline.match(/scale\(([\d.]+)/);
      const translateMatch = inline.match(/translate3d\(([^)]+)\)/);
      const opMatch = inline.match(/opacity:\s*([\d.]+)/);
      const sc = scaleMatch ? parseFloat(scaleMatch[1]) : 1;
      const ty = translateMatch ? parseFloat(translateMatch[1].split(',')[1]) : 0;
      const op = opMatch ? parseFloat(opMatch[1]) : 1;
      return { sc, ty, op };
    });
    let note = '';
    if (snap.sc !== 1) note += 'scale动!';
    if (snap.ty !== 0) note += 'y动!';
    if (snap.op < 1) note += 'fade';
    if (note) note = '  ← ' + note;
    console.log(`${String(y).padStart(5)}    | ${snap.sc.toFixed(3).padStart(6)} | ${String(snap.ty.toFixed(0)).padStart(5)} | ${snap.op.toFixed(2)} |${note}`);
  }

  console.log('\nErrors:', errors.length === 0 ? '(none)' : errors.join('\n'));

  await browser.close();
})();
