// Catch demo-wrap mid-transition by scrolling into IO threshold boundary
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Find chapter boundary by inspecting layout first
  const layout = await page.evaluate(() => {
    const out = {};
    ['ch-trigger', 'ch-voice', 'ch-softpad'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      out[id] = { topAbs: window.scrollY + r.top, height: r.height };
      const wrap = el.querySelector('.chapter-demo-wrap');
      if (wrap) {
        const wr = wrap.getBoundingClientRect();
        out[id].wrapTopAbs = window.scrollY + wr.top;
        out[id].wrapHeight = wr.height;
      }
    });
    return out;
  });
  console.log('LAYOUT', JSON.stringify(layout, null, 2));

  // IO threshold 0.35 + rootMargin "-5% 0px -5%" of viewport (900)
  // For trigger: demo-wrap center y must be in viewport middle band [45, 855] (excluding 5% margins)
  // demo visible ratio 0.35 -> wrap.top between (45 - 0.65*wrapH) and (855)
  const shots = [];
  function plan(id, scrollY, label) {
    shots.push({ id, scrollY, label });
  }

  // Approximate scroll positions to catch transition
  const t = layout['ch-trigger'];
  const v = layout['ch-voice'];
  const s = layout['ch-softpad'];
  if (t && t.wrapTopAbs !== undefined) {
    // Trigger wrap is at the bottom half of the chapter; entry happens when scrolling into it
    // Use a position slightly above wrap so it's about to enter
    plan('ch-trigger', t.wrapTopAbs - 200, 't-pre-enter');
    plan('ch-trigger', t.wrapTopAbs - 50, 't-mid-enter');
    plan('ch-trigger', t.wrapTopAbs + 200, 't-entered');
  }
  if (t && v) {
    // Bridge between trigger and voice
    const bridgeY = t.topAbs + t.height - 50;
    plan('bridge', bridgeY, 'bridge-tv');
  }
  if (v && v.wrapTopAbs !== undefined) {
    plan('ch-voice', v.wrapTopAbs - 200, 'v-pre-enter');
    plan('ch-voice', v.wrapTopAbs - 50, 'v-mid-enter');
    plan('ch-voice', v.wrapTopAbs + 200, 'v-entered');
  }
  if (v && s) {
    const bridgeY = v.topAbs + v.height - 50;
    plan('bridge', bridgeY, 'bridge-vs');
  }
  if (s && s.wrapTopAbs !== undefined) {
    plan('ch-softpad', s.wrapTopAbs - 200, 's-pre-enter');
    plan('ch-softpad', s.wrapTopAbs - 50, 's-mid-enter');
    plan('ch-softpad', s.wrapTopAbs + 200, 's-entered');
  }

  for (const s of shots) {
    await page.evaluate((y) => window.scrollTo(0, y), s.scrollY);
    await page.waitForTimeout(150); // catch ~30% into transition
    const computed = await page.evaluate((id) => {
      const sec = document.getElementById(id);
      if (!sec) return null;
      const wrap = sec.querySelector('.chapter-demo-wrap');
      if (!wrap) return null;
      const cs = getComputedStyle(wrap);
      return {
        opacity: cs.opacity,
        transform: cs.transform,
        isDemoVisible: sec.classList.contains('is-demo-visible'),
      };
    }, s.id);
    const out = 'C:\\Users\\Administrator\\Desktop\\voice-pilot\\test-output\\tr-' + s.label + '.png';
    await page.screenshot({ path: out, fullPage: false });
    console.log(s.label, '@y=' + s.scrollY, JSON.stringify(computed));
  }

  await browser.close();
})();
