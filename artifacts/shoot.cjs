// Take 2 screenshots of the keycap-dock demo:
//  1. initial state
//  2. dock open, function-key drawer selected
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 880, height: 520 } });
  await page.goto('http://127.0.0.1:47291/keycap-dock-demo.html', { waitUntil: 'networkidle' });

  // 1. initial
  await page.screenshot({ path: 'demo-1-initial.png', fullPage: false });

  // 2. open the first keycap
  await page.click('.kcd-keycap');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'demo-2-modifier.png', fullPage: false });

  // 3. switch to function keys
  await page.click('.kcd-cat[data-cat="function"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'demo-3-function.png', fullPage: false });

  // 4. pick F5
  await page.click('.kcd-key[data-key="F5"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'demo-4-after-pick.png', fullPage: false });

  // 5. open the second (empty) keycap to show the no-default state
  await page.evaluate(() => {
    const root = document.getElementById('keycap-host-2');
    if (root && root.firstChild && root.firstChild.open) root.firstChild.close();
  });
  await page.click('#keycap-host-2 .kcd-keycap');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'demo-5-empty-open.png', fullPage: false });

  await browser.close();
  console.log('ok');
})().catch(err => { console.error(err); process.exit(1); });
