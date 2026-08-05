#!/usr/bin/env node
/** One-shot: Claude mapping → purpose=sessions + AG00–03 agentLane (matches Rust auto_heal). */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAPPING_ID = process.argv[2] || 'm-1784866356900-3uduf';
const NAV = ['AG00', 'AG01', 'AG02', 'AG03'];
const cfgPath = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'onetone',
  'app',
  'config',
  'settings.json',
);

if (!fs.existsSync(cfgPath)) {
  console.error('settings not found:', cfgPath);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const m = (cfg.mappings || []).find((x) => x.id === MAPPING_ID);
if (!m?.codexMicroPad) {
  console.error('mapping or codexMicroPad missing:', MAPPING_ID);
  process.exit(1);
}

const pad = m.codexMicroPad;
pad.purpose = 'sessions';
pad.claudeStatusLightsEnabled = true;
const navSet = new Set(NAV);
for (const k of pad.keys || []) {
  if (!/^AG\d{2}$/.test(k.microKeyId || '')) continue;
  if (navSet.has(k.microKeyId)) {
    k.keyRole = 'agentLane';
    k.autoAssignable = true;
  } else {
    k.keyRole = 'action';
    k.autoAssignable = false;
  }
}

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
console.log('healed', MAPPING_ID, '→ purpose=sessions, nav=', NAV.join(','));
console.log('path:', cfgPath);
