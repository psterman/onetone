'use strict';

/**
 * Guard: habits hub is a light orchestration hub — channel doors + micro-status,
 * not a second full settings surface with inline keys/voice/camera/softpad editors.
 * Density: channel CTAs live in .habit-hub-config-menu; admin in .habit-hub-more-menu.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var hub = fs.readFileSync(path.join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(hub.includes('function hubChannelMicroPillsHtml'));
assert.ok(hub.includes('habit-hub-micro-pills'));
assert.ok(hub.includes('data-habit-scenario-keys'));
assert.ok(hub.includes('data-habit-scenario-voice'));
assert.ok(hub.includes('data-habit-scenario-camera'));
assert.ok(hub.includes('data-habit-scenario-softpad'));
assert.ok(hub.includes('data-habit-scenario-use'));
assert.ok(hub.includes('returnToHub:true'));
assert.ok(hub.includes('habitHubEditReturn=true'));
assert.ok(hub.includes('data-habit-global-voice'));
assert.ok(hub.includes('data-habit-global-camera'));
assert.ok(hub.includes('habit-hub-config-menu'));
assert.ok(hub.includes('habit-hub-more-menu'));
assert.ok(hub.includes('function closeHubMenus'));
assert.ok(hub.includes('function bindHubMenuBehavior'));
assert.ok(hub.includes('function isBatchSelectMode'));
assert.ok(hub.includes('data-habit-batch-toggle'));
assert.ok(!hub.includes('data-habit-global-home'));
assert.ok(!/默认底座/.test(hub));

// Fat-hub forbidden: do not mount channel editors inside renderCard / hub list HTML.
var renderCard = hub.match(/function renderCard\([\s\S]*?\n  function /);
assert.ok(renderCard, 'renderCard missing');
assert.ok(!/habitKeyMapCellTrigger|keys-capture|voiceRecognizeSourceGrid|__otMountVoice|cmd_start_record/.test(renderCard[0]));
assert.ok(!/function openEditKeycap|codex-micro-pad__layout/.test(renderCard[0]));

// Density: channel doors only inside config menu markup helpers / card branch.
var cardBody = renderCard[0];
assert.ok(cardBody.includes('habit-hub-config-menu'));
assert.ok(cardBody.includes('habit-hub-more-menu'));
// Direct CTA attributes for channels must appear only as menuItemBtn args inside config menu,
// not as bare ctaActBtn in the persistent actions strip.
assert.ok(!/ctaActBtn\('data-habit-scenario-keys/.test(cardBody));
assert.ok(!/ctaActBtn\('data-habit-scenario-voice/.test(cardBody));
assert.ok(!/ctaActBtn\('data-habit-scenario-camera/.test(cardBody));
assert.ok(!/ctaActBtn\('data-habit-scenario-softpad/.test(cardBody));
assert.ok(/menuItemBtn\('data-habit-scenario-keys/.test(cardBody));
assert.ok(/menuItemBtn\('data-habit-dup/.test(cardBody));
assert.ok(/menuItemBtn\('data-habit-del/.test(cardBody));

// Enable active fallback — no dirty 停用+正在使用
assert.ok(hub.includes('showActive'));
assert.ok(/!enableM\.enabled&&String\(cfgEn\.activeSceneId/.test(hub));

assert.ok(css.includes('.habit-hub-micro-pill'));
assert.ok(css.includes('.habit-hub-body--full') || css.includes('habit-hub-body--full'));
assert.ok(css.includes('.habit-hub-config-menu'));
assert.ok(html.includes('habitHubGuideBar'));
assert.ok(html.includes('habit-hub-body--full'));
assert.ok(!html.includes('id="habitHubAside"'));
assert.ok(i18n.includes("habitHubGlobalDefaultDesc:'平时默认使用这套动作"));
assert.ok(!i18n.includes('动作底座'));
assert.ok(i18n.includes("habitHubConfigChannels:'配置'"));

console.log('ok habit-hub-light-orchestrator');
