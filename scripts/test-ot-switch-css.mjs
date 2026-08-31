#!/usr/bin/env node
/** ponytail: assert ot-switch.css covers global toggle aliases */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'src/css/ot-switch.css'), 'utf8');
const must = ['.toggle', '.toggle-switch', '.sw-toggle', '.keys-app-rule-toggle', '--ot-sw-on', '--ot-sw-thumb-size', '--ot-sw-travel', '--ot-sw-track-r: 3px', '.mic-row.muted'];
const miss = must.filter((s) => !css.includes(s));
if (miss.length) {
  console.error('ot-switch.css missing:', miss.join(', '));
  process.exit(1);
}
console.log('ok ot-switch.css aliases');
