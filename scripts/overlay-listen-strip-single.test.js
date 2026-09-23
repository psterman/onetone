/**
 * Beginner arm: one caption strip only — never toast a second overlapping pill.
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "../src/codex-micro-overlay.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../src/css/codex-micro-overlay.css"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(!/toast\(flowHint\?\(armHint/.test(html), "no duplicate arm toast under Soft Pad caption");
assert(
  /is-beginner-arm-caption[\s\S]{0,400}flowHint/.test(html) ||
    /flowHint[\s\S]{0,400}is-beginner-arm-caption/.test(html),
  "arm caption carries flow as secondary line"
);
assert(
  css.includes("overlay-key-caption.is-beginner-arm-caption .overlay-key-caption__chord"),
  "arm caption chord has dedicated style"
);

console.log("ok: overlay listen strip single");
