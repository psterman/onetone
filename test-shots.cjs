// Take screenshots at key transition moments
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const shots = [
    { y: 950, name: '1-trigger-enter-mid' },
    { y: 1100, name: '2-trigger-hold' },
    { y: 1700, name: '3-trigger-exit-end' },
    { y: 1950, name: '4-voice-enter-mid' },
    { y: 2300, name: '5-voice-hold' },
    { y: 2700, name: '6-voice-exit-end' },
    { y: 3050, name: '7-softpad-enter-mid' },
    { y: 3300, name: '8-softpad-hold' },
  ];
  for (const s of shots) {
    await page.evaluate((y) => window.scrollTo(0, y), s.y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: 'C:\\Users\\Administrator\\Desktop\\voice-pilot\\test-output\\' + s.name + '.png', fullPage: false });
  }
  console.log('Screenshots saved');

  await browser.close();
})();
