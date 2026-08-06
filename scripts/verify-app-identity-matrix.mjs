#!/usr/bin/env node
/**
 * AppIdentity v2 verify matrix (JS mirror of Rust matcher + config-persist shape).
 * Run: node scripts/verify-app-identity-matrix.mjs
 */
'use strict';

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

function normalizeMatchSpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const exeNames = Array.isArray(raw.exeNames)
    ? raw.exeNames.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  const pathContains = raw.pathContains != null ? String(raw.pathContains).trim() : '';
  const titleContains = raw.titleContains != null ? String(raw.titleContains).trim() : '';
  if (!exeNames.length && !pathContains && !titleContains) return null;
  const out = {};
  if (exeNames.length) out.exeNames = exeNames;
  if (pathContains) out.pathContains = pathContains;
  if (titleContains) out.titleContains = titleContains;
  return out;
}

function normalizeAppBehaviorRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const appId = String(r.appId || r.app_id || '').trim();
      if (!appId) return null;
      let ruleId = String(r.ruleId || r.rule_id || '').trim();
      if (!ruleId) ruleId = 'rule-test-' + Math.random();
      const out = {
        ruleId,
        appId,
        finishMode: String(r.finishMode || r.finish_mode || 'confirm').trim() || 'confirm',
        note: r.note != null ? String(r.note) : '',
      };
      const summon = r.summonPhrase != null ? r.summonPhrase : r.summon_phrase;
      if (summon != null && String(summon).trim()) out.summonPhrase = String(summon).trim();
      const display = r.displayName != null ? r.displayName : r.display_name;
      if (display != null && String(display).trim()) out.displayName = String(display).trim();
      const matchSpec = normalizeMatchSpec(r.match);
      if (matchSpec) out.match = matchSpec;
      return out;
    })
    .filter(Boolean);
}

function serializeAppBehaviorRules(rules) {
  return normalizeAppBehaviorRules(rules).map((r) => {
    const out = { ruleId: r.ruleId, appId: r.appId, finishMode: r.finishMode, note: r.note || '' };
    if (r.summonPhrase) out.summonPhrase = r.summonPhrase;
    if (r.displayName) out.displayName = r.displayName;
    if (r.match) out.match = r.match;
    return out;
  });
}

const PRESETS = new Set([
  'cursor-chat',
  'codex-chat',
  'claude-code',
  'minimax-chat',
  'workbuddy-chat',
  'trae-chat',
  'qoder-chat'
]);

function ruleIsExplicitMatch(rule) {
  if (!rule || !rule.match) return false;
  return !!(
    (rule.match.exeNames && rule.match.exeNames.length) ||
    (rule.match.pathContains && String(rule.match.pathContains).trim()) ||
    (rule.match.titleContains && String(rule.match.titleContains).trim())
  );
}

function ruleMatchesIdentity(rule, identity) {
  if (!rule || !identity) return false;
  const match = rule.match;
  if (match) {
    const exe = String(identity.exeName || identity.exe_name || '');
    const path = String(identity.fullPath || identity.full_path || '');
    const title = String(identity.windowTitle || identity.window_title || '');
    if (match.exeNames && match.exeNames.length) {
      const exeOk = match.exeNames.some((name) => {
        name = String(name || '').trim();
        return name && exe.toLowerCase() === name.toLowerCase();
      });
      if (!exeOk) return false;
    }
    if (match.pathContains) {
      const pathNeedle = String(match.pathContains).trim().toLowerCase();
      if (!pathNeedle || path.toLowerCase().indexOf(pathNeedle) < 0) return false;
    }
    if (match.titleContains) {
      const titleNeedle = String(match.titleContains).trim().toLowerCase();
      if (!titleNeedle || title.toLowerCase().indexOf(titleNeedle) < 0) return false;
    }
    return true;
  }
  if (!PRESETS.has(rule.appId)) return false;
  const presetId =
    identity.matchedPresetAppId || identity.matched_preset_app_id || identity.appId || '';
  return String(presetId) === String(rule.appId);
}

function ruleSpecificity(rule) {
  if (!rule || !rule.match) return 0;
  let score = 0;
  if (rule.match.pathContains && String(rule.match.pathContains).trim()) score += 300;
  if (rule.match.exeNames && rule.match.exeNames.length) score += 200;
  if (rule.match.titleContains && String(rule.match.titleContains).trim()) score += 100;
  return score;
}

function matchRuleForMapping(rules, identity) {
  let best = null;
  rules.forEach((rule, idx) => {
    if (!rule || !ruleMatchesIdentity(rule, identity)) return;
    const explicit = ruleIsExplicitMatch(rule);
    const specificity = ruleSpecificity(rule);
    const replace =
      !best ||
      (explicit && !best.explicit) ||
      (explicit === best.explicit && specificity > best.specificity) ||
      (explicit === best.explicit && specificity === best.specificity && idx < best.idx);
    if (replace) best = { rule, explicit, specificity, idx };
  });
  return best ? best.rule : null;
}

// --- AND semantics ---
const andRule = {
  ruleId: 'rule-and',
  appId: 'custom',
  finishMode: 'manual',
  match: { exeNames: ['Code.exe'], pathContains: 'Cursor' },
};
assert(
  !ruleMatchesIdentity(andRule, {
    exeName: 'Code.exe',
    fullPath: 'C:\\Other\\Code.exe',
    windowTitle: '',
  }),
  'AND: exe only without path does not match'
);
assert(
  ruleMatchesIdentity(andRule, {
    exeName: 'Code.exe',
    fullPath: 'C:\\Cursor\\Code.exe',
    windowTitle: '',
  }),
  'AND: exe + path both match'
);

// --- custom beats preset ---
const rulesCursor = [
  { ruleId: 'preset-cursor', appId: 'cursor-chat', finishMode: 'perpress' },
  {
    ruleId: 'custom-cursor',
    appId: 'custom',
    finishMode: 'manual',
    match: { exeNames: ['Cursor.exe'], pathContains: 'Programs\\cursor' },
  },
];
const cursorIdentity = {
  exeName: 'Cursor.exe',
  fullPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\cursor\\Cursor.exe',
  windowTitle: 'proj',
  matchedPresetAppId: 'cursor-chat',
};
const cursorMatch = matchRuleForMapping(rulesCursor, cursorIdentity);
assert(cursorMatch && cursorMatch.ruleId === 'custom-cursor', 'custom explicit beats preset fallback');

// --- ruleId conflict (same exe, different path) ---
const rulesWeChat = [
  {
    ruleId: 'rule-wechat-a',
    appId: 'custom',
    finishMode: 'manual',
    match: { exeNames: ['WeChat.exe'], pathContains: 'Tencent\\WeChat' },
  },
  {
    ruleId: 'rule-wechat-b',
    appId: 'custom',
    finishMode: 'perpress',
    match: { exeNames: ['WeChat.exe'], pathContains: 'Weixin' },
  },
];
assert(
  matchRuleForMapping(rulesWeChat, {
    exeName: 'WeChat.exe',
    fullPath: 'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe',
    windowTitle: '',
  }).ruleId === 'rule-wechat-a',
  'ruleId conflict: path A wins'
);
assert(
  matchRuleForMapping(rulesWeChat, {
    exeName: 'WeChat.exe',
    fullPath: 'D:\\Weixin\\WeChat.exe',
    windowTitle: '',
  }).ruleId === 'rule-wechat-b',
  'ruleId conflict: path B wins'
);

// --- path degradation ---
const pathRule = {
  ruleId: 'rule-path',
  appId: 'custom',
  finishMode: 'manual',
  match: { exeNames: ['WeChat.exe'], pathContains: 'Tencent' },
};
assert(
  !ruleMatchesIdentity(pathRule, { exeName: 'WeChat.exe', fullPath: '', windowTitle: '' }),
  'path degradation: no fullPath → path rule fails'
);
const exeOnlyRule = {
  ruleId: 'rule-exe',
  appId: 'custom',
  finishMode: 'confirm',
  match: { exeNames: ['WeChat.exe'] },
};
assert(
  ruleMatchesIdentity(exeOnlyRule, { exeName: 'WeChat.exe', fullPath: '', windowTitle: 'x' }),
  'path degradation: exe-only rule still matches without path'
);

// --- save round-trip ---
const inbound = [
  {
    ruleId: 'rule-save-1',
    appId: 'custom',
    finishMode: 'manual',
    displayName: 'Microsoft Word',
    match: {
      exeNames: ['WINWORD.EXE'],
      pathContains: 'Microsoft Office',
      titleContains: 'Document',
    },
  },
];
const serialized = serializeAppBehaviorRules(inbound);
const round = normalizeAppBehaviorRules(serialized);
assert(round.length === 1, 'round-trip: one rule');
const r = round[0];
assert(r.ruleId === 'rule-save-1', 'round-trip: ruleId');
assert(r.displayName === 'Microsoft Word', 'round-trip: displayName');
assert(r.match.exeNames[0] === 'WINWORD.EXE', 'round-trip: exeNames');
assert(r.match.pathContains === 'Microsoft Office', 'round-trip: pathContains');
assert(r.match.titleContains === 'Document', 'round-trip: titleContains');

function pathHasMarker(path, marker) {
  return String(path || '').toLowerCase().indexOf(String(marker || '').toLowerCase()) >= 0;
}
function presetPathMatch(path) {
  var file = String(path || '').split(/[\\/]/).pop() || '';
  if (file.toLowerCase() === 'workbuddy.exe' &&
      (pathHasMarker(path, 'WorkBuddy') || pathHasMarker(path, 'CodeBuddy'))) {
    return 'workbuddy-chat';
  }
  if (file.toLowerCase() === 'trae solo.exe' &&
      (pathHasMarker(path, 'Trae') || pathHasMarker(path, 'TRAE SOLO'))) {
    return 'trae-chat';
  }
  return '';
}
assert(
  presetPathMatch('C:\\Users\\Administrator\\Desktop\\WorkBuddy\\WorkBuddy.exe') === 'workbuddy-chat',
  'preset: WorkBuddy desktop path'
);
assert(
  presetPathMatch('D:\\TRAE SOLO\\TRAE SOLO.exe') === 'trae-chat',
  'preset: Trae SOLO path'
);

if (failed) {
  console.error('\n' + failed + ' assertion(s) failed');
  process.exit(1);
}
console.log('\nAll AppIdentity verify-matrix checks passed (' + (11) + ' cases).');
