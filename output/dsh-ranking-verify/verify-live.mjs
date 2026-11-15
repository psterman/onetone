// 线上功能验证：https://dsh-plugin-ranking.pages.dev/
// 用系统 Chrome（ms-playwright 缺 1217 驱动，chromium.launch() 会报 Executable doesn't exist）
const { chromium } = await import('file:///E:/voice-pilot/daily-image-site/node_modules/playwright/index.mjs');

const URL = 'https://dsh-plugin-ranking.pages.dev/';
const OUT = 'E:/voice-pilot/output/dsh-ranking-verify/';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) => failedRequests.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));

const resp = await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
console.log('HTTP status      :', resp.status());

const title = await page.title();
console.log('title            :', title);

const total = await page.evaluate(() => document.querySelectorAll('#grid > *').length);
console.log('#grid 子元素数量  :', total);

const countText = await page.textContent('#count').catch(() => '(无 #count)');
console.log('#count 文案       :', (countText || '').trim());

// --- 搜索 ---
await page.fill('#q', '微信');
await page.waitForTimeout(400);
const afterSearch = await page.evaluate(() => document.querySelectorAll('#grid > *').length);
console.log('搜索"微信"后数量   :', afterSearch);
const searchCountText = (await page.textContent('#count').catch(() => '')) || '';
console.log('搜索后 #count     :', searchCountText.trim());

// --- 重置 ---
await page.click('#reset');
await page.waitForTimeout(400);
const afterReset = await page.evaluate(() => document.querySelectorAll('#grid > *').length);
console.log('点 reset 后数量    :', afterReset);

// --- 分类筛选 chip ---
const chip = await page.$('.chip[data-filter="tools"]');
if (chip) {
  await chip.click();
  await page.waitForTimeout(400);
  const afterChip = await page.evaluate(() => document.querySelectorAll('#grid > *').length);
  const chipActive = await page.evaluate(() => document.querySelector('.chip.active')?.getAttribute('data-filter'));
  console.log('点 tools chip 后   :', afterChip, '| active =', chipActive);
  await page.click('#reset');
  await page.waitForTimeout(300);
}

// --- 排序 ---
const sortOptions = await page.evaluate(() => Array.from(document.querySelectorAll('#sort option')).map((o) => o.value));
console.log('#sort 选项        :', JSON.stringify(sortOptions));
const firstBefore = await page.evaluate(() => document.querySelector('#grid > *')?.textContent?.trim().slice(0, 60));
await page.selectOption('#sort', sortOptions[sortOptions.length - 1]);
await page.waitForTimeout(500);
const firstAfter = await page.evaluate(() => document.querySelector('#grid > *')?.textContent?.trim().slice(0, 60));
console.log('排序前首条         :', firstBefore);
console.log('排序后首条         :', firstAfter);
console.log('排序是否改变顺序   :', firstBefore !== firstAfter);

// --- 中文详情 / 复制命令等交互元素是否在 ---
const interactive = await page.evaluate(() => ({
  copyButtons: document.querySelectorAll('[data-copy], .copy, button[data-cmd]').length,
  detailLinks: document.querySelectorAll('a[href*="dsh-plugin.org"]').length,
  githubLinks: document.querySelectorAll('a[href*="github.com"]').length,
  hasImg: document.querySelectorAll('img').length,
}));
console.log('交互元素统计       :', JSON.stringify(interactive));

await page.screenshot({ path: OUT + 'live-home.png', fullPage: false });

// --- SEO 落地页 ---
await page.goto('https://dsh-plugin-ranking.pages.dev/ranking', { waitUntil: 'networkidle', timeout: 60000 });
const seoRows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
console.log('SEO 页 /ranking 行数:', seoRows);
await page.screenshot({ path: OUT + 'live-ranking.png', fullPage: false });

console.log('\nconsole errors    :', consoleErrors.length, consoleErrors.slice(0, 5));
console.log('page errors       :', pageErrors.length, pageErrors.slice(0, 5));
console.log('failed requests   :', failedRequests.length, failedRequests.slice(0, 5));

await browser.close();
