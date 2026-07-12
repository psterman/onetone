#!/usr/bin/env node
/**
 * Smoke checks for target-key-catalog.js token shapes.
 * Run: node scripts/verify-target-key-catalog.mjs
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, '..', 'src', 'js', 'target-key-catalog.js');
const src = fs.readFileSync(catalogPath, 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const mustHave = [
  "key:'RAlt'",
  "key:'Ctrl+Space'",
  "key:'F2'",
  "letterKeys()",
  "functionKeys()",
  "key:','",
  "key:'Volume_Down'",
  "tabOrder:TAB_ORDER",
  "modifiers:",
  "punctuation:",
  "system:"
];

mustHave.forEach((needle) => assert(src.includes(needle), 'catalog contains ' + needle));
assert(!src.includes("key:'LButton'"), 'excludes LButton');
assert(!src.includes("key:'AutoTrigger'"), 'excludes AutoTrigger');
assert(!src.includes("key:'Launch_App1'"), 'excludes Launch_App1');
assert(!src.includes("key:'Launch_App2'"), 'excludes Launch_App2');

if (failed) {
  console.error('\n' + failed + ' check(s) failed');
  process.exit(1);
}
console.log('\nAll target-key-catalog checks passed.');
