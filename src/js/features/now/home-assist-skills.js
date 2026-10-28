/**
 * Phase2.5 flow Skills — process config only.
 * Model calls still use Assist Runtime skillId=task_organize when needed.
 * implemented/ready MUST come from Assist Runtime, never from this registry.
 */
(function (global) {
  'use strict';

  var MODEL_SKILL_TASK_ORGANIZE = 'task_organize';

  /** Conclusion levels — never skip ahead of evidence. */
  var LEVEL = {
    PROBLEM_DEF: 'problem_definition',
    INVESTIGATE: 'investigation',
    CONDITIONAL_CHANGE: 'conditional_change',
    VERIFIED: 'verified'
  };

  function emptyClues() {
    return {
      errorTokens: [],
      fileHints: [],
      lineHints: [],
      hasSearchableError: false,
      hasReadableScreenshotText: false
    };
  }

  function extractClues(rawText) {
    var text = String(rawText || '');
    var clues = emptyClues();
    var errRe =
      /\b([A-Z][A-Za-z]+(?:Error|Exception)|E[A-Z0-9_]{3,}|error[:\s][^\n]{3,80}|failed to [^\n]{3,80}|timeout)\b/gi;
    var m;
    while ((m = errRe.exec(text))) {
      var tok = String(m[1] || m[0]).trim();
      if (tok && clues.errorTokens.indexOf(tok) < 0) clues.errorTokens.push(tok);
    }
    var pathRe = /(?:^|[\s`"'(])((?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z0-9]{1,8})(?=[\s`"''),:]|$)/g;
    while ((m = pathRe.exec(text))) {
      var p = String(m[1] || '').trim();
      if (p && clues.fileHints.indexOf(p) < 0) clues.fileHints.push(p);
    }
    var lineRe = /\b(?:L|line\s*)(\d{1,6})(?::(\d{1,6}))?\b/gi;
    while ((m = lineRe.exec(text))) {
      var ln = parseInt(m[1], 10);
      if (ln > 0) clues.lineHints.push(ln);
    }
    clues.hasSearchableError = clues.errorTokens.length > 0;
    return clues;
  }

  function hasResolvableGoalPhenomenon(rawText, brief) {
    var raw = String(rawText || '').trim();
    if (brief && brief.confirmation === 'user_confirmed') {
      var g = String((brief.confirmed && brief.confirmed.goal) || '').trim();
      var o = String((brief.confirmed && brief.confirmed.observed) || '').trim();
      if (g || o) return true;
    }
    if (raw.length < 8) return false;
    // Pure deixis without substance
    if (/^(那个|这个|刚才|这里|那儿|it|that|this)[.!。！？\s]*$/i.test(raw)) return false;
    return true;
  }

  function countAdoptedCodeLike(materials) {
    var n = 0;
    (materials || []).forEach(function (m) {
      if (!m || m.included === false) return;
      var k = String(m.kind || '');
      if (k === 'project_evidence' || k === 'file' || k === 'text') n += 1;
      // OCR-less image alone does not count as code-like
    });
    return n;
  }

  function hasOcrlessOnlyImage(materials, clues) {
    var imgs = (materials || []).filter(function (m) {
      return m && m.included !== false && String(m.kind || '') === 'image';
    });
    if (!imgs.length) return false;
    if (clues && (clues.hasSearchableError || clues.hasReadableScreenshotText)) return false;
    var other = countAdoptedCodeLike(materials);
    return other === 0;
  }

  var FLOW_SKILLS = {
    bug_triage: {
      id: 'bug_triage',
      label: '修复问题',
      ctaStart: '开始排查',
      ctaClarify: '帮我说清楚问题',
      modelSkillId: MODEL_SKILL_TASK_ORGANIZE,
      maxQuestionsDefault: 2,
      maxQuestionsDeep: 5,
      enoughForInvestigation: function (ctx) {
        ctx = ctx || {};
        var clues = ctx.clues || extractClues(ctx.rawText);
        if (clues.hasSearchableError || clues.fileHints.length) return true;
        // Clear written ask is enough — OCR-less image must not force the loading quiz.
        if (hasResolvableGoalPhenomenon(ctx.rawText, ctx.brief)) return true;
        // Screenshot-only / deixis-only: do not pretend we can investigate yet.
        return false;
      },
      enoughForChangeAdvice: function (ctx) {
        ctx = ctx || {};
        if (countAdoptedCodeLike(ctx.materials) < 1) return false;
        // Need phenomenon + adopted code path — still not root-cause proof
        return hasResolvableGoalPhenomenon(ctx.rawText, ctx.brief);
      },
      ambiguousBehaviorQuestion: {
        ambiguity: 'behavior_after_action',
        prompt: '点击后是页面一直转圈，还是完全没有变化？',
        options: ['一直转圈 / loading', '完全没反应', '出现报错', '不确定']
      }
    },
    feature_plan: {
      id: 'feature_plan',
      label: '规划功能',
      ctaStart: '帮我说清楚问题',
      ctaClarify: '帮我说清楚问题',
      modelSkillId: MODEL_SKILL_TASK_ORGANIZE,
      maxQuestionsDefault: 2,
      maxQuestionsDeep: 5,
      enoughForInvestigation: function (ctx) {
        return hasResolvableGoalPhenomenon(ctx && ctx.rawText, ctx && ctx.brief);
      },
      enoughForChangeAdvice: function (ctx) {
        ctx = ctx || {};
        // Need clear goal + some boundary; adopted code optional (raises specificity)
        var brief = ctx.brief;
        var goal = '';
        if (brief && brief.confirmation === 'user_confirmed' && brief.confirmed) {
          goal = String(brief.confirmed.goal || '').trim();
        }
        if (!goal) goal = String(ctx.rawText || '').trim();
        return goal.length >= 12;
      },
      ambiguousBehaviorQuestion: {
        ambiguity: 'scope_boundary',
        prompt: '这次更想先做哪一块：界面、逻辑，还是两边一起？',
        options: ['主要是界面', '主要是逻辑', '两边一起', '不确定']
      }
    },
    code_explain: {
      id: 'code_explain',
      label: '看懂代码',
      ctaStart: '帮我说清楚问题',
      ctaClarify: '帮我说清楚问题',
      modelSkillId: MODEL_SKILL_TASK_ORGANIZE,
      maxQuestionsDefault: 2,
      maxQuestionsDeep: 5,
      enoughForInvestigation: function (ctx) {
        ctx = ctx || {};
        var clues = ctx.clues || extractClues(ctx.rawText);
        if (clues.fileHints.length) return true;
        if (countAdoptedCodeLike(ctx.materials) >= 1) return true;
        var raw = String(ctx.rawText || '');
        return /模块|入口|函数|文件|怎么|如何|哪里/.test(raw) && raw.trim().length >= 8;
      },
      enoughForChangeAdvice: function (ctx) {
        // For explain, "change advice" means step-by-step reading path after adopted excerpt
        return countAdoptedCodeLike(ctx && ctx.materials) >= 1;
      },
      ambiguousBehaviorQuestion: {
        ambiguity: 'entry_point',
        prompt: '你更想先搞清楚：从哪里开始读，还是某段具体逻辑在做什么？',
        options: ['从哪里开始读', '某段逻辑在做什么', '不确定']
      }
    }
  };

  function getFlowSkill(id) {
    var k = String(id || 'bug_triage');
    return FLOW_SKILLS[k] || FLOW_SKILLS.bug_triage;
  }

  function detectFlowSkill(rawText) {
    var t = String(rawText || '');
    // Style / UX / redesign — not bug loading quiz.
    if (/样式|美化|改版|视觉|布局|排版|UI|ux|优化.*(页|界面|样式)|界面.*(优|改|调)/i.test(t)) {
      return 'feature_plan';
    }
    if (/规划|实现功能|加一个|新增|feature|想要一个/i.test(t)) return 'feature_plan';
    if (/看懂|解释|这段|什么意思|怎么工作|explain|阅读/i.test(t)) return 'code_explain';
    if (/修|bug|报错|失败|没反应|卡住|error|崩/i.test(t)) return 'bug_triage';
    return 'bug_triage';
  }

  /** Skip bug-loading quiz when the ask is clearly not a click/hang failure. */
  function shouldAskAmbiguity(skill, ctx) {
    if (!skill || !skill.ambiguousBehaviorQuestion) return false;
    var asked =
      (ctx.askedAmbiguities || []).indexOf(skill.ambiguousBehaviorQuestion.ambiguity) >= 0;
    if (asked) return false;
    if ((ctx.questionCount || 0) >= (skill.maxQuestionsDefault || 2)) return false;
    if (ctx.needsAmbiguityCheck === false) return false;
    if (skill.id === 'bug_triage') {
      var raw = String(ctx.rawText || '');
      // Style / plan wording must never get「一直转圈」.
      if (/样式|美化|改版|视觉|布局|排版|优化|如何改|怎么改|好看/i.test(raw)) return false;
      if (hasResolvableGoalPhenomenon(raw, ctx.brief) && !/没反应|卡住|转圈|loading|报错|失败/i.test(raw)) {
        return false;
      }
    }
    return true;
  }

  function nextAction(ctx) {
    ctx = ctx || {};
    var detected = detectFlowSkill(ctx.rawText);
    // Sticky「修复问题」must not trap style/plan asks into the loading quiz.
    var skillId = ctx.flowSkillId || detected;
    if (skillId === 'bug_triage' && detected !== 'bug_triage') skillId = detected;
    var skill = getFlowSkill(skillId);
    var clues = ctx.clues || extractClues(ctx.rawText);
    var pack = {
      rawText: ctx.rawText,
      brief: ctx.brief,
      materials: ctx.materials,
      clues: clues
    };
    if (skill.enoughForChangeAdvice(pack)) {
      return { action: 'compile_change', skill: skill, clues: clues, level: LEVEL.CONDITIONAL_CHANGE };
    }
    if (skill.enoughForInvestigation(pack)) {
      return { action: 'compile_investigate', skill: skill, clues: clues, level: LEVEL.INVESTIGATE };
    }
    if (shouldAskAmbiguity(skill, ctx)) {
      return {
        action: 'ask',
        skill: skill,
        clues: clues,
        level: LEVEL.PROBLEM_DEF,
        question: skill.ambiguousBehaviorQuestion
      };
    }
    if (
      (clues.hasSearchableError || clues.fileHints.length) &&
      ctx.hasFindGrant &&
      !skill.enoughForInvestigation(pack)
    ) {
      return { action: 'suggest_evidence', skill: skill, clues: clues, level: LEVEL.PROBLEM_DEF };
    }
    return { action: 'investigate_or_send', skill: skill, clues: clues, level: LEVEL.INVESTIGATE };
  }

  global.OneToneHomeAssistSkills = {
    MODEL_SKILL_TASK_ORGANIZE: MODEL_SKILL_TASK_ORGANIZE,
    LEVEL: LEVEL,
    FLOW_SKILLS: FLOW_SKILLS,
    getFlowSkill: getFlowSkill,
    detectFlowSkill: detectFlowSkill,
    extractClues: extractClues,
    nextAction: nextAction,
    countAdoptedCodeLike: countAdoptedCodeLike,
    hasOcrlessOnlyImage: hasOcrlessOnlyImage
  };
})(typeof window !== 'undefined' ? window : globalThis);
