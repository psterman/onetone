/**
 * Soft Pad skins prototype-parity smoke check.
 * Asserts Keys Core / Spatial / Status Rings tokens landed in skins.css
 * and global press no longer force-overrides skinned keys.
 */
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var root = path.join(__dirname, '..');

var skins = fs.readFileSync(path.join(root, 'src/css/codex-micro-pad-skins.css'), 'utf8');
var pad = fs.readFileSync(path.join(root, 'src/css/codex-micro-pad.css'), 'utf8');
var overlay = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var ovHtml = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');

assert.ok(indexHtml.includes('codex-micro-pad-skins.css'), 'index links skins.css');
assert.ok(ovHtml.includes('codex-micro-pad-skins.css'), 'overlay links skins.css');

assert.ok(/--press-dist:\s*6px/.test(skins), 'Keys Core press-dist 6px');
assert.ok(/0 var\(--press-dist\) 0 var\(--key-skirt\)/.test(skins), 'skirt layer in shadow stack');
assert.ok(/--ring-w:\s*1\.5px/.test(skins), 'status ring width');
assert.ok(/blur\(80px\)\s+saturate\(180%\)/.test(skins), 'Spatial chassis blur 80px');
assert.ok(/mix-blend-mode:\s*overlay/.test(skins), 'Spatial key specular');
assert.ok(/0 0 80px var\(--bumper-glow\)/.test(skins), 'Status Rings bumper aura');

assert.ok(
  /micro-hw\[data-pad-skin="default"\][\s\S]*micro-key-press-bg/.test(pad),
  'pad.css press scoped to default skin'
);
assert.ok(
  !/\.micro-hw__key\.is-pressed:not\(\[data-micro-key="JOY"\]\),\s*\n\.micro-hw__key\.is-active/.test(pad),
  'ungated global press removed from pad.css'
);
assert.ok(/\.wrap\[data-light="running"\]:is\(/.test(overlay), 'data-light chassis scoped away from prototype skins');
assert.ok(overlay.includes('Prototype skins: do not let default chassis contain'), 'overlay unlocks contain for skins');
assert.ok(
  !/data-pad-skin="hybrid-pro"[\s\S]{0,400}micro-key-press-bg !important/.test(overlay),
  'overlay no longer force-presses hybrid-pro'
);

var mac = fs.readFileSync(path.join(root, 'prototypes/softpad-all-pages-mac/index.html'), 'utf8');
assert.ok(/data-skin="hybrid-pro"/.test(mac) && /--press-dist:\s*5px|--press-dist:\s*6px/.test(mac), 'Mac pack has Keys Core preview');
assert.ok(/状态光环/.test(mac) && /data-skin="vibe-light"/.test(mac), 'Mac pack Status Rings label');
assert.ok(/hw\.dataset\.skin\s*=\s*state\.skin/.test(mac), 'Mac pack skin switch paints preview');

assert.ok(/overflow:\s*visible/.test(skins) && /contain:\s*none/.test(skins), 'skirts not clipped');

var hub = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');
assert.ok(
  /#softPadPreviewHost \.micro-hw\[data-pad-skin="default"\]/.test(hub),
  'mid-pad flat chassis scoped to default skin'
);
assert.ok(
  /\.soft-pad-mode-preview \.micro-hw\[data-pad-skin="default"\] \.micro-hw__key--agent/.test(hub),
  'mode-preview flat agent scoped to default'
);
assert.ok(
  /gap:\s*10px !important/.test(hub),
  'skin preview restores 10px gap so 6px skirts show'
);

console.log('soft-pad-skins-proto.test.js: ok');
