/**
 * Research baseline / compare harness.
 * - Always writes fixture metadata.
 * - Live quality runs require RESEARCH_LIVE=1 and a working app IPC (not available in plain node).
 * - Mock path only validates fixture shape; never sets qualityCompare to improved.
 *
 * Run: node scripts/research-baseline.mjs
 * Live: RESEARCH_LIVE=1 node scripts/research-baseline.mjs  (marks 未完成 unless runner injects)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixturesPath = path.join(root, 'scripts', 'research-fixtures.json');
const outRoot = path.join(root, 'logs', 'research-baseline');

const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
const live = process.env.RESEARCH_LIVE === '1';
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(outRoot, runId);
fs.mkdirSync(runDir, { recursive: true });

const summary = {
  runId,
  startedAt: new Date().toISOString(),
  liveRequested: live,
  qualityCompare: live ? '未完成' : '未完成',
  qualityCompareReason: live
    ? 'no_app_ipc: baseline script runs outside Tauri; use in-app research or attach runner'
    : 'no_live: mock/fixture-only run; not a quality verdict',
  scoring: fixtures.scoring,
  cases: []
};

for (const c of fixtures.cases) {
  const caseMeta = {
    id: c.id,
    type: c.type,
    topic: c.topic,
    userConditions: c.userConditions,
    evaluationPoints: c.evaluationPoints,
    humanScoreSheet: c.evaluationPoints.map((p) => ({
      point: p,
      covered: null,
      citationSpotCheck: null
    })),
    run: null
  };

  if (!live) {
    caseMeta.run = {
      path: 'baseline_fixture_only',
      durationMs: null,
      model: null,
      searchProvider: null,
      ledger: null,
      note: 'Skipped execution — fixture recorded for later live compare'
    };
  } else {
    caseMeta.run = {
      path: null,
      durationMs: null,
      model: null,
      searchProvider: null,
      ledger: null,
      note: 'Live IPC unavailable in node harness'
    };
  }

  const caseDir = path.join(runDir, c.id);
  fs.mkdirSync(caseDir, { recursive: true });
  fs.writeFileSync(path.join(caseDir, 'meta.json'), JSON.stringify(caseMeta, null, 2), 'utf8');
  summary.cases.push({
    id: c.id,
    type: c.type,
    topic: c.topic,
    qualityCompare: summary.qualityCompare,
    reason: summary.qualityCompareReason
  });
}

fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
fs.writeFileSync(
  path.join(outRoot, 'latest.json'),
  JSON.stringify({ runId, dir: runDir, ...summary }, null, 2),
  'utf8'
);

console.log('research-baseline: wrote', runDir);
console.log('qualityCompare:', summary.qualityCompare, '—', summary.qualityCompareReason);
