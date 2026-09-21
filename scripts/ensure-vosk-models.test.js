#!/usr/bin/env node
'use strict';

/**
 * Asserts release packaging covers both CN and EN Vosk light models.
 *   node scripts/ensure-vosk-models.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MODELS } = require('./ensure-vosk-cn-model.js');

assert.ok(MODELS.some((m) => m.id === 'cn-light'), 'cn-light in ensure list');
assert.ok(MODELS.some((m) => m.id === 'en-light'), 'en-light in ensure list');

const tauriConf = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json'), 'utf8')
);
const resources = tauriConf.bundle && tauriConf.bundle.resources;
assert.ok(resources, 'bundle.resources present');

const cnKey = 'resources/vosk/vosk-model-small-cn-0.22/';
const enKey = 'resources/vosk/vosk-model-small-en-us-0.15/';
assert.equal(resources[cnKey], cnKey, 'CN model bundled in tauri.conf.json');
assert.equal(resources[enKey], enKey, 'EN model bundled in tauri.conf.json');

const confRs = fs.readFileSync(
  path.join(__dirname, '..', 'src-tauri', 'src', 'config.rs'),
  'utf8'
);
assert.ok(confRs.includes('vosk-model-small-en-us-0.15'), 'config.rs knows EN path');

console.log('ok: prepare-vosk + installer bundle include CN and EN');
