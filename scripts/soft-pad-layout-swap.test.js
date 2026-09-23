/**
 * Virtual keyboard page: Soft Pad preview is the left column, command list the right.
 * When the command list is hidden, the pad fills the mid stage.
 */
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "../src/css/soft-pad-hub.css"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../src/index.html"), "utf8");
const i18n = fs.readFileSync(path.join(__dirname, "../src/js/core/i18n.js"), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const desk = css.slice(
  css.indexOf(".soft-pad-face-pad--desk.soft-pad-face-pad--pad-mid {"),
  css.indexOf(".soft-pad-mid-fn-swap {")
);
assert(desk.includes("minmax(300px, 360px) minmax(0, 1fr) !important"), "readable pad column, commands expand");
assert(desk.includes("border-radius: 16px"), "pad + commands share one card");
assert(desk.includes("height: 100%"), "card fills mid stage");
assert(
  desk.includes(":not(:has(.soft-pad-mid-fn-swap:not([hidden])))"),
  "idle pad fills mid when commands are hidden"
);
assert(
  desk.includes(".soft-pad-mid-ability") && desk.includes("display: flex !important"),
  "binding keeps ability/data under the pad"
);

const swap = css.slice(css.indexOf(".soft-pad-mid-fn-swap {"), css.indexOf(".soft-pad-mid-fn-swap[hidden]"));
assert(swap.includes("grid-column: 2"), "command list is the right column");
assert(swap.includes("border-left:"), "divider sits on the command list's left edge");

const stackAt = css.indexOf(".soft-pad-mid-stack {\n  grid-column: 1;");
assert(stackAt > 0, "pad stack is the left column");

assert(html.includes("右侧点功能会绑到当前键"), "hint points at the command list on the right");
assert(html.includes("绑到左侧正在编辑的键"), "command lead points at the pad on the left");
assert(html.includes("softpad-one-card-4"), "css cache bust refreshed");
assert(i18n.includes("softPadMidPadHint:'蓝框 = 正在编辑 · 点其它键可切换 · 右侧点功能会绑到当前键'"), "zh hint");
assert(!i18n.includes("绑到右侧正在编辑的键"), "old lead removed");

const face = html.slice(html.indexOf('id="softPadFacePad"'), html.indexOf('id="softPadPadRing"'));
assert(
  face.indexOf('id="softPadMidStack"') < face.indexOf('id="softPadFnSwapHost"'),
  "DOM order: pad then commands"
);

console.log("ok: pad left, commands right");
