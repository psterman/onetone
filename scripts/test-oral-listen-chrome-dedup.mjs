/**
 * Guard: oral listen caption uses wave badge + live ASR name — never stacks
 *「口头收听中」+「可说」list + chips. Agent focus chrome unchanged.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/codex-micro-overlay.html'), 'utf8');
const css = readFileSync(join(root, 'src/css/codex-micro-overlay.css'), 'utf8');

assert.ok(
  html.includes('overlay-key-caption__wave') && html.includes('<i></i><i></i><i></i><i></i><i></i>'),
  'caption badge is waveform bars, not「口头收听中」text'
);
assert.ok(
  html.includes('data-cap-heard') && html.includes('overlay-key-caption__heard'),
  'oral caption has dedicated ASR heard slot'
);
assert.ok(
  html.includes('oralListenOwnsCaption') && html.includes('if(oralListenOwnsCaption()) return'),
  'key hover does not steal oral heard line'
);
assert.ok(
  html.includes('function ensureOralWaveBadge') && html.includes('ensureOralWaveBadge(capBadge)'),
  'oral arm re-injects wave badge (survives stale overlay DOM)'
);
assert.ok(
  html.includes('if(oralOn) armHint=\'\'') || html.includes('if(oralOn) armHint="";'),
  'beginner caption skips oral status prose'
);
assert.ok(
  /data-cap-badge[^>]*>[\s\S]*?口头收听中[\s\S]*?<\/span>/.test(html) === false ||
    html.includes('aria-label="口头收听中"'),
  '口头收听中 only as aria-label on badge'
);
assert.ok(
  !/>口头收听中</.test(html),
  'no visible「口头收听中」text node in overlay HTML'
);
assert.ok(
  html.includes('voiceHeardPartial') &&
    html.includes('capHeard.textContent=vHeard') &&
    html.includes("needAim?armHint:''"),
  'applyOralListenMini paints ASR into heard slot; aim stays on name'
);
assert.ok(html.includes("is-oral-cmds"), 'caption marks chip-led oral layout');
assert.ok(
  css.includes('.overlay-key-caption__name:empty'),
  'empty oral name line collapses'
);
assert.ok(
  css.includes('.overlay-key-caption__wave') && css.includes('@keyframes oral-wave'),
  'wave badge CSS present'
);
assert.ok(
  css.includes('.soft-pad-agent-bar:has(.is-usage-focus)') &&
    css.includes('opacity: 0.48'),
  'non-current agent chips dim when one is focused'
);
assert.ok(
  css.includes('.soft-pad-agent-bar__chip.is-usage-focus') &&
    css.includes('.soft-pad-agent-bar__chip.is-usage-focus::after'),
  'current agent has shared strong chrome + marker'
);

console.log('ok oral-listen-chrome-dedup');
