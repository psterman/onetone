// 看 console 错误
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('ERR:', err.message));
  await page.goto('http://127.0.0.1:47291/big-mode.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 直接在 page 里调用看
  const result = await page.evaluate(() => {
    try {
      // 找第一个 habit 的 key
      const key = document.querySelector('#sec-Chrome .habit .key');
      return { found: !!key, onclick: key ? key.getAttribute('onclick') : null, keyText: key ? key.textContent : null };
    } catch (e) { return { error: e.message }; }
  });
  console.log('init:', JSON.stringify(result));

  // 直接调用 onclick 函数
  const result2 = await page.evaluate(() => {
    try {
      const key = document.querySelector('#sec-Chrome .habit .key');
      // 手动模拟 click
      key.click();
      return { called: true, popover: !!document.querySelector('.popover') };
    } catch (e) { return { error: e.message }; }
  });
  console.log('after click:', JSON.stringify(result2));
  await page.waitForTimeout(500);

  const result3 = await page.evaluate(() => {
    return { popover: !!document.querySelector('.popover'), bg: !!document.querySelector('.popover-bg') };
  });
  console.log('after wait:', JSON.stringify(result3));

  await browser.close();
})();
