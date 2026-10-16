'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var orch = fs.readFileSync(path.join(root, 'src/js/features/home/quick-start-orchestrator.js'), 'utf8');
var bridge = fs.readFileSync(path.join(root, 'src/js/core/app-bridge.js'), 'utf8');
var windowRs = fs.readFileSync(path.join(root, 'src-tauri/src/ipc/commands/shell/window.rs'), 'utf8');
var appIpc = fs.readFileSync(path.join(root, 'src-tauri/permissions/app-ipc.toml'), 'utf8');
var buildRs = fs.readFileSync(path.join(root, 'src-tauri/build.rs'), 'utf8');

assert.ok(orch.includes('cmd_window_maximize'), 'QS maximizes via IPC');
assert.ok(orch.includes('ensureFullscreenWindow'), 'QS has ensureFullscreenWindow');
assert.ok(orch.includes('firstRunSession'), 'QS tracks first-run session');
assert.ok(orch.includes("firstRun:true") || orch.includes('opts.firstRun'), 'QS accepts firstRun opt');
assert.ok(orch.includes("vp_welcome_seen"), 'QS marks welcome seen on first-run close');
assert.ok(orch.includes('onWelcomeClosed'), 'QS finishes first-run boot hooks');

assert.ok(bridge.includes('OneToneQuickStart'), 'openWelcome prefers QuickStart');
assert.ok(bridge.includes("firstRun:true"), 'openWelcome opens QS as firstRun');
assert.ok(
  bridge.indexOf('OneToneQuickStart') < bridge.indexOf('OneToneOnboarding.open'),
  'QuickStart checked before legacy onboarding'
);

assert.ok(windowRs.includes('cmd_window_maximize'), 'Rust cmd_window_maximize exists');
assert.ok(buildRs.includes('"cmd_window_maximize"'), 'build.rs registers maximize');
assert.ok(appIpc.includes('allow-cmd-window-maximize'), 'app-ipc allows maximize');

console.log('qs-first-run-fullscreen tests passed');
