import { readFileSync } from 'fs';

const h = readFileSync('src/index.html', 'utf8');
const start = h.indexOf('<div class="keys-page-body keys-page-body--three-col">');
const end = h.indexOf('id="settingsPanelSoftPad"');
const chunk = h.slice(start, end);

// Find first-level children of keys-page-body by tracking depth from the opening div
let depth = 0;
let i = 0;
const kids = [];
const openRe = /<([a-zA-Z0-9-]+)([^>]*)>/g;
let m;
const slice = chunk;
openRe.lastIndex = 0;
// skip first open (body itself)
const first = openRe.exec(slice);
depth = 1;
while ((m = openRe.exec(slice))) {
  const full = m[0];
  if (full.startsWith('</')) continue;
  if (full.endsWith('/>')) continue;
  const name = m[1].toLowerCase();
  const attrs = m[2] || '';
  // count closes before this
  const before = slice.slice(0, m.index);
  // naive: recount depth from start is expensive; use stack
}
// simpler stack parse
const stack = [];
const tokenRe = /<\/?([a-zA-Z0-9-]+)(\s[^>]*)?>/g;
let tok;
let bodyDepth = -1;
while ((tok = tokenRe.exec(chunk))) {
  const isClose = tok[0].startsWith('</');
  const name = tok[1].toLowerCase();
  const voidish = /^(input|img|br|hr|meta|link|source|area|col|embed|wbr)$/i.test(name);
  if (!isClose && name === 'div' && tok[0].includes('keys-page-body--three-col')) {
    bodyDepth = 0;
    stack.push('body');
    continue;
  }
  if (bodyDepth < 0) continue;
  if (isClose) {
    stack.pop();
    if (stack.length === 0) break;
    continue;
  }
  if (voidish || tok[0].endsWith('/>')) continue;
  if (stack.length === 1) {
    // direct child start
    const id = (tok[0].match(/id="([^"]+)"/) || [])[1] || '';
    const cls = (tok[0].match(/class="([^"]+)"/) || [])[1] || '';
    kids.push({ name, id, cls: cls.slice(0, 60) });
  }
  stack.push(name);
}
console.log('direct children of keys-page-body:');
console.log(kids.slice(0, 15));
console.log('total direct kids logged', kids.length);
