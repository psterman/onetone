/**
 * Contract: Soft Pad AG02 (numpad 9) must accept user remaps (e.g. switchAgent).
 * Beginner heal used to force AG02 → continue on every save/overlay tick.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const beginner = fs.readFileSync(
  path.join(root, "src-tauri/src/cursor_beginner.rs"),
  "utf8"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(beginner.includes("fn heal_cursor_beginner_pad_slots"), "heal exists");
assert(
  beginner.includes('route.micro_key_id == "AG02" && route.slot_id.trim().is_empty()'),
  "AG02 only seeded when empty"
);
assert(
  !/AG02" && route\.slot_id\.trim\(\) != "continue"/.test(beginner),
  "must not force-overwrite AG02 to continue"
);
assert(
  beginner.includes("beginner_heal_does_not_clobber_ag02_user_bind"),
  "regression unit test"
);
assert(
  beginner.includes(
    'CANCEL_LISTEN_MICRO_KEY && route.slot_id.trim().is_empty()'
  ),
  "ACT08 cancelListen only seeded when empty"
);

console.log("ok: soft-pad ag02 remap heal contract");
