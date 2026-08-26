// Check pin-spacer at scrollY past pin end
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.scrollTo(0, 4000));
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const spacer = document.querySelector('.pin-spacer');
    const world = document.getElementById('story-world');
    return {
      spacer: {
        box: spacer.getBoundingClientRect(),
        style: {
          position: window.getComputedStyle(spacer).position,
          display: window.getComputedStyle(spacer).display,
          height: window.getComputedStyle(spacer).height,
          paddingTop: window.getComputedStyle(spacer).paddingTop,
          paddingBottom: window.getComputedStyle(spacer).paddingBottom,
          transform: window.getComputedStyle(spacer).transform,
        },
      },
      world: {
        box: world.getBoundingClientRect(),
        style: {
          position: window.getComputedStyle(world).position,
          top: window.getComputedStyle(world).top,
          transform: window.getComputedStyle(world).transform,
          height: window.getComputedStyle(world).height,
        },
      },
      chapters: ['ch-trigger', 'ch-voice', 'ch-softpad'].map(id => {
        const el = document.getElementById(id);
        return {
          id,
          box: el.getBoundingClientRect(),
          style: {
            position: window.getComputedStyle(el).position,
            top: window.getComputedStyle(el).top,
            transform: window.getComputedStyle(el).transform,
            marginTop: window.getComputedStyle(el).marginTop,
          },
        };
      }),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
