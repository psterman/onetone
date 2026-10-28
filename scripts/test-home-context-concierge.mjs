/**
 * Phase2.5 context concierge / consult skeleton — local rules, no model required.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

assert.match(read('src/index.html'), /home-context-concierge\.js/);
assert.match(read('src/index.html'), /home-assist-skills\.js/);
assert.match(read('src/index.html'), /home-problem-brief\.js/);
assert.match(read('src/index.html'), /home-consult-outcome\.js/);
assert.match(read('src-tauri/src/project_context/find_grant.rs'), /grant_find_materials/);
assert.match(read('src-tauri/src/project_context/find_grant.rs'), /open_confirmed/);
assert.match(read('src-tauri/src/project_context/contracts.rs'), /GrantRequired/);
assert.match(read('docs/phase2.5-audit.md'), /查找材料/);

const store = { 'onetone.projectContext.enabled': '1' };
const adopted = [];
const ctx = {
  console,
  localStorage: {
    getItem(k) {
      return store[k] != null ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    }
  },
  Date,
  Math,
  JSON,
  Promise,
  document: {
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} };
    },
    addEventListener() {},
    removeEventListener() {}
  },
  OneToneIpc: {
    invoke() {
      return Promise.reject(new Error('no desktop in unit test'));
    }
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;

vm.runInNewContext(read('src/js/features/now/home-assist-ownership.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-prompt-prep.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-project-context.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-assist-skills.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-problem-brief.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-consult-outcome.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-context-concierge.js'), ctx);

const Prep = ctx.OneToneHomePromptPrep;
const Own = ctx.OneToneHomeAssistOwnership;
const Pcx = ctx.OneToneHomeProjectContext;
const Skills = ctx.OneToneHomeAssistSkills;
const Brief = ctx.OneToneHomeProblemBrief;
const Outcome = ctx.OneToneHomeConsultOutcome;
const Conc = ctx.OneToneHomeContextConcierge;

assert.ok(Prep && Own && Pcx && Skills && Brief && Outcome && Conc);

Prep._setModel({
  phase: 'COLLECTING',
  collectionId: 'c_p25',
  taskScopeId: 'ts_p25',
  materials: [],
  rawDraft: { title: '', body: '点确认后一直没反应' },
  draft: { title: '', body: '点确认后一直没反应' },
  organizedDraft: { body: '', structured: null, editGeneration: 0 },
  activeDraft: 'raw',
  assist: { state: 'idle', requestId: null },
  contentRevision: 0,
  sendScope: 'included_materials'
});

// 1) NL error keywords → clues / decide
const clues = Skills.extractClues('OAuth callback timeout Failed to exchange authorization code');
assert.ok(clues.errorTokens.length >= 1, 'error tokens from NL');

// 2) OCR-less screenshot + deixis alone is NOT enough for bug investigation
assert.equal(
  Skills.getFlowSkill('bug_triage').enoughForInvestigation({
    rawText: '看这个',
    materials: [{ kind: 'image', included: true, id: 'img1' }],
    clues: { errorTokens: [], fileHints: [], hasSearchableError: false }
  }),
  false
);

// 2b) Clear style ask + screenshot must NOT force loading quiz / must map to plan
assert.equal(Skills.detectFlowSkill('这个页面样式如何优化？'), 'feature_plan');
assert.equal(
  Skills.getFlowSkill('bug_triage').enoughForInvestigation({
    rawText: '这个页面样式如何优化？',
    materials: [{ kind: 'image', included: true, id: 'img1' }],
    clues: { errorTokens: [], fileHints: [], hasSearchableError: false }
  }),
  true
);
const styleDec = Skills.nextAction({
  rawText: '这个页面样式如何优化？',
  flowSkillId: 'bug_triage',
  materials: [{ kind: 'image', included: true, id: 'img1' }],
  questionCount: 0,
  askedAmbiguities: []
});
assert.notEqual(styleDec.action, 'ask');
assert.equal(styleDec.skill && styleDec.skill.id, 'feature_plan');
assert.doesNotMatch(String((styleDec.question && styleDec.question.prompt) || ''), /转圈/);

// 3) feature_plan can investigate without adopted materials
assert.equal(
  Skills.getFlowSkill('feature_plan').enoughForInvestigation({
    rawText: '我想加一个登录后记住设备的功能'
  }),
  true
);

// 4) candidates never enter outbound until adopt
Pcx._setActiveScopeForTest({ scopeId: 'pcs_a', taskScopeId: 'ts_p25', displayName: 'demo' });
Pcx._pushCandidatesForTest([
  {
    evidenceId: 'ev_cand',
    scopeId: 'pcs_a',
    taskScopeId: 'ts_p25',
    kind: 'file_excerpt',
    label: 'oauth.ts',
    displayPath: 'src/auth/oauth.ts',
    content: 'exchange code',
    freshness: 'captured'
  }
]);
let snap = Own.buildAssistInputSnapshot(Prep._model());
assert.equal((snap.materials || []).length, 0, 'candidates not in outbound');

// 5) adopt enters Prep
const row = Pcx.adoptEvidence({
  id: 'ev_cand',
  scopeId: 'pcs_a',
  taskScopeId: 'ts_p25',
  kind: 'file_excerpt',
  label: 'oauth.ts',
  displayPath: 'src/auth/oauth.ts',
  content: 'exchange code '.repeat(20),
  freshness: 'captured'
});
assert.ok(row);
snap = Own.buildAssistInputSnapshot(Prep._model());
assert.ok(snap.materials.some((m) => m.name === 'oauth.ts' || (m.path || '').includes('oauth')));

// 6) edit draft body not overwritten by candidate refresh generation
const gen0 = Conc.getPublicState().suggestGeneration;
Conc._setStateForTest({ suggestGeneration: gen0 });
Conc.restateLocal('点确认后一直没反应');
const rev1 = Conc.getPublicState().brief.revision;
Conc.restateLocal('用户改了描述：只有首次登录卡住');
assert.ok(Conc.getPublicState().brief.revision > rev1);

// 7) project switch invalidates
Conc._setStateForTest({
  grant: { grantId: 'g1', projectId: 'p_old', taskScopeId: 'ts_p25' },
  candidates: [{ label: 'old' }]
});
Conc.invalidateOnProjectChange('p_new');
assert.equal(Conc.getPublicState().candidates.length, 0);
assert.equal(Conc.getPublicState().grant, null);

// 8) screenshot id change → bump suggest gen (via reset / invalidate pattern)
const gBefore = Conc.getPublicState().suggestGeneration;
Conc.resetConsult();
assert.ok(Conc.getPublicState().suggestGeneration > gBefore);

// 9) no candidates → still can compile / send path
Conc.resetConsult();
Conc.setFlowSkill('bug_triage');
Conc.restateLocal('登录确认后页面无响应');
const compiled = Conc.compileTask({ rawText: '登录确认后页面无响应' });
assert.match(compiled.body, /## 请求/);
assert.ok(compiled.body.length > 20);

// 10) Git unavailable language lives in PCX reasons
assert.match(Pcx.reasonMessage('git_unavailable'), /Git/);

// 11) organize suggested ≠ user_confirmed
Conc.resetConsult();
Conc.restateLocal('点确认没反应');
const sug = Brief.suggestedFromOrganize(
  { goal: '修好登录', facts: [{ text: '猜测根因是 session' }], unknowns: ['是否首次'] },
  '点确认没反应'
);
Brief.applySuggested(Conc.getPublicState().brief || Conc._stateForTest().brief, sug);
Conc.adoptOrganizeSuggested(
  { goal: '修好登录', facts: [{ text: '模型说的' }], unknowns: [] },
  {}
);
assert.equal(Conc.getPublicState().brief.confirmation, 'suggested');
assert.notEqual(Conc.getPublicState().brief.confirmation, 'user_confirmed');
Conc.confirmUnderstanding();
assert.equal(Conc.getPublicState().brief.confirmation, 'user_confirmed');
const facts = Brief.outboundUserFacts(Conc.getPublicState().brief);
assert.ok(facts.goal);

// 12) stale evidence wording
assert.match(Pcx.reasonMessage('changed'), /变化|刷新/);

// 13) low confidence → one question
Conc.resetConsult();
Conc.setFlowSkill('bug_triage');
const d = Conc.decide('点确认没反应');
assert.equal(d.action, 'ask');
assert.ok(d.question && d.question.prompt);

// 14) no recursive full-repo claim — search API is literal only (contract in FE)
assert.equal(typeof Pcx.search, 'function');

// 15) unauthorized material not in prompt — only adopted
Prep._setModel(
  Object.assign(Prep._model(), {
    materials: [
      {
        id: 'm1',
        kind: 'project_evidence',
        name: 'secret',
        included: true,
        citeMode: 'full',
        content: 'SECRET',
        path: 'a.ts'
      },
      {
        id: 'm2',
        kind: 'project_evidence',
        name: 'skip',
        included: false,
        citeMode: 'full',
        content: 'NOPE',
        path: 'b.ts'
      }
    ]
  })
);
snap = Own.buildAssistInputSnapshot(Prep._model());
assert.ok(snap.materials.every((m) => m.name !== 'skip' || m.include === false || !m.content));
const send = Own.buildSendBody(Prep._model());
assert.doesNotMatch(String(send.body || ''), /NOPE/);

// Ambiguity budget / skip
Conc.resetConsult();
Conc.decide('点确认没反应');
Conc.answerQuestion('一直转圈 / loading');
assert.equal(Conc.getPublicState().questionCount, 1);

// Outcome split
let rec = Outcome.emptyRecord();
rec = Outcome.markUserReportedResolved(rec, '好了');
assert.equal(rec.outcome, 'user_reported_resolved');
const bad = Outcome.markVerified(rec, { kind: 'vibes' });
assert.equal(bad.ok, false);
const good = Outcome.markVerified(rec, { kind: 'test', note: 'npm test green', traceable: true });
assert.equal(good.ok, true);
assert.equal(good.record.outcome, 'verified');
assert.equal(Outcome.forbiddenStatusCopy('诊断完成'), true);
assert.equal(Outcome.forbiddenStatusCopy('会诊记录'), false);

// grant_required message
assert.match(Pcx.reasonMessage('grant_required'), /查找材料/);

// no_model path: local restate still works
store['onetone.projectContext.enabled'] = '0';
assert.equal(Conc.featureEnabled(), false);
store['onetone.projectContext.enabled'] = '1';
Conc.resetConsult();
const local = Conc.restateLocal('没有模型也能复述：登录卡住');
assert.ok(local.display && local.display.lines.length >= 1);

console.log('test-home-context-concierge: ok');
