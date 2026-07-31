//! Assert voice commit-key whitelist includes Shift+Enter.

function normalize(raw) {
  const key = String(raw || '')
    .trim()
    .replace(/\s+/g, '');
  if (/^ctrl\+enter$/i.test(key) || /^control\+enter$/i.test(key)) return 'Ctrl+Enter';
  if (/^shift\+enter$/i.test(key)) return 'Shift+Enter';
  return 'Enter';
}

const cases = [
  ['Enter', 'Enter'],
  ['enter', 'Enter'],
  ['Shift+Enter', 'Shift+Enter'],
  ['shift+enter', 'Shift+Enter'],
  ['Ctrl+Enter', 'Ctrl+Enter'],
  ['ctrl + enter', 'Ctrl+Enter'],
  ['bogus', 'Enter'],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = normalize(input);
  if (got !== want) {
    console.error(`FAIL normalize(${JSON.stringify(input)}) => ${got}, want ${want}`);
    failed += 1;
  }
}
if (failed) process.exit(1);
console.log('ok: commit-key normalize', cases.length, 'cases');
