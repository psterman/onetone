/**
 * Install OneTone Soft Pad shell-agent hooks into Trae / Qoder settings.
 * Trae: ~/.trae/hooks.json as { version:1, hooks:{...} }; also ~/.trae-cn when that dir exists.
 * Qoder: ~/.qoder/settings.json under hooks; also ~/.qoder-cn when present.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const probeCandidates = [
  path.join(
    __dirname,
    '..',
    'src-tauri',
    'target-release-live',
    'release',
    'scripts',
    'agent-shell-hook-probe.js'
  ),
  path.join(__dirname, 'agent-shell-hook-probe.js')
];
const probe = probeCandidates
  .map((p) => path.resolve(p).replace(/\\/g, '/'))
  .find((p) => fs.existsSync(p));
if (!probe) {
  console.error('probe missing');
  process.exit(1);
}

const PROFILES = {
  trae_code: {
    hookId: 'trae-activity-v1',
    source: 'trae_code',
    atRoot: false,
    version: 1,
    timeout: 30,
    events: [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'Stop',
      'Notification'
    ],
    paths: () => {
      const out = [
        path.join(home, '.trae', 'hooks.json'),
        path.join(home, '.trae-cn', 'hooks.json')
      ];
      return out;
    }
  },
  qoder: {
    hookId: 'qoder-activity-v1',
    source: 'qoder',
    atRoot: false,
    timeout: 5,
    events: [
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Stop'
    ],
    paths: () => {
      const out = [path.join(home, '.qoder', 'settings.json')];
      if (fs.existsSync(path.join(home, '.qoder-cn'))) {
        out.push(path.join(home, '.qoder-cn', 'settings.json'));
      }
      return out;
    }
  }
};

function buildCmd(profile) {
  return (
    'node "' +
    probe +
    '" --onetone-hook-id ' +
    profile.hookId +
    ' --source ' +
    profile.source
  );
}

function hasHook(arr, hookId) {
  if (!Array.isArray(arr)) return false;
  return arr.some(function (m) {
    const hooks = m && m.hooks;
    if (Array.isArray(hooks)) {
      return hooks.some(function (h) {
        return String(h.command || '').includes(hookId);
      });
    }
    return String((m && m.command) || '').includes(hookId);
  });
}

function migrateTraeLegacyRoot(root) {
  const LEGACY = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'Stop',
    'Notification'
  ];
  if (root.version == null) root.version = 1;
  if (!root.hooks || typeof root.hooks !== 'object') root.hooks = {};
  for (const name of LEGACY) {
    if (Object.prototype.hasOwnProperty.call(root, name)) {
      if (root.hooks[name] == null) root.hooks[name] = root[name];
      delete root[name];
    }
  }
}

function mergeProfile(filePath, profile) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let root = {};
  if (fs.existsSync(filePath)) {
    root = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const bak = filePath + '.onetone-backup-' + Date.now();
    fs.copyFileSync(filePath, bak);
  }
  if (profile.source === 'trae' || profile.source === 'trae_code') migrateTraeLegacyRoot(root);
  else if (profile.version != null && root.version == null) root.version = profile.version;
  const cmd = buildCmd(profile);
  let bucket;
  if (profile.atRoot) {
    bucket = root;
  } else {
    if (!root.hooks || typeof root.hooks !== 'object') root.hooks = {};
    bucket = root.hooks;
  }
  const timeout = profile.timeout || 5;
  const added = [];
  const refreshed = [];
  for (const ev of profile.events) {
    if (!Array.isArray(bucket[ev])) bucket[ev] = [];
    if (hasHook(bucket[ev], profile.hookId)) {
      // Refresh command path / timeout on existing OneTone entries.
      for (const m of bucket[ev]) {
        const hooks = m && m.hooks;
        if (!Array.isArray(hooks)) continue;
        for (const h of hooks) {
          if (String(h.command || '').includes(profile.hookId)) {
            if (h.command !== cmd) {
              h.command = cmd;
              refreshed.push(ev);
            }
            h.timeout = timeout;
            h.type = h.type || 'command';
          }
        }
      }
      continue;
    }
    bucket[ev].push({
      matcher: '',
      hooks: [{ type: 'command', command: cmd, timeout }]
    });
    added.push(ev);
  }
  fs.writeFileSync(filePath, JSON.stringify(root, null, 4) + '\n');
  return { filePath, added, refreshed };
}

PROFILES.trae = PROFILES.trae_code; // legacy CLI alias

const kinds = process.argv.slice(2);
const targets = kinds.length ? kinds : ['trae_code', 'qoder'];
const report = [];
for (const kind of targets) {
  const profile = PROFILES[kind];
  if (!profile) {
    console.error('unknown kind', kind);
    process.exit(1);
  }
  for (const filePath of profile.paths()) {
    report.push(Object.assign({ kind }, mergeProfile(filePath, profile)));
  }
}
console.log(JSON.stringify({ ok: true, probe, report }, null, 2));
