/**
 * Contract: pasteAndSend has empty default chord and must still resolve Soft Pad routes.
 * Regression for "粘贴不能使用了" — empty trigger was dropped in overlay + store.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const bindings = fs.readFileSync(
  path.join(root, "src-tauri/src/agent/bindings_build.rs"),
  "utf8"
);
const overlay = fs.readFileSync(
  path.join(root, "src-tauri/src/codex_micro_overlay.rs"),
  "utf8"
);
const store = fs.readFileSync(
  path.join(root, "src-tauri/src/soft_pad_runtime/store.rs"),
  "utf8"
);
const dispatch = fs.readFileSync(
  path.join(root, "src-tauri/src/ipc/runtime_dispatch.rs"),
  "utf8"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(bindings.includes('fn is_chordless_soft_pad_slot'), "helper missing");
assert(bindings.includes('"pasteAndSend" | "runTargetSequence" | "summonCodex"'), "chordless set");
assert(bindings.includes('starts_with("custom_")'), "custom Soft Pad shortcuts are chordless");
assert(bindings.includes('"pasteAndSend" => ""'), "empty default chord");

assert(overlay.includes("is_chordless_soft_pad_slot"), "overlay must allow chordless");
assert(
  /if trigger\.is_empty\(\)\s*\n\s*&& !crate::agent::bindings_build::is_chordless_soft_pad_slot/.test(
    overlay
  ),
  "overlay must not drop pasteAndSend on empty trigger"
);
assert(overlay.includes("paste_and_send_resolves_with_empty_trigger"), "overlay unit test");

assert(store.includes("is_chordless_soft_pad_slot"), "store must allow chordless");
assert(dispatch.includes("run_paste_and_send"), "dispatch still wires paste");

const config = fs.readFileSync(
  path.join(root, "src-tauri/src/config.rs"),
  "utf8"
);
assert(
  /fn agent_key_binding_for_slot[\s\S]*?is_chordless_soft_pad_slot/.test(config),
  "agent_key_binding_for_slot must accept empty chord for pasteAndSend"
);
assert(config.includes('b.action_id.trim() == "app.shortcut"'), "app.shortcut empty trigger ok");

const keyChord = fs.readFileSync(
  path.join(root, "src-tauri/src/key_chord.rs"),
  "utf8"
);
assert(keyChord.includes("fn is_os_edit_chord"), "OS edit chord helper");
assert(keyChord.includes('"Ctrl+V"'), "Ctrl+V never RegisterHotKey");

const padUi = fs.readFileSync(
  path.join(root, "src/js/features/agent/codex-micro-pad-ui.js"),
  "utf8"
);
assert(padUi.includes("slotId === 'paste') slotId = 'pasteAndSend'"), "catalog paste → pasteAndSend");
assert(padUi.includes("var triggerChord = '';"), "custom Soft Pad trigger stays empty");

console.log("ok: soft-pad pasteAndSend chordless route contract");
