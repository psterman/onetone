/**
 * Soft Pad NAV: physical main-keyboard arrows are not captured by default.
 * Screen NAV / joystick still use NAV_* inject; capture only with opt-in + bound slot.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var numpad = fs.readFileSync(path.join(root, 'src-tauri/src/codex_numpad_layer.rs'), 'utf8');
var config = fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8');
var hotkey = fs.readFileSync(path.join(root, 'src-tauri/src/hotkey_win.rs'), 'utf8');
var padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');

assert.ok(
  /pub fn pad_should_capture_arrow\(/.test(numpad),
  'per-key capture gate must exist'
);
assert.ok(
  /capture_physical_arrows/.test(numpad) && /capture_physical_arrows/.test(config),
  'capturePhysicalArrows flag must exist in config + gate'
);
assert.ok(
  /pad_should_capture_arrow\(nav_id\)/.test(hotkey),
  'hotkey hook must use per-key capture gate'
);
assert.ok(
  !/gate\.pad_active && gate\.nav_keys_enabled/.test(numpad),
  'show-nav must not arm physical arrow capture'
);
assert.ok(
  /showNavigationPad:\s*true/.test(padUi) && /capturePhysicalArrows:\s*false/.test(padUi),
  'new Soft Pad defaults: show column on, capture off'
);
assert.ok(
  /软件增强[\s\S]{0,80}Does \*\*not\*\* enable physical|Does \*\*not\*\* enable physical main-keyboard/.test(config)
    || /Does \*\*not\*\* enable physical main-keyboard arrow capture/.test(config),
  'software enhance docs must deny physical arrow capture'
);
assert.ok(
  /spawn_nav_arrow_inject|inject_software_enhance_key/.test(
    fs.readFileSync(path.join(root, 'src-tauri/src/ipc/runtime_dispatch.rs'), 'utf8')
  ),
  'screen/joystick NAV inject path must remain'
);

console.log('soft-pad-nav-capture.test.js: ok');
