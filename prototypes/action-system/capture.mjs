import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'screenshots');
const pages = ['home', 'onboarding', 'keys', 'voice', 'camera', 'softpad', 'habits'];
const variants = ['system', 'guided', 'center'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
const page = await context.newPage();
const errors = [];

page.on('pageerror', error => errors.push('pageerror: ' + error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push('console: ' + message.text());
});

for (let variant = 1; variant <= variants.length; variant += 1) {
  for (const pageId of pages) {
    const url = `http://127.0.0.1:1431/action-system/?v=${variant}&page=${pageId}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.app-shell').waitFor();
    if (await page.locator('.app-nav-btn').count() !== pages.length) {
      throw new Error(`nav count mismatch: variant=${variant} page=${pageId}`);
    }
    const activePage = await page.locator('.app-nav-btn.is-active').getAttribute('data-page');
    if (activePage !== pageId) {
      throw new Error(`active page mismatch: expected=${pageId} actual=${activePage}`);
    }
    await page.locator('.top-actions .open-picker').click();
    await page.locator('#actionSheet:not([hidden])').waitFor();
    if (await page.locator('.sheet-action').count() !== 17) {
      throw new Error(`picker count mismatch: variant=${variant} page=${pageId}`);
    }
    await page.locator('.sheet-close').click();
    const firstSwitch = page.locator('.switch').first();
    if (await firstSwitch.count()) {
      const before = await firstSwitch.getAttribute('aria-checked');
      await firstSwitch.click();
      await firstSwitch.click();
      const after = await firstSwitch.getAttribute('aria-checked');
      if (before !== after) throw new Error(`switch restore mismatch: variant=${variant} page=${pageId}`);
    }
    await page.screenshot({ path: path.join(output, `${variants[variant - 1]}-${pageId}.png`) });
  }
}

await browser.close();
if (errors.length) {
  throw new Error(errors.join('\n'));
}
console.log(`PASS: ${variants.length * pages.length} screens, picker and switches verified, console clean`);
