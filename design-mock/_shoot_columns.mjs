// Capture each column (A/B/C) of the concept page individually.
// Hides the absolute-positioned callouts so each card is clean.
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const HTML = pathToFileURL(path.join(__dirname, 'tray-menu-v3-concepts.html')).href;
const OUT  = __dirname;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.goto(HTML, { waitUntil: 'networkidle' });

// Hide cross-column callouts to keep each card clean
await page.addStyleTag({
  content: `
    .callout { display: none !important; }
    .menu-frame { background: #eef2f7 !important; }
  `,
});

const cols = await page.$$('.col');
const labels = ['A', 'B', 'C'];
for (let i = 0; i < cols.length; i++) {
  const out = path.join(OUT, `tray-menu-v3-${labels[i]}.png`);
  await cols[i].screenshot({ path: out, type: 'png' });
  console.log('Wrote', out);
}

await browser.close();
