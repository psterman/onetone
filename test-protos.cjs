// Compare two prototypes: stick vs decoupled vs current production
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const targets = [
    { name: 'A-sticky', url: 'http://127.0.0.1:8765/prototypes/home-story-sticky-stage.html' },
    { name: 'B-decoupled', url: 'http://127.0.0.1:8765/prototypes/home-story-decoupled.html' },
    { name: 'C-prod', url: 'http://127.0.0.1:8765/index.html' },
  ];

  for (const t of targets) {
    console.log(`\n========== ${t.name} (${t.url}) ==========`);
    await page.goto(t.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 文档高度 + 章节位置
    const docInfo = await page.evaluate(() => {
      const out = {
        docHeight: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
      };
      // 找 chapter / step
      ['.story-chapter', '.story-step'].forEach(sel => {
        const els = document.querySelectorAll(sel);
        out[sel] = Array.from(els).map(el => ({
          id: el.id,
          top: Math.round(el.getBoundingClientRect().top + window.scrollY),
          h: Math.round(el.getBoundingClientRect().height),
        }));
      });
      // 找 demo 元素
      out.demos = ['#stage-demo-trigger', '#stage-demo-voice', '#stage-demo-softpad', '.chapter-demo']
        .filter(sel => document.querySelector(sel) !== null);
      return out;
    });
    console.log('Doc:', docInfo.docHeight, 'vh:', docInfo.viewport);
    console.log('chapters:', docInfo['.story-chapter'] || docInfo['.story-step']);

    // 抓 5 个滚动点的 screenshot
    const scrollPoints = [
      Math.round(docInfo.docHeight * 0.10),
      Math.round(docInfo.docHeight * 0.30),
      Math.round(docInfo.docHeight * 0.50),
      Math.round(docInfo.docHeight * 0.70),
      Math.round(docInfo.docHeight * 0.90),
    ];
    for (let i = 0; i < scrollPoints.length; i++) {
      const y = scrollPoints[i];
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `C:\\Users\\Administrator\\Desktop\\voice-pilot\\test-output\\${t.name}-${String(i+1).padStart(2)}.png`, fullPage: false });
    }
    console.log(`Saved 5 screenshots for ${t.name}`);
  }

  await browser.close();
})();
