#!/usr/bin/env node
/** ponytail: assert ot-seg / ot-pill-filter / ot-underline-tab cover global aliases */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const seg = readFileSync(path.join(root, 'src/css/ot-seg.css'), 'utf8');
const pill = readFileSync(path.join(root, 'src/css/ot-pill-filter.css'), 'utf8');
const uline = readFileSync(path.join(root, 'src/css/ot-underline-tab.css'), 'utf8');

const segMust = ['.pref-segmented', '.keys-trigger-mode-seg', '.soft-pad-pad-tab', '.voice-phrase-kind-tab', '--ot-ctrl-r'];
const pillMust = ['.habit-hub-filter', '--ot-pill-filter-r'];
const ulineMust = ['.habit-ws-ch-tab', '.camera-pro-subtab', '.scene-mode-filters', '.scene-mode-filter', '.ot-underline-tab'];

function check(name, css, must) {
  const miss = must.filter((s) => !css.includes(s));
  if (miss.length) {
    console.error(name + ' missing:', miss.join(', '));
    process.exit(1);
  }
  console.log('ok', name);
}

check('ot-seg.css', seg, segMust);
check('ot-pill-filter.css', pill, pillMust);
check('ot-underline-tab.css', uline, ulineMust);
