const fs = require('fs');
const t = fs.readFileSync(__dirname + '/_impeccable-detect.json', 'utf8');
const antip = [...t.matchAll(/"antipattern": "([^"]+)"/g)].map((m) => m[1]);
const sev = [...t.matchAll(/"severity": "([^"]+)"/g)].map((m) => m[1]);
const c = {};
const s = {};
for (const a of antip) c[a] = (c[a] || 0) + 1;
for (const x of sev) s[x] = (s[x] || 0) + 1;
const lc = [
  ...new Set(
    [...t.matchAll(/\d\.\d:1 \(need [^)]+\) — text #[0-9a-f]+ on #[0-9a-f]+/gi)].map((m) => m[0])
  ),
];
const underSizes = [
  ...new Set([...t.matchAll(/(\d+(?:\.\d+)?px) functional text/g)].map((m) => m[1])),
];
const cramped = [
  ...new Set(
    [...t.matchAll(/cramped-padding[\s\S]{0,500}?"snippet": "([^"]*)"/g)].map((m) => m[1])
  ),
];
const nested = [
  ...new Set(
    [...t.matchAll(/nested-cards[\s\S]{0,500}?"snippet": "([^"]*)"/g)].map((m) => m[1])
  ),
];
const summary = {
  total: antip.length,
  bySeverity: s,
  byAntipattern: c,
  lowContrastRatios: lc,
  undersizedPxValues: underSizes,
  crampedSnippets: cramped,
  nestedSnippets: nested,
  parseNote:
    'Full JSON invalid (mojibake/unescaped quote in Chinese snippets from console encoding). Counts via regex.',
};
fs.writeFileSync(__dirname + '/_impeccable-detect-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
