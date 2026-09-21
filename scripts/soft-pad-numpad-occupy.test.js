/**
 * Soft Pad steals physical numpad only when「数字键占用」+ NumLock off.
 * NumLock on → digit. Occupy off → digit/Home pass-through.
 * Routes still index via normalize (NumLock-off Home maps to Soft Pad seat).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const layer = fs.readFileSync(
  path.join(root, "src-tauri/src/codex_numpad_layer.rs"),
  "utf8"
);
const store = fs.readFileSync(
  path.join(root, "src-tauri/src/soft_pad_runtime/store.rs"),
  "utf8"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(layer.includes("fn should_swallow_bound_numpad"), "swallow decision helper");
assert(
  /has_route && require_num_lock_off && num_lock_off/.test(layer),
  "swallow only with occupy + NumLock off"
);
assert(layer.includes("soft_pad_swallows_only_with_occupy_and_numlock_off"), "regression test");
assert(!layer.includes("pad.require_num_lock_off && route.source_scan"), "routes not gated on occupy");
assert(store.includes("normalize_numpad_physical"), "store indexes normalized scan");
assert(!store.includes("pad.require_num_lock_off && route.source_scan"), "store not gated on occupy");

console.log("ok: Soft Pad occupy + NumLock off only");
