// Check DOM structure after pin initialization
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Get DOM structure around story-world
  const dom = await page.evaluate(() => {
    const world = document.getElementById('story-world');
    if (!world) return { error: 'no story-world' };
    const result = {
      worldBox: world.getBoundingClientRect(),
      worldStyle: {
        position: window.getComputedStyle(world).position,
        height: window.getComputedStyle(world).height,
        top: window.getComputedStyle(world).top,
      },
      worldParentTag: world.parentElement.tagName,
      worldParentClass: world.parentElement.className,
      worldParentBox: world.parentElement.getBoundingClientRect(),
      siblings: [],
      children: [],
    };
    let prev = world.previousElementSibling;
    while (prev) {
      result.siblings.push({
        tag: prev.tagName,
        class: prev.className,
        id: prev.id,
        box: prev.getBoundingClientRect(),
        style: { position: window.getComputedStyle(prev).position, height: window.getComputedStyle(prev).height },
      });
      prev = prev.previousElementSibling;
    }
    for (const c of world.children) {
      result.children.push({
        tag: c.tagName,
        class: c.className,
        id: c.id,
        box: c.getBoundingClientRect(),
        style: { position: window.getComputedStyle(c).position, top: window.getComputedStyle(c).top, left: window.getComputedStyle(c).left, width: window.getComputedStyle(c).width, height: window.getComputedStyle(c).height },
      });
    }
    return result;
  });
  console.log('=== DOM structure (scrollY 0) ===');
  console.log(JSON.stringify(dom, null, 2));

  // Now scroll past pin end
  await page.evaluate(() => window.scrollTo(0, 4000));
  await page.waitForTimeout(500);
  const dom2 = await page.evaluate(() => {
    const world = document.getElementById('story-world');
    if (!world) return { error: 'no story-world' };
    const chapters = ['ch-trigger', 'ch-voice', 'ch-softpad'].map(id => {
      const el = document.getElementById(id);
      return el ? { id, box: el.getBoundingClientRect(), style: { position: window.getComputedStyle(el).position, top: window.getComputedStyle(el).top } } : null;
    });
    return {
      worldBox: world.getBoundingClientRect(),
      worldStyle: { position: window.getComputedStyle(world).position, height: window.getComputedStyle(world).height },
      worldParent: { tag: world.parentElement.tagName, class: world.parentElement.className, box: world.parentElement.getBoundingClientRect() },
      chapters,
    };
  });
  console.log('\n=== DOM structure (scrollY 4000) ===');
  console.log(JSON.stringify(dom2, null, 2));

  await browser.close();
})();
