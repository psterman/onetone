'use strict';

/** Guard: last UI stall / unclean exit persists and surfaces on next boot. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var hb = fs.readFileSync(path.join(root, 'src-tauri/src/ui_heartbeat.rs'), 'utf8');
var prefs = fs.readFileSync(path.join(root, 'src-tauri/src/ipc/commands/shell/prefs.rs'), 'utf8');
var lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
var wb = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(hb.includes('last-ui-stall.json'));
assert.ok(hb.includes('session-running.json'));
assert.ok(hb.includes('UI_HB_STALL_2S'));
assert.ok(hb.includes('UNCLEAN_EXIT'));
assert.ok(hb.includes('fn on_process_start'));
assert.ok(hb.includes('fn on_graceful_exit'));
assert.ok(hb.includes('persist_stall_emergency'));

assert.ok(prefs.includes('cmd_last_ui_stall'));
assert.ok(prefs.includes('cmd_clear_last_ui_stall'));
assert.ok(lib.includes('cmd_last_ui_stall'));
assert.ok(lib.includes('on_process_start'));
assert.ok(lib.includes('on_graceful_exit'));

assert.ok(wb.includes('fetchLastUiStallOnce'));
assert.ok(wb.includes('dismissLastUiStall'));
assert.ok(wb.includes('cmd_last_ui_stall'));
assert.ok(wb.includes('cmd_clear_last_ui_stall'));
assert.ok(wb.includes('dismissLastStall'));
assert.ok(i18n.includes('homeWbAlertLastStall'));
assert.ok(i18n.includes('homeWbAlertLastStallDismiss'));

console.log('ok last-ui-stall');
