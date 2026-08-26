// Quick page diagnostic — open the page, capture console + check chapter visibility at different scroll positions
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Scroll positions to inspect
  const scrollPoints = [
    { y: 0, label: 'hero' },
    { y: 900, label: 'ch-trigger' },
    { y: 2000, label: 'ch-voice' },
    { y: 3200, label: 'ch-softpad' },
    { y: 4200, label: 'brands' },
  ];

  for (const point of scrollPoints) {
    await page.evaluate((y) => window.scrollTo(0, y), point.y);
    await page.waitForTimeout(800);

    const info = await page.evaluate(() => {
      const result = {};
      ['sec-hero', 'ch-trigger', 'ch-voice', 'ch-softpad', 'sec-brands', 'sec-quotes'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) { result[id] = 'NOT_FOUND'; return; }
        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const lens = el.querySelector('.camera-rig-lens') || el.querySelector('.camera-rig');
        let lensInfo = null;
        if (lens) {
          const lcs = window.getComputedStyle(lens);
          lensInfo = {
            visibility: lcs.visibility,
            opacity: lcs.opacity,
            transform: lcs.transform.slice(0, 80),
            display: lcs.display,
          };
        }
        const demoEl = el.querySelector('.chapter-demo');
        let demoInfo = null;
        if (demoEl) {
          const dr = demoEl.getBoundingClientRect();
          demoInfo = {
            top: Math.round(dr.top),
            height: Math.round(dr.height),
            visible: dr.top < window.innerHeight && dr.bottom > 0,
            textContent: (demoEl.textContent || '').trim().slice(0, 60),
          };
        }
        result[id] = {
          top: Math.round(r.top),
          height: Math.round(r.height),
          inViewport: r.top < window.innerHeight && r.bottom > 0,
          isStoryActive: el.classList.contains('is-story-active'),
          isStackVisible: el.classList.contains('is-stack-visible'),
          isChapterPinned: el.classList.contains('is-chapter-pinned'),
          bg: cs.backgroundColor,
          lensInfo,
          demoInfo,
        };
      });
      return {
        scrollY: window.scrollY,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        chapters: result,
      };
    });

    console.log(`\n=== scroll @ ${point.y} (${point.label}) ===`);
    console.log(JSON.stringify(info, null, 2));
  }

  console.log('\n=== console messages ===');
  consoleMessages.forEach(m => console.log(m));

  await browser.close();
})();
