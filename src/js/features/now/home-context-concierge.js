/**
 * Phase2.5 Concierge — coordinates consult skeleton; does NOT write outbound body.
 * Evidence only via adoptEvidence. Model polish = suggested until user confirms.
 */
(function (global) {
  'use strict';

  var FLAG_KEY = 'onetone.projectContext.enabled';
  var state = {
    suggestGeneration: 0,
    flowSkillId: 'bug_triage',
    brief: null,
    askedAmbiguities: [],
    questionCount: 0,
    deepenQuestions: false,
    candidates: [],
    grant: null,
    capsule: null,
    outcome: null,
    conclusionLevel: 'problem_definition',
    lastDecision: null,
    listening: false
  };

  function featureEnabled() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(FLAG_KEY) === '1');
    } catch (_) {
      return false;
    }
  }

  function Skills() {
    return global.OneToneHomeAssistSkills;
  }
  function BriefApi() {
    return global.OneToneHomeProblemBrief;
  }
  function OutcomeApi() {
    return global.OneToneHomeConsultOutcome;
  }
  function Pcx() {
    return global.OneToneHomeProjectContext;
  }
  function Prep() {
    return global.OneToneHomePromptPrep;
  }

  function ensureBrief(raw) {
    var B = BriefApi();
    if (!state.brief) {
      state.brief = B ? B.emptyBrief() : { rawInput: '', confirmation: 'none', revision: 0 };
    }
    state.brief.rawInput = String(raw != null ? raw : state.brief.rawInput || '');
    state.brief.flowSkillId = state.flowSkillId;
    return state.brief;
  }

  function materials() {
    var P = Prep();
    var m = P && P._model && P._model();
    return (m && m.materials) || [];
  }

  function taskScopeId() {
    var P = Prep();
    var m = P && P._model && P._model();
    return (m && m.taskScopeId) || '';
  }

  function bumpSuggestGen() {
    state.suggestGeneration += 1;
    return state.suggestGeneration;
  }

  function syncCapsule(projectMeta) {
    projectMeta = projectMeta || {};
    state.capsule = {
      projectId: projectMeta.projectId || (state.capsule && state.capsule.projectId) || null,
      projectRootLabel:
        projectMeta.projectRootLabel || (state.capsule && state.capsule.projectRootLabel) || null,
      targetAgent: projectMeta.targetAgent || (state.capsule && state.capsule.targetAgent) || null,
      activeTaskId: taskScopeId() || null,
      recentTaskTitle: projectMeta.recentTaskTitle || null,
      recentAdoptedEvidenceIds: materials()
        .filter(function (m) {
          return m && m.evidenceId;
        })
        .map(function (m) {
          return m.evidenceId;
        })
        .slice(0, 8),
      recentScreenshotIds: materials()
        .filter(function (m) {
          return m && m.kind === 'image';
        })
        .map(function (m) {
          return m.id;
        })
        .slice(0, 4)
    };
    return state.capsule;
  }

  function invalidateOnProjectChange(nextProjectId) {
    bumpSuggestGen();
    state.candidates = [];
    state.askedAmbiguities = [];
    state.questionCount = 0;
    var pcx = Pcx();
    if (state.grant && pcx && pcx.revokeFindGrant) {
      pcx.revokeFindGrant({
        grantId: state.grant.grantId,
        taskScopeId: state.grant.taskScopeId,
        projectId: state.grant.projectId
      });
    }
    state.grant = null;
    if (pcx && pcx.closeProject) {
      try {
        var closed = pcx.closeProject();
        if (closed && typeof closed.catch === 'function') closed.catch(function () {});
      } catch (_) {}
    }
    if (state.capsule) state.capsule.projectId = nextProjectId || null;
  }

  function setFlowSkill(id) {
    var S = Skills();
    state.flowSkillId = S && S.getFlowSkill ? S.getFlowSkill(id).id : String(id || 'bug_triage');
    ensureBrief().flowSkillId = state.flowSkillId;
    return state.flowSkillId;
  }

  /** Restate without requiring model. */
  function restateLocal(rawText) {
    var B = BriefApi();
    var S = Skills();
    var raw = String(rawText != null ? rawText : (ensureBrief().rawInput || ''));
    ensureBrief(raw);
    if (!state.flowSkillId || state.flowSkillId === 'bug_triage') {
      if (S && S.detectFlowSkill) state.flowSkillId = S.detectFlowSkill(raw);
    }
    state.brief.flowSkillId = state.flowSkillId;
    var clues = S && S.extractClues ? S.extractClues(raw) : {};
    var suggested =
      B && B.localSuggest ? B.localSuggest(raw, state.flowSkillId, clues) : { goal: raw };
    if (B && B.applySuggested) B.applySuggested(state.brief, suggested);
    state.conclusionLevel = 'problem_definition';
    return { brief: state.brief, display: B && B.displayLines ? B.displayLines(state.brief) : null };
  }

  function confirmUnderstanding(edits) {
    var B = BriefApi();
    if (!B || !B.confirmBrief) return null;
    ensureBrief();
    B.confirmBrief(state.brief, edits || (state.brief && state.brief.suggested));
    return state.brief;
  }

  /**
   * Apply task_organize structured as suggested only.
   * @returns {{ applied:boolean, reason?: string }}
   */
  function adoptOrganizeSuggested(structured, meta) {
    meta = meta || {};
    var B = BriefApi();
    if (!B) return { applied: false, reason: 'no_brief_api' };
    ensureBrief();
    if (
      meta.expectRevision != null &&
      Number(meta.expectRevision) !== Number(state.brief.revision || 0)
    ) {
      return { applied: false, reason: 'stale_revision' };
    }
    if (state.brief.confirmation === 'user_confirmed' && meta.allowOverwriteConfirmed !== true) {
      // Keep suggested side-copy only
      state.brief.suggested = B.suggestedFromOrganize(structured, state.brief.rawInput);
      return { applied: true, reason: 'suggested_only_confirmed_kept' };
    }
    var sug = B.suggestedFromOrganize(structured, state.brief.rawInput);
    B.applySuggested(state.brief, sug);
    return { applied: true };
  }

  function answerQuestion(answer, opts) {
    opts = opts || {};
    var q = (state.lastDecision && state.lastDecision.question) || opts.question;
    if (!q) return { ok: false, reason: 'no_question' };
    var skipped = !!opts.skipped || answer === '跳过' || answer === '不确定';
    state.questionCount += 1;
    if (q.ambiguity) state.askedAmbiguities.push(q.ambiguity);
    ensureBrief().qa = (state.brief.qa || []).concat([
      {
        ambiguity: q.ambiguity,
        prompt: q.prompt,
        answer: skipped ? null : String(answer || ''),
        skipped: skipped
      }
    ]);
    if (!skipped && state.brief.suggested) {
      state.brief.suggested.observed =
        String(state.brief.suggested.observed || '') +
        '；用户补充：' +
        String(answer || '');
    }
    return { ok: true, brief: state.brief };
  }

  function decide(rawText) {
    var S = Skills();
    if (!S || !S.nextAction) {
      return { action: 'investigate_or_send', level: 'investigation' };
    }
    var raw = String(rawText != null ? rawText : (ensureBrief().rawInput || ''));
    ensureBrief(raw);
    var decision = S.nextAction({
      rawText: raw,
      flowSkillId: state.flowSkillId,
      brief: state.brief,
      materials: materials(),
      hasFindGrant: !!(state.grant && state.grant.grantId),
      questionCount: state.questionCount,
      askedAmbiguities: state.askedAmbiguities,
      deepenQuestions: state.deepenQuestions
    });
    state.lastDecision = decision;
    state.conclusionLevel = decision.level || state.conclusionLevel;
    state.flowSkillId = (decision.skill && decision.skill.id) || state.flowSkillId;
    return decision;
  }

  /**
   * Backend grant then open confirmed scope. UI must call this after user confirms dialog.
   */
  function requestFindMaterials(projectId) {
    var pcx = Pcx();
    if (!pcx || !pcx.grantFindMaterials) {
      return Promise.reject(new Error('pcx_unavailable'));
    }
    var pid = String(projectId || (state.capsule && state.capsule.projectId) || '').trim();
    if (!pid) return Promise.reject(new Error('project_required'));
    var ts = taskScopeId();
    return pcx.grantFindMaterials(pid, ts).then(function (grant) {
      state.grant = grant;
      return pcx.openConfirmedProject(pid, ts).then(function (scope) {
        return { grant: grant, scope: scope };
      });
    });
  }

  function suggestEvidence(opts) {
    opts = opts || {};
    if (!featureEnabled()) {
      return Promise.resolve({ candidates: [], reason: 'feature_disabled' });
    }
    var gen = bumpSuggestGen();
    var pcx = Pcx();
    var decision = decide(opts.rawText);
    var clues = decision.clues || {};
    if (!state.grant) {
      return Promise.resolve({
        candidates: [],
        reason: 'grant_required',
        decision: decision
      });
    }
    if (!pcx || !pcx.search) {
      return Promise.resolve({ candidates: [], reason: 'pcx_unavailable', decision: decision });
    }

    var literals = (clues.errorTokens || []).concat(clues.fileHints || []).slice(0, 3);
    if (!literals.length && opts.rawText) {
      var words = String(opts.rawText)
        .replace(/[^\w\u4e00-\u9fff.-]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(function (w) {
          return w.length >= 3;
        })
        .slice(0, 2);
      literals = words;
    }
    // Empty draft → still try a cheap literal so A′.3 has something to adopt.
    if (!literals.length) literals = ['README'];

    var chain = Promise.resolve([]);
    // passport first (cheap)
    chain = chain.then(function (acc) {
      if (gen !== state.suggestGeneration) return acc;
      return pcx
        .buildPassport()
        .then(function (c) {
          return c ? acc.concat([enrichCand(c, 'passport', '项目名片')]) : acc;
        })
        .catch(function () {
          return acc;
        });
    });
    literals.forEach(function (lit) {
      chain = chain.then(function (acc) {
        if (gen !== state.suggestGeneration) return acc;
        if (acc.length >= 5) return acc;
        return pcx
          .search(String(lit).slice(0, 128))
          .then(function (res) {
            var hits = (res && res.hits) || [];
            hits.slice(0, 3).forEach(function (h) {
              if (acc.length >= 5) return;
              acc.push({
                evidenceId: 'hit_' + (h.relativePath || '') + '_' + (h.line || ''),
                label: (h.relativePath || '') + (h.line ? ':' + h.line : ''),
                displayPath: h.displayPath || h.relativePath || null,
                sourceRef: h.relativePath || null,
                range: h.line ? { start: h.line, end: h.line } : null,
                reason: '匹配「' + lit + '」',
                confidence: 0.6,
                freshness: 'captured',
                preview: String(h.preview || '').slice(0, 400),
                needsUserConfirm: true,
                _hit: h,
                _literal: lit
              });
            });
            return acc;
          })
          .catch(function () {
            return acc;
          });
      });
    });
    // Last resort: README excerpt so grant+scope never yields a silent empty strip.
    chain = chain.then(function (acc) {
      if (gen !== state.suggestGeneration) return acc;
      if (acc.length) return acc;
      if (!pcx.readExcerpt) return acc;
      return pcx
        .readExcerpt('README.md', 1, 40)
        .then(function (c) {
          if (!c) return acc;
          return acc.concat([
            enrichCand(c, 'file_excerpt', 'README 片段（草稿无关键词时的兜底）')
          ]);
        })
        .catch(function () {
          return acc;
        });
    });

    return chain.then(function (acc) {
      if (gen !== state.suggestGeneration) {
        return { candidates: [], reason: 'stale', decision: decision };
      }
      // Dedup by displayPath
      var seen = {};
      var out = [];
      acc.forEach(function (c) {
        if (!c) return;
        var k = String(c.displayPath || c.label || '');
        if (seen[k]) return;
        seen[k] = 1;
        out.push(c);
      });
      state.candidates = out.slice(0, 5);
      return {
        candidates: state.candidates,
        decision: decision,
        generation: gen,
        reason: state.candidates.length ? 'ok' : 'empty'
      };
    });
  }

  /** Drawer / PCX previews → consult strip「采用」(same Prep adopt gate). */
  function setCandidatesFromPcx(list) {
    state.candidates = (list || [])
      .slice(0, 5)
      .map(function (c) {
        return enrichCand(c, (c && c.kind) || 'pcx', '待采用');
      })
      .filter(Boolean);
    return state.candidates.slice();
  }

  function enrichCand(c, kind, reason) {
    if (!c) return null;
    return {
      evidenceId: c.evidenceId,
      label: c.label,
      displayPath: c.displayPath,
      sourceRef: c.sourceRef,
      range: c.range,
      reason: reason || kind,
      confidence: 0.5,
      freshness: c.freshness || 'captured',
      preview: String(c.content || '').slice(0, 400),
      needsUserConfirm: true,
      _record: c
    };
  }

  /** Resolve hit → read_excerpt → adoptEvidence. */
  function adoptCandidate(index) {
    var c = state.candidates[index];
    if (!c) return Promise.resolve({ ok: false, reason: 'missing' });
    var pcx = Pcx();
    if (!pcx || !pcx.adoptEvidence) return Promise.resolve({ ok: false, reason: 'no_pcx' });

    if (c._record && c._record.content) {
      var row = pcx.adoptEvidence({
        id: c._record.evidenceId,
        scopeId: c._record.scopeId,
        taskScopeId: c._record.taskScopeId,
        kind: c._record.kind,
        label: c._record.label,
        displayPath: c._record.displayPath,
        sourceRef: c._record.sourceRef,
        relativePath: c._record.relativePath,
        range: c._record.range,
        content: c._record.content,
        sourceVersion: c._record.sourceVersion,
        capturedAt: c._record.capturedAt,
        truncated: c._record.truncated,
        freshness: c._record.freshness
      });
      return Promise.resolve({ ok: !!row, material: row });
    }

    if (c._hit && pcx.readExcerpt) {
      var path = c._hit.relativePath;
      var line = c._hit.line || 1;
      var start = Math.max(1, line - 3);
      var end = line + 3;
      return pcx.readExcerpt(path, start, end).then(function (rec) {
        if (!rec) return { ok: false, reason: 'read_failed' };
        var row = pcx.adoptEvidence({
          id: rec.evidenceId,
          scopeId: rec.scopeId,
          taskScopeId: rec.taskScopeId,
          kind: rec.kind || 'file_excerpt',
          label: rec.label || path,
          displayPath: rec.displayPath,
          sourceRef: rec.sourceRef,
          relativePath: rec.relativePath,
          range: rec.range,
          content: rec.content,
          sourceVersion: rec.sourceVersion,
          capturedAt: rec.capturedAt,
          truncated: rec.truncated,
          freshness: rec.freshness
        });
        return { ok: !!row, material: row };
      });
    }
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  /**
   * Compile short Cursor task by evidence strength. Local only.
   */
  function compileTask(opts) {
    opts = opts || {};
    var B = BriefApi();
    var S = Skills();
    var decision = decide(opts.rawText);
    var skill = decision.skill || (S && S.getFlowSkill(state.flowSkillId));
    var facts = B && B.outboundUserFacts ? B.outboundUserFacts(state.brief) : { observed: '' };
    var mats = materials().filter(function (m) {
      return m && m.included !== false;
    });
    var level = decision.level;
    var goal =
      facts.goal ||
      (state.brief && state.brief.suggested && state.brief.suggested.goal) ||
      '（待用户确认）';
    var observed = facts.observed || ensureBrief().rawInput || '';
    var lines = [];
    lines.push('## 目标');
    lines.push(goal);
    // Skip duplicate「用户观察」when it only repeats the goal.
    if (observed && observed !== goal) {
      lines.push('');
      lines.push('## 用户观察');
      lines.push('- ' + observed);
    }
    lines.push('');
    lines.push('## 已确认证据');
    if (!mats.length) {
      lines.push('- （尚无用户确认的工程材料）');
    } else {
      mats.slice(0, 8).forEach(function (m) {
        var path = (m.provenance && m.provenance.displayPath) || m.path || m.name;
        lines.push('- `' + path + '`' + (m.kind === 'image' ? '（截图；未宣称已 OCR）' : ''));
      });
    }
    lines.push('');
    if (level === 'conditional_change' && skill && skill.enoughForChangeAdvice({
      rawText: ensureBrief().rawInput,
      brief: state.brief,
      materials: mats
    })) {
      lines.push('## 请求');
      lines.push('对照证据给出最小改动与验收步骤；勿把关键词命中当已证根因。');
    } else {
      lines.push('## 请求');
      lines.push('先定位相关路径并说明依据；证据不足只调查，不假定根因。');
    }
    var unk =
      (state.brief &&
        state.brief.confirmation === 'user_confirmed' &&
        state.brief.confirmed &&
        state.brief.confirmed.unknowns) ||
      (state.brief && state.brief.suggested && state.brief.suggested.unknowns) ||
      [];
    if (unk.length) {
      lines.push('');
      lines.push('## 未确认');
      unk.forEach(function (u) {
        lines.push('- ' + u);
      });
    }
    state.conclusionLevel = level;
    return {
      body: lines.join('\n'),
      level: level,
      flowSkillId: state.flowSkillId,
      modelSkillId: (skill && skill.modelSkillId) || 'task_organize'
    };
  }

  function markUserResolved(note) {
    var O = OutcomeApi();
    if (!O) return null;
    state.outcome = O.markUserReportedResolved(state.outcome || O.emptyRecord(), note);
    return state.outcome;
  }

  function markVerified(evidence) {
    var O = OutcomeApi();
    if (!O) return { ok: false, reason: 'no_api' };
    var res = O.markVerified(state.outcome || O.emptyRecord(), evidence);
    if (res.ok) state.outcome = res.record;
    return res;
  }

  function getPublicState() {
    var B = BriefApi();
    var S = Skills();
    var skill = S && S.getFlowSkill ? S.getFlowSkill(state.flowSkillId) : null;
    return {
      featureEnabled: featureEnabled(),
      flowSkillId: state.flowSkillId,
      modelSkillId: (skill && skill.modelSkillId) || 'task_organize',
      skillLabel: (skill && skill.label) || '',
      ctaStart: (skill && skill.ctaStart) || '开始排查',
      ctaClarify: (skill && skill.ctaClarify) || '帮我说清楚问题',
      brief: state.brief,
      display: B && state.brief ? B.displayLines(state.brief) : null,
      candidates: state.candidates.slice(),
      grant: state.grant
        ? {
            grantId: state.grant.grantId,
            projectId: state.grant.projectId,
            displayName: state.grant.displayName
          }
        : null,
      conclusionLevel: state.conclusionLevel,
      lastDecision: state.lastDecision
        ? {
            action: state.lastDecision.action,
            level: state.lastDecision.level,
            question: state.lastDecision.question || null
          }
        : null,
      questionCount: state.questionCount,
      capsule: state.capsule,
      outcome: state.outcome,
      suggestGeneration: state.suggestGeneration
    };
  }

  function resetConsult() {
    bumpSuggestGen();
    state.brief = BriefApi() ? BriefApi().emptyBrief() : null;
    state.askedAmbiguities = [];
    state.questionCount = 0;
    state.candidates = [];
    state.lastDecision = null;
    state.conclusionLevel = 'problem_definition';
    state.deepenQuestions = false;
  }

  global.OneToneHomeContextConcierge = {
    FLAG_KEY: FLAG_KEY,
    featureEnabled: featureEnabled,
    syncCapsule: syncCapsule,
    invalidateOnProjectChange: invalidateOnProjectChange,
    setFlowSkill: setFlowSkill,
    restateLocal: restateLocal,
    confirmUnderstanding: confirmUnderstanding,
    adoptOrganizeSuggested: adoptOrganizeSuggested,
    answerQuestion: answerQuestion,
    decide: decide,
    requestFindMaterials: requestFindMaterials,
    suggestEvidence: suggestEvidence,
    adoptCandidate: adoptCandidate,
    setCandidatesFromPcx: setCandidatesFromPcx,
    compileTask: compileTask,
    markUserResolved: markUserResolved,
    markVerified: markVerified,
    getPublicState: getPublicState,
    resetConsult: resetConsult,
    deepenQuestions: function (on) {
      state.deepenQuestions = !!on;
    },
    _stateForTest: function () {
      return state;
    },
    _setStateForTest: function (patch) {
      Object.assign(state, patch || {});
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
