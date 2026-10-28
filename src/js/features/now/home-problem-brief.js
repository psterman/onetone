/**
 * Phase2.5 ProblemBrief — suggested vs user_confirmed.
 * task_organize / local rules produce suggested only; user confirm elevates.
 */
(function (global) {
  'use strict';

  function emptyConfirmed() {
    return {
      goal: '',
      observed: '',
      expected: '',
      recentChange: '',
      confirmedFacts: [],
      unknowns: []
    };
  }

  function emptyBrief() {
    return {
      rawInput: '',
      flowSkillId: 'bug_triage',
      revision: 0,
      confirmation: 'none', // none | suggested | user_confirmed
      suggested: null,
      confirmed: null,
      inferredHypotheses: [],
      evidenceRefs: [],
      qa: [] // { ambiguity, prompt, answer, skipped }
    };
  }

  /** Local restatement — works without model. */
  function localSuggest(rawInput, flowSkillId, clues) {
    var raw = String(rawInput || '').trim();
    var skill = String(flowSkillId || 'bug_triage');
    var Skills = global.OneToneHomeAssistSkills;
    clues = clues || (Skills && Skills.extractClues ? Skills.extractClues(raw) : { errorTokens: [] });
    var goal = '';
    var observed = raw;
    var expected = '';
    var unknowns = [];
    // Goal = user ask only (no「排查并处理：」prefix — that doubled into outbound fluff).
    goal = truncate(raw, 60) || '（待确认）';
    if (skill === 'bug_triage') {
      if (clues.errorTokens && clues.errorTokens.length) {
        observed = truncate(raw, 120) + '；线索：' + clues.errorTokens.slice(0, 3).join('、');
      }
      unknowns.push('尚未确认复现条件与失败路径');
      expected = '失败有明确反馈，成功能继续';
    } else if (skill === 'feature_plan') {
      unknowns.push('范围边界与验收标准待确认');
      expected = '有可执行的分步计划';
    } else {
      unknowns.push('入口文件与阅读顺序待确认');
      expected = '能说明主要路径在做什么';
    }
    return {
      goal: goal,
      observed: observed,
      expected: expected,
      recentChange: '',
      confirmedFacts: [],
      unknowns: unknowns,
      source: 'local_rules'
    };
  }

  /**
   * Map task_organize structured result → suggested fields only (never auto-confirm).
   */
  function suggestedFromOrganize(structured, rawInput) {
    structured = structured || {};
    var facts = Array.isArray(structured.facts) ? structured.facts : [];
    var unknowns = Array.isArray(structured.unknowns)
      ? structured.unknowns.map(function (u) {
          return typeof u === 'string' ? u : String((u && u.text) || '');
        })
      : [];
    var confirmedFacts = facts
      .filter(function (f) {
        return f && f.kind !== 'user_requirement';
      })
      .map(function (f) {
        return typeof f === 'string' ? f : String((f && f.text) || '');
      })
      .filter(Boolean);
    return {
      goal: String(structured.goal || '').trim() || truncate(rawInput, 60),
      observed: String(rawInput || '').trim(),
      expected: '',
      recentChange: '',
      confirmedFacts: confirmedFacts,
      unknowns: unknowns,
      source: 'task_organize_suggested'
    };
  }

  function applySuggested(brief, suggested) {
    brief = brief || emptyBrief();
    if (brief.confirmation === 'user_confirmed') {
      // Do not overwrite confirmed — stash as suggested only if revision matches expectation
      brief.suggested = suggested;
      return brief;
    }
    brief.suggested = suggested;
    brief.confirmation = 'suggested';
    brief.revision = (brief.revision || 0) + 1;
    return brief;
  }

  function confirmBrief(brief, edits) {
    brief = brief || emptyBrief();
    var base = (edits && typeof edits === 'object' ? edits : null) ||
      brief.suggested ||
      emptyConfirmed();
    brief.confirmed = {
      goal: String(base.goal || ''),
      observed: String(base.observed || ''),
      expected: String(base.expected || ''),
      recentChange: String(base.recentChange || ''),
      confirmedFacts: Array.isArray(base.confirmedFacts) ? base.confirmedFacts.slice() : [],
      unknowns: Array.isArray(base.unknowns) ? base.unknowns.slice() : []
    };
    brief.confirmation = 'user_confirmed';
    brief.revision = (brief.revision || 0) + 1;
    return brief;
  }

  function displayLines(brief) {
    brief = brief || emptyBrief();
    var body =
      brief.confirmation === 'user_confirmed' && brief.confirmed
        ? brief.confirmed
        : brief.suggested;
    if (!body) {
      return { lines: [String(brief.rawInput || '').trim() || '（尚无描述）'], status: 'none' };
    }
    var lines = [];
    if (body.goal) lines.push(body.goal);
    if (body.observed && body.observed !== body.goal) lines.push(body.observed);
    if (body.expected) lines.push('期望：' + body.expected);
    return {
      lines: lines.slice(0, 3),
      status: brief.confirmation,
      source: body.source || null
    };
  }

  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (s.length <= n) return s;
    return s.slice(0, n) + '…';
  }

  /**
   * Facts allowed in outbound "user statement" — only user_confirmed.
   */
  function outboundUserFacts(brief) {
    if (!brief || brief.confirmation !== 'user_confirmed' || !brief.confirmed) {
      return { goal: '', observed: String((brief && brief.rawInput) || ''), facts: [] };
    }
    return {
      goal: brief.confirmed.goal,
      observed: brief.confirmed.observed,
      facts: (brief.confirmed.confirmedFacts || []).slice()
    };
  }

  global.OneToneHomeProblemBrief = {
    emptyBrief: emptyBrief,
    localSuggest: localSuggest,
    suggestedFromOrganize: suggestedFromOrganize,
    applySuggested: applySuggested,
    confirmBrief: confirmBrief,
    displayLines: displayLines,
    outboundUserFacts: outboundUserFacts
  };
})(typeof window !== 'undefined' ? window : globalThis);
