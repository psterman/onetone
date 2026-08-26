// Check chapter layout and class state
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const result = {
      htmlClasses: document.documentElement.className,
      storyMode: document.documentElement.classList.contains('story-pin-mode') ? 'pin' : (document.documentElement.classList.contains('story-nopin-mode') ? 'nopin' : 'other'),
    };
    ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach(id => {
      const el = document.getElementById(id);
      const cs = window.getComputedStyle(el);
      result[id] = {
        box: el.getBoundingClientRect(),
        classes: el.className,
        position: cs.position,
        top: cs.top,
        marginTop: cs.marginTop,
        height: cs.height,
        transform: cs.transform.slice(0, 60),
      };
    });
    return result;
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
