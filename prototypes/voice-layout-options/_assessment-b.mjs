const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'E:/voice-pilot/prototypes/voice-layout-options';
const URL = 'http://127.0.0.1:5179/';

(async () => {
  const consoleErrors = [];
  const pageErrors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.scheme.is-on');

  // 2. Scheme A filled (default)
  await page.screenshot({ path: path.join(OUT, '_shot-a-filled.png'), fullPage: false });

  // Measure A filled
  const measure = async () => page.evaluate(() => {
    const root = document.querySelector('.scheme.is-on');
    if (!root) return { error: 'no .scheme.is-on' };
    const box = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10 };
    };
    const grid = root.querySelector('.a-grid, .c-body, .c2-grid, [class*="grid"]');
    let gridInfo = null;
    if (grid) {
      const cs = getComputedStyle(grid);
      gridInfo = {
        className: grid.className,
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        gap: cs.gap,
        width: Math.round(grid.getBoundingClientRect().width * 10) / 10
      };
    }
    return {
      scheme: root.getAttribute('data-scheme'),
      rail: box('.a-rail'),
      detail: box('.detail'),
      sceneDock: box('.scene-dock'),
      grid: gridInfo,
      emptyPresent: !!root.querySelector('.scene-dock__empty'),
      filledRows: root.querySelectorAll('.scene-dock__row').length,
      dockMeta: (root.querySelector('.scene-dock__meta') || {}).textContent || null
    };
  });

  const aFilled = await measure();

  // 3. Click C2
  await page.click('#tabs button[data-s="c2"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '_shot-c2-filled.png'), fullPage: false });
  const c2Filled = await measure();

  // 4. Click 空列表
  await page.click('#dockEmpty');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '_shot-c2-empty.png'), fullPage: false });
  const c2Empty = await measure();

  // Switch to A empty
  await page.click('#tabs button[data-s="a"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '_shot-a-empty.png'), fullPage: false });
  const aEmpty = await measure();

  // Layout/a11y facts via evaluate
  const facts = await page.evaluate(() => {
    const sheets = [...document.styleSheets];
    let focusRules = [];
    let mediaRules = [];
    try {
      for (const sheet of sheets) {
        for (const rule of sheet.cssRules || []) {
          const txt = rule.cssText || '';
          if (/:focus|:focus-visible/.test(txt)) focusRules.push(txt.slice(0, 200));
          if (rule.type === CSSRule.MEDIA_RULE) {
            mediaRules.push({
              media: rule.conditionText || rule.media?.mediaText,
              rules: [...rule.cssRules].map(r => (r.cssText || '').slice(0, 180))
            });
          }
        }
      }
    } catch (e) {
      focusRules = ['CSSOM access error: ' + e.message];
    }

    // Check interactive elements for outline/box-shadow on focus via computed style simulation
    const sampleBtns = [...document.querySelectorAll('button')].slice(0, 5);
    const focusStyles = sampleBtns.map(b => {
      b.focus();
      const cs = getComputedStyle(b);
      return {
        tag: b.className.slice(0, 40),
        outline: cs.outline,
        outlineWidth: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
        boxShadow: cs.boxShadow,
        borderColor: cs.borderColor
      };
    });

    // Breakpoint stacking: check at narrow width by temporarily resizing is done outside
    return {
      focusRuleCount: focusRules.length,
      focusRulesSample: focusRules.slice(0, 8),
      mediaRules,
      focusStylesOnButtons: focusStyles,
      hasRoleTablist: !!document.querySelector('[role="tablist"], [role="tab"]'),
      tabsAria: {
        tabsContainerRole: document.getElementById('tabs')?.getAttribute('role'),
        firstTabAriaSelected: document.querySelector('#tabs button')?.getAttribute('aria-selected'),
        firstTabAriaControls: document.querySelector('#tabs button')?.getAttribute('aria-controls')
      },
      emptyCopy: document.querySelector('.scene-dock__empty')?.textContent || null,
      imgWithoutAlt: [...document.querySelectorAll('img:not([alt])')].length,
      buttonsWithoutType: [...document.querySelectorAll('button:not([type])')].length
    };
  });

  // Responsive stacking checks at breakpoints
  const breakpoints = [1280, 1024, 900, 768, 640, 480];
  const stacking = [];
  for (const w of breakpoints) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(100);
    // ensure A is on
    await page.click('#tabs button[data-s="a"]');
    await page.waitForTimeout(50);
    const aStack = await page.evaluate(() => {
      const root = document.querySelector('.scheme.is-on');
      const rail = root?.querySelector('.a-rail')?.getBoundingClientRect();
      const detail = root?.querySelector('.detail')?.getBoundingClientRect();
      const dock = root?.querySelector('.scene-dock')?.getBoundingClientRect();
      const grid = root?.querySelector('.a-grid, .c-body');
      const cs = grid ? getComputedStyle(grid) : null;
      const sameRow = (a, b) => a && b && Math.abs(a.y - b.y) < 8;
      return {
        scheme: 'a',
        gridCols: cs?.gridTemplateColumns || null,
        display: cs?.display || null,
        railW: rail ? Math.round(rail.width) : null,
        detailW: detail ? Math.round(detail.width) : null,
        dockW: dock ? Math.round(dock.width) : null,
        railDetailSameRow: sameRow(rail, detail),
        detailDockSameRow: sameRow(detail, dock),
        allStacked: rail && detail && dock ? !(sameRow(rail, detail) && sameRow(detail, dock)) : null
      };
    });
    await page.click('#tabs button[data-s="c2"]');
    await page.waitForTimeout(50);
    const c2Stack = await page.evaluate(() => {
      const root = document.querySelector('.scheme.is-on');
      const rail = root?.querySelector('.a-rail')?.getBoundingClientRect();
      const detail = root?.querySelector('.detail')?.getBoundingClientRect();
      const dock = root?.querySelector('.scene-dock')?.getBoundingClientRect();
      const grid = root?.querySelector('.c-body, .a-grid');
      const cs = grid ? getComputedStyle(grid) : null;
      const sameRow = (a, b) => a && b && Math.abs(a.y - b.y) < 8;
      return {
        scheme: 'c2',
        gridCols: cs?.gridTemplateColumns || null,
        display: cs?.display || null,
        railW: rail ? Math.round(rail.width) : null,
        detailW: detail ? Math.round(detail.width) : null,
        dockW: dock ? Math.round(dock.width) : null,
        railDetailSameRow: sameRow(rail, detail),
        detailDockSameRow: sameRow(detail, dock),
        allStacked: rail && detail && dock ? !(sameRow(rail, detail) && sameRow(detail, dock)) : null
      };
    });
    stacking.push({ width: w, a: aStack, c2: c2Stack });
  }

  await browser.close();

  const shots = ['_shot-a-filled.png', '_shot-c2-filled.png', '_shot-c2-empty.png', '_shot-a-empty.png'].map(f => {
    const p = path.join(OUT, f);
    const st = fs.existsSync(p) ? fs.statSync(p) : null;
    return { path: p.replace(/\\/g, '/'), exists: !!st, bytes: st?.size || 0 };
  });

  const report = {
    shots,
    measurements: { aFilled, c2Filled, aEmpty, c2Empty },
    facts,
    stacking,
    consoleErrors,
    pageErrors
  };
  fs.writeFileSync(path.join(OUT, '_assessment-b-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
