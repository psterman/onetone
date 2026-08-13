const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://127.0.0.1:47291/ia-ai-axes.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // 1. Context tab (default) - 选第一个 habit
  await page.screenshot({ path: 'demo-ia-1-context.png', fullPage: false });

  // 2. 打开 modal,再点 keycap 弹 dock
  await page.click('#ed-key');
  await page.waitForTimeout(400);
  // 模态里的 keycap,带 dock 的那个
  await page.locator('.kcd-root .kcd-keycap').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'demo-ia-2-keycap-dock.png', fullPage: false });

  // 3. 切到 function 分类,选 F5
  await page.click('.kcd-cat[data-cat="function"]');
  await page.waitForTimeout(200);
  await page.click('.kcd-key[data-key="F5"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'demo-ia-3-after-key-pick.png', fullPage: false });

  // 4. 切到另一个 habit (@VSCode.写代码)
  await page.click('[data-ref="@VSCode.写代码"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'demo-ia-4-other-habit.png', fullPage: false });

  // 5. 切到 Providers tab
  await page.click('[data-tab="providers"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'demo-ia-5-providers.png', fullPage: false });

  // 6. 切到 Commands tab
  await page.click('[data-tab="commands"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'demo-ia-6-commands.png', fullPage: false });

  // 7. 切到 Rules tab
  await page.click('[data-tab="rules"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'demo-ia-7-rules.png', fullPage: false });

  await browser.close();
  console.log('ok');
})().catch(err => { console.error(err); process.exit(1); });
