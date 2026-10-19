'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/keys-workflow.css'), 'utf8');
var ime = fs.readFileSync(path.join(root, 'src/js/ime-presets.js'), 'utf8');
var ui = fs.readFileSync(path.join(root, 'src/js/features/mapping/key-finish-flow-ui.js'), 'utf8');
var picker = fs.readFileSync(
  path.join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(html.includes('keysFinishPeers'), 'peer tablist in HTML');
assert.ok(html.includes('data-finish-peer="finish"'), 'finish peer');
assert.ok(html.includes('data-finish-peer="cancel"'), 'cancel peer');
assert.ok(!html.includes('data-finish-peer="send"'), 'no 口令发送 peer');
assert.ok(html.includes('keysFinishPeerPaneCancel'), 'cancel pane');
assert.ok(css.includes('.keys-finish-peer.is-active'), 'peer active CSS');
assert.ok(css.includes('repeat(2, minmax(0, 1fr))'), 'two peer columns');
assert.ok(ui.includes('setFinishPeer'), 'peer switcher');
assert.ok(ui.includes('bindFinishPeers'), 'peer bind');
assert.ok(ime.includes("drop「选键」catalog"), 'mapping drops 选键 comment');
assert.ok(ime.includes('data-ime-custom="1"'), 'custom record kept');
assert.ok(!ime.includes('data-soft-pad-ime-picker'), 'soft-pad strip drops 选键');
assert.ok(i18n.includes("imePresetCustom:'录制'"), 'custom label → 录制');
assert.ok(picker.includes('OneToneImePresets.renderCardBadge'), 'IME badge refresh on keycap');
assert.ok(picker.includes('selection.iconHtml'), 'agent icon from selection');

var cancelSrc = fs.readFileSync(
  path.join(root, 'src/js/features/mapping/key-finish-flow-render.js'),
  'utf8'
);
assert.ok(cancelSrc.includes('cancelGestureIconSvg'), 'camera gesture icons');
assert.ok(cancelSrc.includes('keys-cancel-chip--gest'), 'gesture chip class');
assert.ok(!cancelSrc.includes('keys-cancel-demo'), 'no detailed demo markup');
assert.ok(
  cancelSrc.includes("data-cancel-channel=\"phrase\"") &&
    !cancelSrc.includes('keys-cancel-switch-slot'),
  'phrase toggle always present'
);
assert.ok(cancelSrc.includes('cancelPhrasesEnabled'), 'cancel phrase channel flag');
assert.ok(cancelSrc.includes('setCancelPhraseChannel'), 'cancel phrase channel setter');

assert.ok(html.includes('id="keysWorkTag" hidden'), '工作间 chrome hidden');
assert.ok(css.includes('.keys-finish-voice-bridge') && css.includes('display: none !important'), 'voice bridge buried');
assert.ok(css.includes('.keys-finish-adv-fold') && /keys-finish-adv-fold[\s\S]{0,80}display:\s*none\s*!important/.test(css), '详细信息 fold buried');
assert.ok(ime.includes('录制」custom chip last') || /PRESETS\.map[\s\S]+?data-ime-custom/.test(ime), '录制 chip after presets');

var scene = fs.readFileSync(
  path.join(root, 'src/js/features/mapping/keys-scene-actions-panel.js'),
  'utf8'
);
assert.ok(scene.includes('keys-scene-actions__trail--end'), 'IME trail last on action card');

var appCss = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');
assert.ok(appCss.includes('Centered record modal'), 'centered record modal CSS');

var recSrc = fs.readFileSync(
  path.join(root, 'src/js/features/mapping/mapping-recording.js'),
  'utf8'
);
assert.ok(recSrc.includes("rec.triggerSlot=triggerSlot==='oral'?'oral':(triggerSlot==='peer'?'peer':'default')"), 'peer slot preserved on start');
assert.ok(recSrc.includes('recordTriggerAlreadyUsedPeer'), 'peer conflict keeps recording');
assert.ok(recSrc.includes("mayFork=appId==='custom'&&!isPeerSlot"), 'peer never forks on retarget');
assert.ok(recSrc.includes('createCustomKeyMatchMapping({quiet:true})'), 'peer-empty auto-creates before record');

console.log('keys-finish-peers smoke ok');
