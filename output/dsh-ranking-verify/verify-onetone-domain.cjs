const { chromium } = await import('file:///E:/voice-pilot/daily-image-site/node_modules/playwright/index.mjs');

const URL = 'https://plugins.onetone.app/';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();

const consoleErrors = [], pageErrors = [], failed = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));

const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
console.log('URL            :', resp.url());
console.log('HTTP status    :', resp.status());
console.log('title          :', await page.title());

const visible = () => page.evaluate(() => Array.from(document.querySelectorAll('#grid > *'))
  .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && getComputedStyle(el).display !== 'none'; }).length);

console.log('可见条目       :', await visible());
await page.fill('#q', '微信');
await page.waitForTimeout(500);
console.log('搜索"微信"     :', await visible(), '|', ((await page.textContent('#count')) || '').trim().slice(0, 26));
await page.click('#reset');
await page.waitForTimeout(400);
await page.click('.chip[data-filter="tools"]');
await page.waitForTimeout(500);
console.log('tools 分类     :', await visible());
await page.click('#reset');
await page.waitForTimeout(300);

await page.click('#grid code');
await page.waitForTimeout(600);
console.log('点命令复制     :', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())).slice(0, 90));

// head 标签检查
const head = await page.evaluate(() => ({
  canonical: document.querySelector('link[rel=canonical]')?.href,
  ogImage: document.querySelector('meta[property="og:image"]')?.content,
  twImage: document.querySelector('meta[name="twitter:image"]')?.content,
}));
console.log('head           :', JSON.stringify(head));

// 分享图能不能取到
const img = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type') }; }, head.ogImage);
console.log('og:image 可取  :', JSON.stringify(img));

console.log('\nconsole errors :', consoleErrors.length, consoleErrors.slice(0, 3));
console.log('page errors    :', pageErrors.length, pageErrors.slice(0, 3));
console.log('failed requests:', failed.length, failed.slice(0, 3));

await page.screenshot({ path: 'E:/voice-pilot/output/dsh-ranking-verify/live-plugins-onetone.png', fullPage: false });
await page.goto('https://plugins.onetone.app/ranking', { waitUntil: 'networkidle', timeout: 60000 });
console.log('\n/ranking 行数  :', await page.evaluate(() => document.querySelectorAll('table tbody tr').length));
await page.screenshot({ path: 'E:/voice-pilot/output/dsh-ranking-verify/live-ranking-onetone.png', fullPage: false });
await browser.close();
