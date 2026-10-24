/**
 * Smoke: capability inventory doc exists and separates KEEP vs link-later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = fs.readFileSync(
  path.join(root, 'docs', 'CHANNEL_CAPABILITY_INVENTORY.md'),
  'utf8'
);

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exitCode = 1;
    return;
  }
  console.log('ok:', name);
}

check('has Keys KEEP section', doc.includes('## 1. 按键页能力（KEEP）') && doc.includes('| K5 |'));
check('has Voice KEEP', doc.includes('## 2. 语音页能力（KEEP）') && doc.includes('| V2 |'));
check('has Soft Pad KEEP', doc.includes('## 3. 软键盘页能力（KEEP）') && doc.includes('| P2 |'));
check('has link-later list', doc.includes('## 4. 待联动到习惯') && doc.includes('| L1 |'));
check('states no transplant this phase', doc.includes('本阶段只统计，不改产品'));

if (process.exitCode) process.exit(process.exitCode);
console.log('channel-capability-inventory smoke passed');
