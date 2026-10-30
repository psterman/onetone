/**
 * Prepare a clean git sandbox for DeepSeek / ATR desktop e2e.
 * Does not touch the main voice-pilot worktree.
 *
 * Usage: node scripts/atr-deepseek-e2e-prep.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = path.join(root, '.tmp-atr-e2e-sandbox');
const runRoot = path.join(root, 'logs', 'atr-deepseek-e2e');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function ensureSandbox() {
  fs.rmSync(sandbox, { recursive: true, force: true });
  fs.mkdirSync(path.join(sandbox, 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(sandbox, 'scratch', 'hello.txt'), 'hello\n', 'utf8');
  fs.writeFileSync(
    path.join(sandbox, 'README.md'),
    '# ATR DeepSeek e2e sandbox\n\nDisposable. Do not use as main project.\n',
    'utf8'
  );
  git(['init'], sandbox);
  git(['config', 'user.email', 'atr-e2e@onetone.local'], sandbox);
  git(['config', 'user.name', 'ATR E2E'], sandbox);
  git(['add', '-A'], sandbox);
  git(['commit', '-m', 'atr e2e baseline'], sandbox);
  const status = git(['status', '--porcelain'], sandbox);
  assert.equal(status, '', 'sandbox must be clean after commit');
  return {
    sandbox,
    files: ['scratch/hello.txt', 'README.md'],
    head: git(['rev-parse', 'HEAD'], sandbox)
  };
}

function probeDeepseekKey() {
  const candidates = [
    path.join(process.env.APPDATA || '', 'onetone', 'app', 'config', 'deepseek-api-key.txt'),
    path.join(process.env.APPDATA || '', 'onetone', 'deepseek-api-key.txt')
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const line = fs.readFileSync(p, 'utf8').split(/\r?\n/)[0].trim();
      if (line.length >= 12 && !/\s/.test(line) && line.toLowerCase() !== 'sk-xxx') {
        return {
          present: true,
          path: p,
          masked: `${line.slice(0, 4)}…${line.slice(-4)}`
        };
      }
    } catch (_) {}
  }
  return { present: false, path: null, masked: null };
}

fs.mkdirSync(runRoot, { recursive: true });
const meta = ensureSandbox();
const key = probeDeepseekKey();
const out = {
  preparedAt: new Date().toISOString(),
  sandbox: meta.sandbox,
  head: meta.head,
  files: meta.files,
  deepseekKey: key,
  flagHint: "localStorage.setItem('onetone.agentTaskRuntime','1')",
  evidenceDir: runRoot,
  operatorNext: [
    'Confirm Soft Pad DeepSeek key (deepseekReady)',
    'Open OneTone → confirm sandbox as project',
    'workMode=edit → Send goal to change scratch/hello.txt',
    'Export status/events into logs/atr-deepseek-e2e/<runId>/'
  ]
};
const metaPath = path.join(runRoot, 'prep-meta.json');
fs.writeFileSync(metaPath, JSON.stringify(out, null, 2));
console.log('atr-deepseek-e2e-prep: ok');
console.log('  sandbox:', sandbox);
console.log('  deepseekKey:', key.present ? key.masked : 'MISSING');
console.log('  meta:', metaPath);
