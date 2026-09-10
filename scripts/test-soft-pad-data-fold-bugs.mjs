/**
 * Self-check: folded mini+data must not wipe live cards; goto/pad enable/connect host wired.
 * Run: node scripts/test-soft-pad-data-fold-bugs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(
  /foldData && \(tab === 'mini' \|\| tab === 'data'\)/.test(padUi) ||
    /data-fold-data-into-mini[\s\S]{0,400}renderAgentDataPanel/.test(padUi),
  'applyAgentWorkbenchTab must keep data panel when foldDataIntoMini'
);
assert(
  /data-act="agent-pad-enable"/.test(padUi) &&
    /querySelectorAll\('\[data-act="agent-pad-enable"\]'\)/.test(padUi),
  'Pad readiness toggle must bind agent-pad-enable'
);
assert(
  /fold && next === 'data'/.test(padUi) &&
    /scrollIntoView/.test(padUi),
  '用量来源 must scroll to data panel when folded'
);
assert(
  /data-connect-host="1"/.test(padUi) &&
    /data-connect-mode="scope"/.test(padUi) &&
    /mode === 'scope'/.test(padUi) &&
    /outerHTML = renderConnectStatusSectionHtml/.test(padUi),
  'scope connect section must be host + refreshable'
);
assert(
  /soft-pad-cursor-activity__meter/.test(padUi) &&
    /soft-pad-cursor-live__stats/.test(padUi) &&
    /soft-pad-cursor-activity__meter/.test(css),
  'Cursor activity + live readings need visual markup/CSS'
);
assert(
  /data-purpose-locked="1"/.test(padUi),
  'Cursor AG purpose must be locked badge, not dead button'
);
assert(
  /refreshCursorActivityPrefDom\(body\)/.test(padUi),
  'enable/disable must refresh consent buttons in panel'
);

console.log('ok: soft-pad data fold / pad enable / connect / cursor viz');
