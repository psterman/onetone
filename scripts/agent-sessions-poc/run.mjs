/**
 * Post-PoC leak scan + fixture gate.
 * Real-provider compatibility gate is asserted only when ONETONE_POC_REQUIRE_REAL=1.
 *
 * Expects: cargo run wrote test-output/agent-sessions-poc-summary.json
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const summaryPath = path.join(root, 'test-output', 'agent-sessions-poc-summary.json');
assert.ok(
  fs.existsSync(summaryPath),
  'missing test-output/agent-sessions-poc-summary.json — run cargo PoC first'
);

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const text = fs.readFileSync(summaryPath, 'utf8');
const requireReal =
  process.argv.includes('--require-real') ||
  String(process.env.ONETONE_POC_REQUIRE_REAL || '').trim() === '1' ||
  String(process.env.ONETONE_POC_REQUIRE_REAL || '').toLowerCase() === 'true';

const leakPatterns = [
  { name: 'userProfilePath', re: /C:\\\\Users\\\\|C:\/Users\/|\/home\/[a-z0-9._-]+/i },
  { name: 'openaiKey', re: /sk-[a-zA-Z0-9]{20,}/ },
  { name: 'githubPat', re: /ghp_[a-zA-Z0-9]{20,}/ },
  { name: 'anthropicKey', re: /sk-ant-[a-zA-Z0-9-]{20,}/ },
  { name: 'longQuotedPrompt', re: /"text"\s*:\s*"[^"]{80,}"/ }
];

const leaks = [];
for (const p of leakPatterns) {
  if (p.re.test(text)) leaks.push(p.name);
}

const pocFiles = [
  'scripts/agent-sessions-poc/src/main.rs',
  'scripts/agent-sessions-poc/src/model.rs',
  'docs/agent-sessions-adoption-assessment.md'
];
for (const rel of pocFiles) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  const body = fs.readFileSync(fp, 'utf8');
  for (const p of leakPatterns) {
    if (p.name === 'longQuotedPrompt') continue;
    if (p.re.test(body)) leaks.push(`${rel}:${p.name}`);
  }
}

const failCases = (summary.cases || []).filter((c) => !c.ok).map((c) => c.case);
const real = summary.realData || {};
const compat = !!real.realProviderCompatibilityGatePassed;

const leakReport = {
  ok: leaks.length === 0 && failCases.length === 0 && (!requireReal || compat),
  requireReal,
  leaks,
  failCases,
  realProviderCompatibilityGatePassed: compat,
  gatePolicy: real.gatePolicy || null,
  codexCleanRatio: real.codexCleanRatio || null,
  claudeCleanRatio: real.claudeCleanRatio || null,
  providers: real.providers || null,
  realNotes: real.notes || [],
  msrvOk: summary.msrvOk,
  agentSessionsVersion: summary.agentSessionsVersion,
  casesOk: (summary.cases || []).filter((c) => c.ok).length,
  casesTotal: (summary.cases || []).length
};

fs.writeFileSync(
  path.join(root, 'test-output', 'agent-sessions-poc-leak-scan.json'),
  JSON.stringify(leakReport, null, 2)
);

console.log(JSON.stringify(leakReport, null, 2));
assert.equal(leaks.length, 0, 'leak scan failed: ' + leaks.join(','));
assert.equal(failCases.length, 0, 'PoC cases failed: ' + failCases.join(','));

if (!compat) {
  console.log(
    'realProviderCompatibilityGatePassed=false (portable fixture run still OK unless ONETONE_POC_REQUIRE_REAL=1)'
  );
  if (real.notes && real.notes.length) {
    for (const n of real.notes) console.log('  note:', n);
  }
}

if (requireReal) {
  assert.equal(
    compat,
    true,
    'real-provider compatibility gate failed (need ≥1 clean Complete per provider)'
  );
  console.log('ok agent-sessions-poc real compatibility gate');
}

console.log('ok agent-sessions-poc run/leak-scan');
