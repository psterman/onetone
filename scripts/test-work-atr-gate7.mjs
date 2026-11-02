/**
 * Gate 7 — real Provider verification for work-mode ATR.
 * Never mock-pass. Missing credentials / no live IPC → mark not_run and exit 0.
 *
 * Run: node scripts/test-work-atr-gate7.mjs
 * Optional: ONETONE_GATE7_LIVE=1 with a running OneTone app IPC (not available in CI).
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('scripts', 'gate7-work-atr-results.json');

const cases = [
  { id: 'minimax_success', label: 'MiniMax ATR success' },
  { id: 'minimax_fallback_workbuddy', label: 'MiniMax fail → WorkBuddy fallback' },
  { id: 'workbuddy_stream_complete', label: 'WorkBuddy streaming complete' },
  { id: 'workbuddy_cancel', label: 'WorkBuddy cancel' },
  { id: 'atr_planning', label: 'ATR planning ProviderCall' },
  { id: 'atr_tool_decision', label: 'ATR toolDecision ProviderCall' },
  { id: 'atr_repair', label: 'ATR repair ProviderCall' },
  { id: 'atr_synthesis', label: 'ATR synthesis/finish ProviderCall' }
];

function result(id, status, detail) {
  return {
    id,
    status, // pass | fail | not_run
    detail: detail || null,
    at: new Date().toISOString()
  };
}

async function main() {
  const live = String(process.env.ONETONE_GATE7_LIVE || '') === '1';
  const rows = [];

  if (!live) {
    for (const c of cases) {
      rows.push(
        result(
          c.id,
          'not_run',
          'No live IPC / credentials in this environment. Set ONETONE_GATE7_LIVE=1 to attempt.'
        )
      );
    }
    fs.writeFileSync(
      OUT,
      JSON.stringify({ schemaVersion: 1, live: false, results: rows }, null, 2),
      'utf8'
    );
    console.log('test-work-atr-gate7: not_run (all cases) →', OUT);
    return;
  }

  // Live harness placeholder: without a desktop IPC bridge we still refuse to mock.
  for (const c of cases) {
    rows.push(
      result(
        c.id,
        'not_run',
        'ONETONE_GATE7_LIVE=1 set but no Gate7 IPC harness wired yet — refuse mock pass'
      )
    );
  }
  fs.writeFileSync(
    OUT,
    JSON.stringify({ schemaVersion: 1, live: true, results: rows }, null, 2),
    'utf8'
  );
  console.log('test-work-atr-gate7: live requested but harness absent → not_run →', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
