/**
 * Home assist ownership — outbound material snapshot, draft versions, send body.
 * Pure helpers; no IPC. Prep / home-agent wire these into the live model.
 */
(function (global) {
  'use strict';

  var SEND_SCOPES = ['draft_only', 'included_materials', 'included_materials_and_paths'];
  var CITE_MODES = ['full', 'summary', 'excerpt', 'pathOnly', 'skip'];

  function emptyRawDraft() {
    return { title: '', body: '' };
  }

  function emptyOrganizedDraft() {
    return {
      title: '',
      body: '',
      structured: null,
      structuredOutdated: false,
      stale: false,
      editGeneration: 0,
      createdAt: null,
      sourceRevision: null,
      generation: null,
      source: null
    };
  }

  function emptyAssistState() {
    return {
      state: 'idle',
      requestId: null,
      generation: 0,
      sourceRevision: null,
      taskScopeId: null,
      error: null
    };
  }

  function newTaskScopeId() {
    return 'ts_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4);
  }

  function newSnapshotId() {
    return 'ss_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4);
  }

  function newRequestId() {
    return 'assist_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4);
  }

  function normalizeSendScope(scope) {
    var s = String(scope || 'included_materials');
    return SEND_SCOPES.indexOf(s) >= 0 ? s : 'included_materials';
  }

  function normalizeCiteMode(mode) {
    var m = String(mode || 'full');
    return CITE_MODES.indexOf(m) >= 0 ? m : 'full';
  }

  function truncateSummary(text, max) {
    max = max || 240;
    var s = String(text || '').trim();
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
  }

  /**
   * Resolve outbound text for one material per citeMode.
   * @returns {{ content: string|null, path: string|null, include: boolean }}
   */
  function materialOutbound(m, sendScope) {
    if (!m || m.included === false) return { content: null, path: null, include: false };
    var mode = normalizeCiteMode(m.citeMode);
    if (mode === 'skip') return { content: null, path: null, include: false };
    var scope = normalizeSendScope(sendScope);
    var path =
      scope === 'included_materials_and_paths' && m.path ? String(m.path) : null;
    if (mode === 'pathOnly') {
      return { content: null, path: path, include: scope !== 'draft_only' };
    }
    if (scope === 'draft_only') {
      return { content: null, path: null, include: false };
    }
    var content = '';
    if (mode === 'summary') {
      content = String(m.userSummary || truncateSummary(m.content || m.description, 240) || '');
    } else if (mode === 'excerpt') {
      // Phase2 engineering evidence: exact excerptText (or provenance.exact) — no 400 cut.
      if (m.excerptText != null && String(m.excerptText).length) {
        content = String(m.excerptText);
      } else if (m.provenance && m.provenance.exact) {
        content = String(m.content || '');
      } else {
        content = truncateSummary(m.content || m.description, 400);
      }
    } else {
      content = String(m.content || '');
    }
    // Never outbound absolute paths; relative path only when sendScope allows.
    if (path && /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path)) {
      path = m.provenance && m.provenance.sourceRef ? String(m.provenance.sourceRef) : null;
    }
    return {
      content: content,
      path: path,
      include: true,
      freshness: m.freshness || (m.provenance && m.provenance.freshness) || null,
      sourceRef: (m.provenance && m.provenance.sourceRef) || null,
      evidenceId: (m.provenance && m.provenance.evidenceId) || m.evidenceId || null
    };
  }

  /**
   * Final outbound payload for assist + send preview. Same function for UI and IPC.
   */
  function buildAssistInputSnapshot(model, opts) {
    opts = opts || {};
    model = model || {};
    var scope = normalizeSendScope(opts.sendScope || model.sendScope || 'included_materials');
    var raw = model.rawDraft || model.draft || emptyRawDraft();
    var draftTitle = String(raw.title || '');
    var draftBody = String(raw.body || '');
    var materialsOut = [];
    var skipped = [];
    (model.materials || []).forEach(function (m) {
      if (!m) return;
      var out = materialOutbound(m, scope);
      if (!out.include) {
        skipped.push({
          id: m.id,
          name: m.name || '素材',
          reason: m.included === false ? 'excluded' : normalizeCiteMode(m.citeMode) === 'skip' ? 'skip' : 'scope'
        });
        return;
      }
      var row = {
        id: m.id,
        name: m.name || '未命名素材',
        source: m.source || 'local',
        kind: m.kind || 'text',
        citeMode: normalizeCiteMode(m.citeMode),
        content: out.content,
        path: out.path,
        needsManualUpload: !!m.needsManualUpload
      };
      if (out.freshness) row.freshness = out.freshness;
      if (out.sourceRef) row.sourceRef = out.sourceRef;
      if (out.evidenceId) row.evidenceId = out.evidenceId;
      materialsOut.push(row);
    });
    return {
      snapshotId: opts.snapshotId || newSnapshotId(),
      taskScopeId: model.taskScopeId || null,
      contentRevision: model.contentRevision || 0,
      sendScope: scope,
      draft: { title: draftTitle, body: draftBody },
      materials: materialsOut,
      skipped: skipped,
      previewHint:
        '仅发送本次预览中的内容，不读取其他项目文件。'
    };
  }

  function describeSendScope(snapshot) {
    snapshot = snapshot || {};
    var parts = ['草稿'];
    var n = (snapshot.materials || []).length;
    if (snapshot.sendScope !== 'draft_only') {
      parts.push(n + ' 个已包含材料（按引用方式）');
    }
    if (snapshot.sendScope === 'included_materials_and_paths') {
      parts.push('工程路径（非文件正文）');
    }
    return {
      willSend: '本次会发送：' + parts.join('、'),
      willNot: '不会发送：未勾选材料、skip 材料、其他项目文件。密钥仅当用户主动纳入正文时可能出现。',
      hint: snapshot.previewHint || '仅发送本次预览中的内容，不读取其他项目文件。'
    };
  }

  /**
   * Structured → editable Markdown body (first generation only).
   */
  function structuredToMarkdown(structured, opts) {
    opts = opts || {};
    structured = structured || {};
    var lines = [];
    var goal = String(structured.goal || '').trim();
    lines.push('# 任务目标');
    lines.push('');
    lines.push(goal || '（未填写）');
    lines.push('');

    function section(title, items, kindFilter) {
      var arr = Array.isArray(items) ? items : [];
      var filtered = kindFilter
        ? arr.filter(function (it) {
            return it && it.kind === kindFilter;
          })
        : arr;
      if (!filtered.length && kindFilter) return;
      lines.push('## ' + title);
      lines.push('');
      if (!filtered.length) {
        lines.push('- （无）');
        lines.push('');
        return;
      }
      filtered.forEach(function (it, i) {
        var text = typeof it === 'string' ? it : String((it && it.text) || '');
        var src =
          it && Array.isArray(it.sourceIds) && it.sourceIds.length
            ? ' [' + it.sourceIds.join(', ') + ']'
            : '';
        if (title.indexOf('步骤') >= 0) {
          lines.push(i + 1 + '. ' + text + src);
        } else {
          lines.push('- ' + text + src);
        }
      });
      lines.push('');
    }

    var facts = Array.isArray(structured.facts) ? structured.facts : [];
    var userReqs = facts.filter(function (f) {
      return f && f.kind === 'user_requirement';
    });
    var evidence = facts.filter(function (f) {
      return !f || f.kind !== 'user_requirement';
    });
    if (userReqs.length) {
      section('用户要求', userReqs);
    } else if (opts.draftBody) {
      lines.push('## 用户要求');
      lines.push('');
      lines.push(String(opts.draftBody));
      lines.push('');
    }
    section('已知事实与证据', evidence.length ? evidence : facts);
    section('约束', structured.constraints);
    section('建议步骤', structured.steps);
    section('验收标准', structured.acceptanceCriteria);
    section('未确认事项', structured.unknowns);
    lines.push('## 给执行 Agent 的要求');
    lines.push('');
    lines.push('请先确认相关文件和复现条件，再开始修改。');
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Append evidence blocks from outbound snapshot (programmatic; not model paraphrase).
   */
  function appendEvidenceFromSnapshot(body, snapshot) {
    var base = String(body || '').trimEnd();
    var mats = (snapshot && snapshot.materials) || [];
    var withBody = mats.filter(function (m) {
      return m && m.content != null && String(m.content).length;
    });
    if (!withBody.length) return base + (base.endsWith('\n') ? '' : '\n');
    var parts = [base, '', '## 原始证据（程序附加）', ''];
    withBody.forEach(function (m) {
      parts.push('### ' + (m.name || m.id));
      if (m.path) parts.push('- 路径: `' + m.path + '`');
      parts.push('');
      parts.push(String(m.content));
      parts.push('');
    });
    return parts.join('\n');
  }

  /**
   * Send body source of truth: activeDraft body (organized or raw), never re-render structured.
   */
  function buildSendBody(model, opts) {
    opts = opts || {};
    model = model || {};
    var active = model.activeDraft === 'organized' ? 'organized' : 'raw';
    var raw = model.rawDraft || model.draft || emptyRawDraft();
    var org = model.organizedDraft || emptyOrganizedDraft();
    var snap =
      opts.snapshot ||
      buildAssistInputSnapshot(model, { sendScope: opts.sendScope || model.sendScope });
    var body;
    var source;
    if (active === 'organized' && String(org.body || '').trim()) {
      body = String(org.body);
      source = org.structuredOutdated || org.source === 'user_edited_organized'
        ? 'user_edited_organized'
        : org.source || 'model';
    } else {
      body = String(raw.body || '');
      source = 'raw';
    }
    if (opts.attachEvidence !== false && active === 'organized') {
      body = appendEvidenceFromSnapshot(body, snap);
    }
    return {
      snapshotId: snap.snapshotId,
      taskScopeId: model.taskScopeId || null,
      contentRevision: model.contentRevision || 0,
      activeDraft: active,
      source: source,
      title: active === 'organized' ? org.title || raw.title || '' : raw.title || '',
      body: body,
      organizedStale: !!(org && org.stale),
      structuredOutdated: !!(org && org.structuredOutdated),
      materials: snap.materials,
      projectPath: opts.projectPath || null,
      targetKind: opts.targetKind || null
    };
  }

  function canAdoptAssistResult(assist, model, resultMeta) {
    resultMeta = resultMeta || {};
    assist = assist || emptyAssistState();
    model = model || {};
    if (!resultMeta.requestId || resultMeta.requestId !== assist.requestId) return false;
    if (Number(resultMeta.generation) !== Number(assist.generation)) return false;
    if (Number(resultMeta.sourceRevision) !== Number(model.contentRevision || 0)) return false;
    if (
      assist.taskScopeId &&
      model.taskScopeId &&
      String(assist.taskScopeId) !== String(model.taskScopeId)
    ) {
      return false;
    }
    var org = model.organizedDraft || emptyOrganizedDraft();
    if (
      resultMeta.editGeneration != null &&
      Number(org.editGeneration || 0) > Number(resultMeta.editGeneration)
    ) {
      return false;
    }
    // If user edited while running, reject overwrite.
    if (Number(org.editGeneration || 0) > Number(assist.startedEditGeneration || 0)) {
      return false;
    }
    return true;
  }

  function applyOrganizedFromStructured(model, structured, meta) {
    meta = meta || {};
    model = model || {};
    var md = structuredToMarkdown(structured, {
      draftBody: (model.rawDraft || model.draft || {}).body
    });
    model.organizedDraft = {
      title: String((structured && structured.goal) || '').slice(0, 80),
      body: md,
      structured: structured,
      structuredOutdated: false,
      stale: false,
      editGeneration: 0,
      createdAt: meta.createdAt || new Date().toISOString(),
      sourceRevision: meta.sourceRevision != null ? meta.sourceRevision : model.contentRevision || 0,
      generation: meta.generation != null ? meta.generation : null,
      source: 'model'
    };
    model.activeDraft = 'organized';
    return model.organizedDraft;
  }

  function markOrganizedStale(model) {
    if (!model || !model.organizedDraft) return;
    if (model.organizedDraft.body || model.organizedDraft.structured) {
      model.organizedDraft.stale = true;
    }
  }

  function editOrganizedBody(model, nextBody) {
    model = model || {};
    model.organizedDraft = model.organizedDraft || emptyOrganizedDraft();
    var body = String(nextBody == null ? '' : nextBody);
    if (model.organizedDraft.body === body) return model.organizedDraft;
    model.organizedDraft.body = body;
    model.organizedDraft.structuredOutdated = true;
    model.organizedDraft.source = 'user_edited_organized';
    model.organizedDraft.editGeneration = (model.organizedDraft.editGeneration || 0) + 1;
    model.activeDraft = 'organized';
    return model.organizedDraft;
  }

  /**
   * Migrate legacy `{ draft }` into ownership fields. Running assist → interrupted on reload.
   */
  function migrateOwnershipFields(parsed) {
    parsed = parsed || {};
    if (!parsed.taskScopeId) parsed.taskScopeId = newTaskScopeId();
    if (!parsed.rawDraft) {
      var d = parsed.draft || { title: '', body: '' };
      parsed.rawDraft = { title: String(d.title || ''), body: String(d.body || '') };
    }
    // Keep legacy draft mirrored to raw for older callers.
    parsed.draft = parsed.rawDraft;
    if (!parsed.organizedDraft) parsed.organizedDraft = emptyOrganizedDraft();
    if (parsed.activeDraft !== 'organized' && parsed.activeDraft !== 'raw') {
      parsed.activeDraft = 'raw';
    }
    parsed.assist = parsed.assist || emptyAssistState();
    if (parsed.assist.state === 'running') {
      parsed.assist.state = 'interrupted';
      parsed.assist.requestId = null;
      parsed.assist.error = { reason: 'interrupted', message: '页面刷新后整理已中断' };
    }
    if (!parsed.sendScope) parsed.sendScope = 'included_materials';
    parsed.sendScope = normalizeSendScope(parsed.sendScope);
    if (!parsed.lastSendSnapshotId) parsed.lastSendSnapshotId = null;
    return parsed;
  }

  global.OneToneHomeAssistOwnership = {
    SEND_SCOPES: SEND_SCOPES,
    emptyRawDraft: emptyRawDraft,
    emptyOrganizedDraft: emptyOrganizedDraft,
    emptyAssistState: emptyAssistState,
    newTaskScopeId: newTaskScopeId,
    newSnapshotId: newSnapshotId,
    newRequestId: newRequestId,
    normalizeSendScope: normalizeSendScope,
    materialOutbound: materialOutbound,
    buildAssistInputSnapshot: buildAssistInputSnapshot,
    describeSendScope: describeSendScope,
    structuredToMarkdown: structuredToMarkdown,
    appendEvidenceFromSnapshot: appendEvidenceFromSnapshot,
    buildSendBody: buildSendBody,
    canAdoptAssistResult: canAdoptAssistResult,
    applyOrganizedFromStructured: applyOrganizedFromStructured,
    markOrganizedStale: markOrganizedStale,
    editOrganizedBody: editOrganizedBody,
    migrateOwnershipFields: migrateOwnershipFields
  };
})(typeof window !== 'undefined' ? window : globalThis);
