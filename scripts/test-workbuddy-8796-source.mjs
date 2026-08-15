/**
 * Guard: 8796 accepts workbuddy_hook (and sibling shell sources) — not invalid_source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src-tauri/src/codex_app_state.rs'), 'utf8');

assert.ok(
  /"workbuddy_hook" => Some\("workbuddy_hook"\)/.test(src),
  'normalize_source must accept workbuddy_hook'
);
assert.ok(
  /"trae_code_hook" \| "trae_hook" => Some\("trae_hook"\)/.test(src) &&
    /"qoder_hook" => Some\("qoder_hook"\)/.test(src),
  'shell siblings accepted (trae_code_hook + legacy trae_hook)'
);
assert.ok(
  src.includes('assert_eq!(normalize_source("workbuddy_hook")'),
  'unit test locks workbuddy_hook accept'
);

console.log('ok workbuddy-8796-source');
