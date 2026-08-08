/**
 * Cursor Activity Provider self-check — three levels.
 * L1 static: always runs (must pass without Cursor installed).
 * L2 fixture: scripts/fixtures/cursor-activity/state.vscdb — must count turns.
 * L3 live: %APPDATA%/Cursor/.../state.vscdb — print totals; skip if missing;
 *         schema must parse; turns may be 0 (day edge) without failing CI.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const rust = read('src-tauri/src/cursor_local_activity.rs');
const hub = read('src/js/features/agent/soft-pad-hub-ui.js');
const overlay = read('src/codex-micro-overlay.html');
const padUi = read('src/js/features/agent/codex-micro-pad-ui.js');
const docs = read('docs/soft-pad-usage-phase-b.md');

// --- L1 static ---
assert.ok(/fn detect_composer_headers/.test(rust), 'L1 detect_composer_headers');
assert.ok(/fn detect_composer_data/.test(rust), 'L1 detect_composer_data');
assert.ok(/fn detect_bubble_schema/.test(rust), 'L1 detect_bubble_schema');
assert.ok(/cursorAuth\//.test(rust), 'L1 auth refuse');
assert.ok(/REFRESH_SECS:\s*u64\s*=\s*10\s*\*\s*60/.test(rust), 'L1 refresh 10m');
assert.ok(!/remaining_percent:\s*Some/.test(rust), 'L1 never Some(remaining)');
assert.ok(/consent_enabled\(\)/.test(rust), 'L1 consent gate');
assert.ok(!/usage_env_enabled\(\)/.test(rust) || /Gated by consent only/.test(rust), 'L1 not usage-env gated');
assert.ok(/file:\/\/\//.test(rust) && /mode=ro/.test(rust), 'L1 uri mode=ro open');

assert.ok(/Cursor 本地活动统计/.test(hub) && /Cursor 本地活动统计/.test(padUi), 'L1 privacy title');
assert.ok(/用于显示：/.test(hub) && /用于显示：/.test(padUi), 'L1 privacy reads');
assert.ok(/今日对话次数/.test(hub), 'L1 allow turns copy');
assert.ok(/Agent 会话数量/.test(hub), 'L1 allow sessions copy');
assert.ok(/使用活跃时间/.test(hub), 'L1 allow active copy');
assert.ok(/次对话/.test(hub), 'L1 hub turns');
assert.ok(/较昨日对话/.test(hub), 'L1 hub delta');
assert.ok(/Cu · /.test(overlay) && /次/.test(overlay), 'L1 mini Cu · N次');
assert.ok(/Cursor 本地活动/.test(overlay), 'L1 hover title');
assert.ok(/function cursorChipTipText/.test(overlay), 'L1 cursorChipTipText');
assert.ok(/function cursorActivityIntensityBits/.test(overlay), 'L1 intensity bits');
assert.ok(/function usageSourceLabel/.test(overlay), 'L1 overlay usageSourceLabel');
assert.ok(/function usageSourceLabel/.test(hub), 'L1 hub usageSourceLabel');
assert.ok(/本地统计/.test(overlay) && /本地统计/.test(hub), 'L1 本地统计 label');
assert.ok(/id="overlayAgentTip"/.test(overlay), 'L1 overlayAgentTip dom');
assert.ok(/function showAgentTip/.test(overlay) && /function bindAgentTipHover/.test(overlay), 'L1 tip hover');
assert.ok(/usageCaptionSub/.test(overlay), 'L1 caption sub line');
assert.ok(/OVERLAY_WIDTH_MINI:\s*f64\s*=\s*320/.test(read('src-tauri/src/codex_micro_overlay.rs')), 'L1 mini width 320');
assert.ok(/min-width:\s*64px/.test(read('src/css/codex-micro-overlay.css')), 'L1 usage pill min-width');
assert.ok(/Always light tip plate/.test(read('src/css/codex-micro-overlay.css')), 'L1 tip pinned light ink');
{
  const tipMatch = overlay.match(/function cursorChipTipText\([\s\S]*?\n    function /);
  assert.ok(tipMatch, 'L1 extract cursorChipTipText');
  assert.ok(!/模型 --/.test(tipMatch[0]), 'L1 tip never 模型 --');
  assert.ok(/usageSourceLabel\(\s*['"]cursor['"]/.test(tipMatch[0]), 'L1 tip uses usageSourceLabel');
  assert.ok(!/cursor_local_activity/.test(tipMatch[0]), 'L1 tip no bare source id');
}
{
  const srcMatch = overlay.match(/function usageSourceLabel\([\s\S]*?\n    function /);
  assert.ok(srcMatch && /本地统计/.test(srcMatch[0]), 'L1 usageSourceLabel → 本地统计');
}
assert.ok(/kind==='cursor'/.test(overlay) && /cursorChipTipText\(row/.test(overlay), 'L1 chip uses cursor tip');
assert.ok(/bindAgentTipHover\(miniUsagePill/.test(overlay), 'L1 pill uses agent tip');
assert.ok(/本地活动统计模式|不提供官方额度展示/.test(docs), 'L1 docs product line');
assert.ok(!/永不占 pill/.test(docs), 'L1 no never-pill residue');

console.log('L1 static ok');

/**
 * @param {string} dbPath
 * @param {'fixture'|'live'} mode
 */
function probeDb(dbPath, mode) {
  const requireTurns = mode === 'fixture';
  const py = `
import sqlite3, json, datetime as dt
p = r'''${dbPath.replace(/\\/g, '\\\\')}'''
c = sqlite3.connect('file:' + p + '?mode=ro', uri=True)
row = c.execute("select value from ItemTable where key=?", ("composer.composerHeaders",)).fetchone()
assert row, "no headers"
j = json.loads(row[0].decode("utf-8") if isinstance(row[0], (bytes, bytearray)) else row[0])
comps = j.get("allComposers") or []
assert isinstance(comps, list), "allComposers"
assert len(comps) >= 1, "need composers in index"
local = dt.datetime.now().astimezone()
start_ms = int(local.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
yest_ms = start_ms - 86400000

def as_ms(v):
    if v is None: return 0
    if isinstance(v, (int, float)): return int(v)
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit(): return int(s)
        # Cursor bubbles: 2026-08-08T02:02:29.170Z
        if 'T' in s:
            from datetime import datetime, timezone
            try:
                if s.endswith('Z'): s = s[:-1] + '+00:00'
                return int(datetime.fromisoformat(s).timestamp() * 1000)
            except Exception:
                return 0
    return 0

sessions = 0
turns = 0
spans = []
# Match writer: include composers touched in last 2 local days for turn scan
for x in comps:
    ts = as_ms(x.get("lastUpdatedAt")) or as_ms(x.get("createdAt"))
    if ts >= start_ms:
        sessions += 1
    if ts < yest_ms:
        continue
    cid = x.get("composerId")
    if not cid: continue
    r = c.execute("select value from cursorDiskKV where key=?", ("composerData:"+cid,)).fetchone()
    if not r: continue
    cd = json.loads(r[0].decode("utf-8") if isinstance(r[0], (bytes, bytearray)) else r[0])
    hdrs = cd.get("fullConversationHeadersOnly") or []
    day = []
    for h in hdrs:
        if h.get("type") != 1: continue
        bid = h.get("bubbleId")
        if not bid: continue
        b = c.execute("select value from cursorDiskKV where key=?", ("bubbleId:%s:%s"%(cid,bid),)).fetchone()
        if not b: continue
        bubble = json.loads(b[0].decode("utf-8") if isinstance(b[0], (bytes, bytearray)) else b[0])
        ca = as_ms(bubble.get("createdAt"))
        if ca >= start_ms:
            turns += 1
            day.append(ca)
    if day:
        spans.append((min(day), max(day)))
active = sum(b - a for a, b in spans)
print("PROBE ${mode} sessions=%s turns=%s active=%ss" % (sessions, turns, int(active/1000)))
if ${requireTurns ? 'True' : 'False'}:
    assert sessions >= 1, "need session"
    assert turns >= 1, "need user turns"
`;
  const r = spawnSync('python', ['-c', py], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(mode + ' probe failed');
  }
  const out = String(r.stdout || '');
  assert.ok(/PROBE /.test(out), mode + ' probe output');
  console.log(out.trim());
  return out;
}

// --- L2 fixture ---
const fixture = join(root, 'scripts/fixtures/cursor-activity/state.vscdb');
assert.ok(existsSync(fixture), 'L2 fixture file present');
probeDb(fixture, 'fixture');
console.log('L2 fixture ok');

// --- L3 live (optional) ---
const live = join(
  process.env.APPDATA || '',
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb'
);
if (!existsSync(live)) {
  console.log('L3 live skip (no Cursor state.vscdb)');
} else {
  probeDb(live, 'live');
  console.log('L3 live ok');
}

console.log('ok cursor-activity');
