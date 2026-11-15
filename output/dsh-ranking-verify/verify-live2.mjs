// 复核：可见条目数 + 点击命令框复制
const { chromium } = await import('file:///E:/voice-pilot/daily-image-site/node_modules/playwright/index.mjs');

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();

const visible = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('#grid > *')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    }).length
  );

await page.goto('https://dsh-plugin-ranking.pages.dev/', { waitUntil: 'networkidle', timeout: 60000 });
console.log('初始可见条目      :', await visible());

await page.fill('#q', '微信');
await page.waitForTimeout(500);
console.log('搜索"微信"可见条目:', await visible(), '|', ((await page.textContent('#count')) || '').trim().slice(0, 30));

await page.click('#reset');
await page.waitForTimeout(400);
console.log('reset 后可见条目  :', await visible());

await page.click('.chip[data-filter="tools"]');
await page.waitForTimeout(500);
console.log('tools 分类可见条目:', await visible(), '|', ((await page.textContent('#count')) || '').trim().slice(0, 30));

await page.click('#reset');
await page.waitForTimeout(400);

// --- 点击命令框复制 ---
const cmdSel = await page.evaluate(() => {
  const cands = ['#grid code', '#grid .cmd', '#grid [data-cmd]', '#grid pre', '#grid .install'];
  for (const s of cands) {
    const el = document.querySelector(s);
    if (el) return { sel: s, text: el.textContent.trim().slice(0, 90) };
  }
  const any = document.querySelector('#grid code');
  return any ? { sel: '#grid code', text: any.textContent.trim().slice(0, 90) } : null;
});
console.log('命令框元素        :', JSON.stringify(cmdSel));

if (cmdSel) {
  await page.click(cmdSel.sel);
  await page.waitForTimeout(600);
  let clip = '';
  try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) { clip = '(read blocked: ' + e.message + ')'; }
  console.log('点击后剪贴板      :', JSON.stringify(clip).slice(0, 140));
  const toast = await page.textContent('#toast').catch(() => '');
  console.log('toast 提示        :', JSON.stringify((toast || '').trim()).slice(0, 120));
}

// --- 详情链接抽样是否指向真实页面 ---
const hrefs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('#grid a[href*="dsh-plugin.org"]')).slice(0, 3).map((a) => a.href)
);
console.log('详情链接样本      :', JSON.stringify(hrefs, null, 1));

await browser.close();
