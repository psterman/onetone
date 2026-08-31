#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'src/css/ot-subtab.css'), 'utf8');
const must = ['--ot-subtab-r', '.tray-subtab', '.tray-ch-subtab', '.soft-pad-tray-ch-subtab', '.is-off'];
const miss = must.filter((s) => !css.includes(s));
if (miss.length) {
  console.error('ot-subtab.css missing:', miss.join(', '));
  process.exit(1);
}
console.log('ok ot-subtab.css');
