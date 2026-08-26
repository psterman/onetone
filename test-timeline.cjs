// Inspect GSAP timeline state directly
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(200);

  const info = await page.evaluate(() => {
    const lens = document.querySelector('#ch-trigger .camera-rig-lens');
    const out = {
      inlineStyle: lens.getAttribute('style'),
      computedTransform: window.getComputedStyle(lens).transform,
    };
    // 找所有 ST
    if (window.ScrollTrigger) {
      const sts = window.ScrollTrigger.getAll();
      out.stCount = sts.length;
      out.sts = sts.map(st => ({
        trigger: st.trigger && st.trigger.id || st.trigger && st.trigger.className || '?',
        progress: st.progress,
        isActive: st.isActive,
      }));
    }
    return out;
  });
  console.log('lens info at scroll 900:');
  console.log(JSON.stringify(info, null, 2));

  // scroll to 50% of chapter
  await page.evaluate(() => window.scrollTo(0, 1260));  // chapter 50% mark
  await page.waitForTimeout(200);
  const info2 = await page.evaluate(() => {
    const lens = document.querySelector('#ch-trigger .camera-rig-lens');
    const out = {
      inlineStyle: lens.getAttribute('style'),
      computedTransform: window.getComputedStyle(lens).transform,
      computedOpacity: window.getComputedStyle(lens).opacity,
    };
    if (window.ScrollTrigger) {
      const sts = window.ScrollTrigger.getAll();
      out.sts = sts.map(st => ({
        trigger: st.trigger && st.trigger.id || st.trigger && st.trigger.className || '?',
        progress: st.progress,
        isActive: st.isActive,
      }));
    }
    return out;
  });
  console.log('\nlens info at scroll 1260:');
  console.log(JSON.stringify(info2, null, 2));

  await browser.close();
})();
