// Check pin-spacer style
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const spacer = document.querySelector('.pin-spacer');
    if (!spacer) return { error: 'no pin-spacer' };
    const cs = window.getComputedStyle(spacer);
    const inlineStyle = spacer.getAttribute('style');
    return {
      display: cs.display,
      flexDirection: cs.flexDirection,
      alignItems: cs.alignItems,
      alignContent: cs.alignContent,
      justifyContent: cs.justifyContent,
      height: cs.height,
      position: cs.position,
      transform: cs.transform,
      inlineStyle,
      childCount: spacer.children.length,
      childBoxes: Array.from(spacer.children).map(c => ({
        tag: c.tagName,
        class: c.className,
        id: c.id,
        top: c.getBoundingClientRect().top,
        bottom: c.getBoundingClientRect().bottom,
        height: c.getBoundingClientRect().height,
        style: { position: window.getComputedStyle(c).position, top: window.getComputedStyle(c).top }
      })),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
