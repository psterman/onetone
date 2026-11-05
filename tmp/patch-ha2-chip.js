const fs = require('fs');
const p = 'e:/voice-pilot/src/js/features/now/home-agent-v2.js';
let s = fs.readFileSync(p, 'utf8');

const start = s.indexOf("var projEl = chipNow.querySelector('[data-ha2-dest-project]');");
if (start < 0) {
  console.error('start not found');
  process.exit(1);
}
const endMarker = "aria-hidden=\"true\">▾</span>';";
const end = s.indexOf(endMarker, start);
if (end < 0) {
  console.error('end not found');
  process.exit(1);
}
const endFull = end + endMarker.length;
// Also need to include the atr-edit branch replacement from "} else {" before projEl
// Find the "} else {" that precedes projEl (inside atrEdit block)
const elseStart = s.lastIndexOf('} else {', start);
const blockStart = elseStart; // replaces "} else { projEl... } ... ▾</span>';"

const replacement = `}
      } else if (chipNow && chipNow.hasAttribute('data-ha2-atr-edit-chip')) {
        var wrapBtn = document.createElement('div');
        wrapBtn.innerHTML =
          '<button type="button" class="ha2-chip target" data-ha2-picker title="' +
          esc(t('ha2PickAgent', '选择 Agent')) +
          '">' +
          iconHtml(c, 'ha2-chip-icon') +
          '<span class="ha2-chip-copy"><span data-ha2-dest-name">' +
          esc(c.name) +
          '</span></span><span class="ha2-chip-caret" aria-hidden="true">' +
          lucide('chevron-down', 12) +
          '</span></button>';
        var nextBtn = wrapBtn.firstChild;
        if (nextBtn) chipNow.replaceWith(nextBtn);
      } else if (chipNow) {
        chipNow.innerHTML =
          iconHtml(c, 'ha2-chip-icon') +
          '<span class="ha2-chip-copy"><span data-ha2-dest-name">' +
          esc(c.name) +
          '</span></span><span class="ha2-chip-caret" aria-hidden="true">' +
          lucide('chevron-down', 12) +
          '</span>';
`;

// We need to replace from "} else {\n          var projEl" through the second ▾ chipNow.innerHTML block.
// Safer: find two occurrences of ha2-chip-project in this region and rewrite with regex.

const regionStart = s.indexOf('if (atrEdit) {', s.indexOf('var fuse = root.querySelector'));
const regionEnd = s.indexOf('if (!composing && !(store()', regionStart);
const region = s.slice(regionStart, regionEnd);
const newRegion = region
  .replace(
    /\s*\} else \{\s*var projEl = chipNow\.querySelector\('\[data-ha2-dest-project\]'\);\s*if \(projEl\) projEl\.textContent = targetProjectLabel\(snap\);\s*\}/,
    ''
  )
  .replace(
    /'<span class="ha2-chip-copy"><span data-ha2-dest-name>' \+\s*esc\(c\.name\) \+\s*'<\/span><span class="ha2-chip-project" data-ha2-dest-project>' \+\s*esc\(targetProjectLabel\(snap\)\) \+\s*'<\/span><\/span><span class="ha2-chip-caret" aria-hidden="true">▾<\/span><\/button>';/g,
    `'<span class="ha2-chip-copy"><span data-ha2-dest-name>' +
          esc(c.name) +
          '</span></span><span class="ha2-chip-caret" aria-hidden="true">' +
          lucide('chevron-down', 12) +
          '</span></button>';`
  )
  .replace(
    /'<span class="ha2-chip-copy"><span data-ha2-dest-name>' \+\s*esc\(c\.name\) \+\s*'<\/span><span class="ha2-chip-project" data-ha2-dest-project>' \+\s*esc\(targetProjectLabel\(snap\)\) \+\s*'<\/span><\/span><span class="ha2-chip-caret" aria-hidden="true">▾<\/span>';/g,
    `'<span class="ha2-chip-copy"><span data-ha2-dest-name>' +
          esc(c.name) +
          '</span></span><span class="ha2-chip-caret" aria-hidden="true">' +
          lucide('chevron-down', 12) +
          '</span>';`
  );

if (newRegion === region) {
  console.error('no changes applied');
  process.exit(1);
}
s = s.slice(0, regionStart) + newRegion + s.slice(regionEnd);
fs.writeFileSync(p, s);
console.log('patched region ok');
