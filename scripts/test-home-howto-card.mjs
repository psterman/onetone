#!/usr/bin/env node
/** ponytail: howto channel cards use ot-switch status, no text pill / edit btn */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panels = readFileSync(path.join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const css = readFileSync(path.join(root, 'src/css/home-workbench.css'), 'utf8');

const must = [
  ['switch helper', panels.includes('howtoStateSwitchHtml') && panels.includes('wb-howto-card-switch')],
  ['no text state pill', !panels.includes('wb-howto-card-state')],
  ['no edit btn', !panels.includes('wb-howto-card-edit')],
  ['switch css', css.includes('.wb-howto-card-switch')],
  ['no edit css', !css.includes('.wb-howto-card-edit')],
];

const fail = must.filter(([, ok]) => !ok).map(([name]) => name);
if (fail.length) {
  console.error('home howto card check failed:', fail.join(', '));
  process.exit(1);
}
console.log('ok home-howto-card');
