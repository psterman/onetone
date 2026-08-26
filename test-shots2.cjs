// Fine-grained screenshots at enter/exit milestones
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const shots = [
    // ch1 enter
    { y: 850, name: 'a1-trigger-enter-25pct' },
    { y: 920, name: 'a2-trigger-enter-60pct' },
    { y: 990, name: 'a3-trigger-enter-100pct' },
    // ch1 → ch2 transition
    { y: 1620, name: 'b1-trigger-exit-50pct' },
    { y: 1700, name: 'b2-trigger-exit-100pct' },
    { y: 1880, name: 'b3-voice-enter-25pct' },
    { y: 1960, name: 'b4-voice-enter-60pct' },
    { y: 2030, name: 'b5-voice-enter-100pct' },
    // ch2 → ch3 transition
    { y: 2620, name: 'c1-voice-exit-50pct' },
    { y: 2700, name: 'c2-voice-exit-100pct' },
    { y: 2900, name: 'c3-softpad-enter-25pct' },
    { y: 2980, name: 'c4-softpad-enter-60pct' },
  ];
  for (const s of shots) {
    await page.evaluate((y) => window.scrollTo(0, y), s.y);
    await page.waitForTimeout(180);
    await page.screenshot({ path: 'C:\\Users\\Administrator\\Desktop\\voice-pilot\\test-output\\' + s.name + '.png', fullPage: false });
  }
  console.log('Done');

  await browser.close();
})();
