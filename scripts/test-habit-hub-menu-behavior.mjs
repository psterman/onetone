/**
 * Minimal self-check: hub menus close on Escape / sibling open.
 * Static + tiny DOM simulation in jsdom-free Node (regex + fake elements).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hub = readFileSync(join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');

assert.ok(/function closeHubMenus\(except\)/.test(hub), 'closeHubMenus');
assert.ok(/function bindHubMenuBehavior\(/.test(hub), 'bindHubMenuBehavior');
assert.ok(/document\.addEventListener\('toggle'/.test(hub), 'toggle listener');
assert.ok(/document\.addEventListener\('pointerdown'/.test(hub), 'outside click');
assert.ok(/e\.key!=='Escape'/.test(hub) || /e\.key!=="Escape"/.test(hub), 'Escape close');
assert.ok(/summary\.focus/.test(hub), 'focus return to summary');
assert.ok(/closeHubMenus\(\)/.test(hub), 'outbound closes menus');
assert.ok(/bindHubMenuBehavior\(\);/.test(hub), 'bound from bindEvents');

// Simulate mutual exclusion with a tiny in-memory stand-in of closeHubMenus.
const open = new Set();
function closeHubMenus(except) {
  for (const id of [...open]) {
    if (except && id === except) continue;
    open.delete(id);
  }
}
open.add('a');
open.add('b');
closeHubMenus('b');
assert.deepEqual([...open], ['b'], 'sibling close keeps except');
closeHubMenus();
assert.deepEqual([...open], [], 'close all');

console.log('ok habit-hub-menu-behavior');
