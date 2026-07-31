// Guard: inline create soft-recommends current foreground app (skips self).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hub = readFileSync(join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
const rules = readFileSync(join(root, 'src/js/features/mapping/app-behavior-rules.js'), 'utf8');
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

assert.match(hub, /cmd_foreground_app/);
assert.match(hub, /refreshInlineCreateForeground/);
assert.match(hub, /data-habit-create-fg/);
assert.match(hub, /data-habit-open-fg-existing/);
assert.match(hub, /isSelfForegroundIdentity/);
assert.match(hub, /acceptForegroundRecommend/);
assert.match(hub, /renderFgRecommendCard/);
assert.match(rules, /pickRunningIdentity:pickRunningIdentity/);
assert.match(i18n, /habitHubFgBadge/);
assert.match(i18n, /habitHubFgRecommendTitle/);
assert.match(i18n, /habitHubFgRecommendHint/);

console.log('ok habit-fg-recommend');
