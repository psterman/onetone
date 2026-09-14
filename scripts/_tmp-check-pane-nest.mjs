import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
// From panes wrapper through end of picker
const start = html.indexOf('<div class="voice-intent-panes"');
const end = html.indexOf('id="voiceCoreAdvanced"');
const chunk = html.slice(start, end);
let depth = 0;
const interesting = [];
const re = /<div\b[^>]*>|<\/div>/g;
let m;
while ((m = re.exec(chunk))) {
  const tag = m[0];
  const line = chunk.slice(0, m.index).split(/\n/).length;
  if (tag.startsWith('<div')) {
    const id = (tag.match(/id="([^"]+)"/) || [])[1] || '';
    if (id) interesting.push({ op: 'open', id, depth, line });
    depth++;
  } else {
    depth--;
    interesting.push({ op: 'close', depth, line });
  }
}
for (const e of interesting) {
  if (e.op === 'open' || e.depth <= 2) {
    console.log(e.op, e.id || '', 'depth', e.depth, 'lineRel', e.line);
  }
}
console.log('final depth', depth);
