/**
 * Home project context — selective engineering materials (Phase2).
 * Candidates are ephemeral; only adoptEvidence enters Prep.
 * Feature flag default OFF: localStorage onetone.projectContext.enabled=1
 */
(function (global) {
  'use strict';

  var FLAG_KEY = 'onetone.projectContext.enabled';
  var candidates = [];
  var activeScope = null;
  var lastBudgetHint = '';
  var lastError = '';

  var REASON_ZH = {
    scope_required: '请先选择一个工程目录',
    scope_revoked: '工程已切换，请重新选择材料',
    wrong_owner: '请在主窗口添加工程材料',
    invalid_path: '该路径不在当前工程范围内',
    excluded: '为保护隐私，此类文件不会自动读取',
    not_found: '找不到该文件或目录',
    unsupported_encoding: '文件编码不支持，未加入',
    too_large: '文件超过读取上限，请选择更小片段',
    changed: '文件已变化，请刷新或继续使用旧版本',
    not_git: '当前工程不是 Git 仓库，可改用选定文件',
    git_unavailable: '本机未检测到可用 Git，可改用选定文件',
    busy: '正在读取中，请稍候或取消后重试',
    cancelled: '已取消',
    timeout: '读取超时，请缩小范围后重试',
    io_error: '无法读取该位置，请检查权限后重试',
    offline: '当前无法读取远程服务，但仍可直接交接',
    grant_required: '需要先确认「为此项目查找材料」后才能读取工程候选'
  };

  function featureEnabled() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(FLAG_KEY) === '1');
    } catch (_) {
      return false;
    }
  }

  function reasonMessage(code) {
    var c = String(code || '').trim();
    if (!c) return '读取未完成';
    return REASON_ZH[c] || ('读取未完成：' + c);
  }

  function invoke(cmd, payload) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return ipc.invoke(cmd, { args: payload || {} });
  }

  function taskScopeId() {
    var Prep = global.OneToneHomePromptPrep;
    var m = Prep && Prep._model && Prep._model();
    return (m && m.taskScopeId) || '';
  }

  function newRequestId() {
    return 'pcq_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4);
  }

  function setError(err) {
    var msg = '';
    if (!err) msg = '';
    else if (typeof err === 'string') msg = reasonMessage(err);
    else if (err.message) msg = reasonMessage(String(err.message).replace(/^.*:\s*/, '')) || String(err.message);
    else msg = reasonMessage(String(err));
    lastError = msg;
    return msg;
  }

  function budgetHintFromResult(res) {
    if (!res) return '';
    var parts = [];
    if (res.truncated) {
      var lr = res.limitReason || (res.usage && res.usage.limitReason) || '';
      if (lr === 'hit_limit') parts.push('搜索命中已达上限，仅显示部分结果');
      else if (lr === 'git_list_limit' || lr === 'git_patch_bytes')
        parts.push('Diff 超过大小限制，已截断或仅保留列表');
      else if (lr === 'excerpt_bytes' || lr === 'passport_bytes') parts.push('已截断部分片段');
      else if (lr === 'timeout') parts.push('读取超时，结果可能不完整');
      else parts.push('结果已按预算截断');
    }
    var usage = res.usage || {};
    if (usage.shown != null) parts.push('已显示 ' + usage.shown + ' 项');
    lastBudgetHint = parts.join(' · ');
    return lastBudgetHint;
  }

  function openProject(_taskScopeId, _suggestedRoot) {
    if (!featureEnabled()) {
      return Promise.reject(new Error('feature_disabled'));
    }
    var ts = _taskScopeId || taskScopeId();
    if (!ts) return Promise.reject(new Error('scope_required'));
    // suggestedRoot is dialog hint only — never grants scope by itself.
    lastBudgetHint = '正在打开目录选择器…（若看不到，检查任务栏是否被挡住）';
    lastError = '';
    paintStatus();
    return invoke('cmd_project_context_open', {
      taskScopeId: ts,
      suggestedRoot: _suggestedRoot || null
    })
      .then(function (scope) {
        activeScope = scope || null;
        candidates = [];
        lastError = '';
        lastBudgetHint = scope
          ? '已选择：' + (scope.displayName || scope.displayRoot || '')
          : '';
        paintCandidates();
        return scope;
      })
      .catch(function (err) {
        lastBudgetHint = '';
        setError(err);
        return Promise.reject(err);
      });
  }

  function closeProject(scopeId) {
    var sid = scopeId || (activeScope && activeScope.scopeId);
    if (!sid) return Promise.resolve();
    return invoke('cmd_project_context_close', { scopeId: sid }).then(function () {
      if (activeScope && activeScope.scopeId === sid) activeScope = null;
      candidates = [];
    });
  }

  function queryContext(query) {
    if (!activeScope) {
      setError('scope_required');
      return Promise.reject(new Error('scope_required'));
    }
    var ts = taskScopeId();
    if (ts && activeScope.taskScopeId && ts !== activeScope.taskScopeId) {
      setError('scope_revoked');
      activeScope = null;
      return Promise.reject(new Error('scope_revoked'));
    }
    return invoke('cmd_project_context_query', {
      scopeId: activeScope.scopeId,
      taskScopeId: activeScope.taskScopeId || ts,
      requestId: newRequestId(),
      query: query
    })
      .then(function (res) {
        budgetHintFromResult(res);
        lastError = '';
        return res;
      })
      .catch(function (err) {
        setError(err);
        return Promise.reject(err);
      });
  }

  function recordToCandidate(rec) {
    if (!rec) return null;
    return {
      evidenceId: rec.id,
      scopeId: rec.scopeId,
      taskScopeId: rec.taskScopeId,
      kind: rec.kind,
      label: rec.label,
      displayPath: rec.displayPath || null,
      sourceRef: rec.sourceRef || null,
      relativePath: rec.relativePath || null,
      range: rec.range || null,
      content: rec.content || '',
      sourceVersion: rec.sourceVersion,
      capturedAt: rec.capturedAt,
      truncated: !!rec.truncated,
      limitReason: rec.limitReason || null,
      freshness: rec.freshness || 'captured',
      // absolutePath intentionally omitted — never leave backend
    };
  }

  function pushCandidates(list) {
    candidates = (list || []).filter(Boolean);
    syncConsultCandidates(candidates);
    return candidates.slice();
  }

  function adoptEvidence(evidenceRecord) {
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || !Prep.addMaterial) {
      setError('交接面板未就绪，请回到首页 Agent 工作台后再试');
      return null;
    }
    var ev = evidenceRecord || {};
    if (activeScope) {
      if (ev.scopeId && ev.scopeId !== activeScope.scopeId) {
        setError('scope_revoked');
        return null;
      }
      if (ev.taskScopeId && activeScope.taskScopeId && ev.taskScopeId !== activeScope.taskScopeId) {
        setError('scope_revoked');
        return null;
      }
    }
    var body = String(ev.content || '');
    if (!body) {
      setError('候选内容为空，请重新读取');
      return null;
    }
    if (body.length > 16 * 1024) {
      setError('too_large');
      return null;
    }
    var citeMode = ev.kind === 'passport' ? 'full' : 'excerpt';
    var row = Prep.addMaterial({
      kind: 'project_evidence',
      name: ev.label || ev.displayPath || '工程材料',
      source: 'project_context',
      path: ev.displayPath || '',
      content: body,
      excerptText: body,
      citeMode: citeMode,
      included: true,
      capturedAt: ev.capturedAt,
      evidenceId: ev.id || ev.evidenceId,
      freshness: ev.freshness || 'captured',
      provenance: {
        evidenceId: ev.id || ev.evidenceId,
        scopeId: ev.scopeId,
        kind: ev.kind,
        sourceRef: ev.sourceRef,
        sourceVersion: ev.sourceVersion,
        displayPath: ev.displayPath,
        relativePath: ev.relativePath || null,
        exact: true,
        range: ev.range,
        freshness: ev.freshness || 'captured',
        truncated: !!ev.truncated,
        limitReason: ev.limitReason || null
      }
    });
    if (!row) {
      setError('当前阶段不能加入材料（交接中请先结束或新开一轮）');
      return null;
    }
    lastError = '';
    return row;
  }

  function markStaleUserConfirmed(materialId) {
    var Prep = global.OneToneHomePromptPrep;
    var m = Prep && Prep._model && Prep._model();
    if (!m || !m.materials) return null;
    for (var i = 0; i < m.materials.length; i++) {
      var row = m.materials[i];
      if (!row || row.id !== materialId) continue;
      row.freshness = 'stale_user_confirmed';
      if (row.provenance) row.provenance.freshness = 'stale_user_confirmed';
      if (Prep.bumpContentRevision) {
        /* bump via flags touch */
      }
      if (typeof Prep.updateMaterialFlags === 'function') {
        Prep.updateMaterialFlags(materialId, { included: row.included !== false });
      }
      return row;
    }
    return null;
  }

  function materialRelativePath(m) {
    if (!m || !m.provenance) return '';
    var p = m.provenance;
    if (p.relativePath) return String(p.relativePath);
    if (p.displayPath && p.displayPath !== '(passport)') return String(p.displayPath);
    if (p.sourceRef && p.sourceRef.relativePath) return String(p.sourceRef.relativePath);
    return '';
  }

  function validateIncludedEvidence() {
    var Prep = global.OneToneHomePromptPrep;
    var model = Prep && Prep._model && Prep._model();
    if (!activeScope || !model) {
      return Promise.resolve({ items: [], hint: reasonMessage('scope_required') });
    }
    var records = [];
    var ids = [];
    (model.materials || []).forEach(function (m) {
      if (!m || !m.included || !m.provenance || !m.provenance.evidenceId) return;
      ids.push(m.provenance.evidenceId);
      var rel = materialRelativePath(m);
      records.push({
        id: m.provenance.evidenceId,
        scopeId: m.provenance.scopeId,
        taskScopeId: activeScope.taskScopeId,
        kind: m.provenance.kind || 'file_excerpt',
        label: m.name,
        displayPath: m.provenance.displayPath,
        sourceRef: m.provenance.sourceRef,
        relativePath: rel || null,
        range: m.provenance.range,
        content: m.content || '',
        sourceVersion: m.provenance.sourceVersion || '',
        sourceRefs: [],
        capturedAt: m.capturedAt || '',
        truncated: !!m.provenance.truncated,
        freshness: m.freshness || 'captured',
        schemaVersion: 1
      });
    });
    if (!ids.length) return Promise.resolve({ items: [], hint: '' });
    return queryContext({
      kind: 'validate',
      evidenceIds: ids,
      records: records
    }).then(function (res) {
      var items = (res.result && res.result.items) || [];
      return { items: items, hint: budgetHintFromResult(res), raw: res };
    });
  }

  function countFileExcerptMaterials() {
    var Prep = global.OneToneHomePromptPrep;
    var model = Prep && Prep._model && Prep._model();
    var n = 0;
    ((model && model.materials) || []).forEach(function (m) {
      if (!m || !m.included || !m.provenance) return;
      var k = String(m.provenance.kind || '');
      if (k === 'file_excerpt' || k === 'search_excerpt') n++;
    });
    return n;
  }

  function paintValidateResults(items) {
    var Prep = global.OneToneHomePromptPrep;
    var model = Prep && Prep._model && Prep._model();
    var byId = {};
    ((model && model.materials) || []).forEach(function (m) {
      if (m && m.provenance && m.provenance.evidenceId) byId[m.provenance.evidenceId] = m;
    });
    var stale = [];
    var fresh = 0;
    var other = 0;
    (items || []).forEach(function (it) {
      var f = String((it && it.freshness) || '');
      if (f === 'fresh') fresh++;
      else if (f === 'changed' || f === 'missing') stale.push(it);
      else other++;
    });
    if (!stale.length) {
      // Passport/Diff alone always land here — editing README won't show changed.
      if (fresh === 0 && other > 0 && countFileExcerptMaterials() === 0) {
        lastBudgetHint = '当前材料是名片/Diff，不能验新鲜度';
        lastError = '';
        showPanel(
          '<div class="home-pcx-form">' +
            '<span>改 README 不会让名片变“过期”。请先加入<strong>文件片段</strong>再校验。</span>' +
            '<button type="button" data-pcx="stale-prep-readme">一键读取 README.md</button>' +
            '<button type="button" class="is-ghost" data-pcx="files">手动选文件</button>' +
            '<button type="button" class="is-ghost" data-pcx="panel-cancel">关闭</button></div>'
        );
        paintStatus();
        toast(lastBudgetHint);
        return;
      }
      lastBudgetHint =
        '新鲜度：' +
        fresh +
        ' 未变' +
        (other ? ' · ' + other + ' 不可校验（名片/Diff 属正常）' : '');
      lastError = '';
      hidePanel();
      paintStatus();
      toast(lastBudgetHint);
      return;
    }
    var html =
      '<div class="home-pcx-form"><span>发现 ' +
      stale.length +
      ' 项已过期 — 任选一操作</span><div class="home-pcx-picklist">';
    for (var i = 0; i < stale.length; i++) {
      var it = stale[i];
      var mid = byId[it.evidenceId] ? byId[it.evidenceId].id : '';
      var label = byId[it.evidenceId]
        ? byId[it.evidenceId].name
        : it.evidenceId;
      html +=
        '<div class="home-pcx-stale-row">' +
        '<b>' +
        escapeHtml(label) +
        '</b> · ' +
        escapeHtml(it.freshness) +
        '<div class="home-pcx-stale-acts">' +
        '<button type="button" data-pcx="stale-refresh" data-mid="' +
        escapeHtml(mid) +
        '">刷新</button>' +
        '<button type="button" data-pcx="stale-keep" data-mid="' +
        escapeHtml(mid) +
        '">继续旧版</button>' +
        '<button type="button" data-pcx="stale-remove" data-mid="' +
        escapeHtml(mid) +
        '">移除</button></div></div>';
    }
    html +=
      '</div><button type="button" class="is-ghost" data-pcx="panel-cancel">关闭</button></div>';
    showPanel(html);
    lastBudgetHint = '材料已过期，请选择刷新 / 继续旧版 / 移除';
    lastError = '';
    paintStatus();
  }

  function refreshStaleMaterial(materialId) {
    var Prep = global.OneToneHomePromptPrep;
    var model = Prep && Prep._model && Prep._model();
    if (!model || !Prep.updateMaterialContent) return Promise.reject(new Error('no_prep'));
    var row = null;
    for (var i = 0; i < model.materials.length; i++) {
      if (model.materials[i] && model.materials[i].id === materialId) {
        row = model.materials[i];
        break;
      }
    }
    if (!row || !row.provenance) return Promise.reject(new Error('not_found'));
    var rel = materialRelativePath(row);
    var range = row.provenance.range || {};
    var start = range.start || range.startLine || 1;
    var end = range.end || range.endLine || start + 40;
    if (!rel) return Promise.reject(new Error('no_path'));
    return readExcerpt(rel, start, end).then(function (c) {
      if (!c) throw new Error('read_failed');
      Prep.updateMaterialContent(materialId, { content: c.content });
      if (row.provenance) {
        row.provenance.sourceVersion = c.sourceVersion;
        row.provenance.freshness = 'captured';
        row.freshness = 'captured';
        if (c.range) row.provenance.range = c.range;
        if (c.relativePath) row.provenance.relativePath = c.relativePath;
      }
      return row;
    });
  }

  function listFiles(relativeDir) {
    return queryContext({ kind: 'list_files', relativeDir: relativeDir || '' }).then(function (res) {
      return (res.result && res.result.items) || [];
    });
  }

  function readExcerpt(relativePath, startLine, endLine) {
    return queryContext({
      kind: 'read_excerpt',
      relativePath: relativePath,
      startLine: startLine,
      endLine: endLine
    }).then(function (res) {
      var rec = res.result && res.result.record;
      var c = recordToCandidate(rec);
      if (c) pushCandidates([c]);
      return c;
    });
  }

  function buildPassport() {
    return queryContext({ kind: 'passport' }).then(function (res) {
      var rec = res.result && res.result.record;
      var c = recordToCandidate(rec);
      if (c) pushCandidates([c]);
      return c;
    });
  }

  function gitChanges(mode) {
    return queryContext({ kind: 'git_changes', mode: mode || 'unstaged' }).then(function (res) {
      return {
        mode: (res.result && res.result.mode) || mode,
        items: (res.result && res.result.items) || [],
        truncated: !!res.truncated,
        hint: budgetHintFromResult(res)
      };
    });
  }

  function gitDiff(mode, relativePath, expectedVersion) {
    return queryContext({
      kind: 'git_diff',
      mode: mode || 'unstaged',
      relativePath: relativePath,
      expectedVersion: expectedVersion || null
    }).then(function (res) {
      var rec = res.result && res.result.record;
      var c = recordToCandidate(rec);
      if (c) pushCandidates([c]);
      return c;
    });
  }

  function search(literal, relativeDir) {
    return queryContext({
      kind: 'search',
      literal: literal,
      relativeDir: relativeDir || null
    }).then(function (res) {
      var hits = (res.result && res.result.hits) || [];
      return { hits: hits, truncated: !!res.truncated, hint: budgetHintFromResult(res) };
    });
  }

  /** Minimal drawer mount — selective materials, no “全库” copy. */
  function ensureDrawer() {
    if (!featureEnabled()) return null;
    var host = document.getElementById('homeProjectContextDrawer');
    if (host) return host;
    var root = document.querySelector('.home-agent-v2') || document.body;
    host = document.createElement('div');
    host.id = 'homeProjectContextDrawer';
    host.className = 'home-pcx-drawer';
    host.innerHTML =
      '<div class="home-pcx-head">' +
      '<strong>添加工程材料</strong>' +
      '<span class="home-pcx-sub">选择性读取 · 不会自动扫描全库</span>' +
      '<button type="button" class="home-pcx-close" data-pcx="close">关闭</button>' +
      '</div>' +
      '<div class="home-pcx-actions">' +
      '<button type="button" data-pcx="open">选择工程目录</button>' +
      '<button type="button" data-pcx="passport">添加项目名片</button>' +
      '<button type="button" data-pcx="files">读取选定文件</button>' +
      '<button type="button" data-pcx="diff">查看变更</button>' +
      '<button type="button" data-pcx="search">搜索并选择片段</button>' +
      '<button type="button" data-pcx="validate">校验新鲜度</button>' +
      '</div>' +
      '<div class="home-pcx-panel" id="homePcxPanel" hidden></div>' +
      '<div class="home-pcx-status" id="homePcxStatus"></div>' +
      '<div class="home-pcx-cands" id="homePcxCands"></div>';
    root.appendChild(host);
    host.addEventListener('click', onDrawerClick);
    return host;
  }

  function toast(msg) {
    if (typeof global.__vp_toast__ === 'function') global.__vp_toast__(msg);
  }

  function showPanel(html) {
    var panel = document.getElementById('homePcxPanel');
    if (!panel) return;
    panel.hidden = !html;
    panel.innerHTML = html || '';
  }

  function hidePanel() {
    showPanel('');
  }

  function panelFilesHtml() {
    return (
      '<div class="home-pcx-form">' +
      '<label>相对路径 <input type="text" id="homePcxPath" placeholder="例如 README.md" value="README.md" /></label>' +
      '<label>行 <input type="number" id="homePcxStart" min="1" value="1" />–' +
      '<input type="number" id="homePcxEnd" min="1" value="40" /></label>' +
      '<button type="button" data-pcx="run-files">读取片段</button>' +
      '<button type="button" class="is-ghost" data-pcx="panel-cancel">取消</button></div>'
    );
  }

  function panelSearchHtml() {
    return (
      '<div class="home-pcx-form">' +
      '<label>关键词 <input type="text" id="homePcxSearch" placeholder="字面量搜索" /></label>' +
      '<button type="button" data-pcx="run-search">搜索</button>' +
      '<button type="button" class="is-ghost" data-pcx="panel-cancel">取消</button></div>'
    );
  }

  function panelDiffPickHtml() {
    return (
      '<div class="home-pcx-form">' +
      '<span>选择变更类型</span>' +
      '<button type="button" data-pcx="run-diff-list" data-mode="unstaged">unstaged</button>' +
      '<button type="button" data-pcx="run-diff-list" data-mode="staged">staged</button>' +
      '<button type="button" class="is-ghost" data-pcx="panel-cancel">取消</button></div>'
    );
  }

  function afterCandLoad() {
    paintCandidates();
    paintStatus();
  }

  function onDrawerClick(ev) {
    var t = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-pcx');
    if (!t) return;
    if (t === 'close') {
      var host = document.getElementById('homeProjectContextDrawer');
      if (host) host.hidden = true;
      return;
    }
    if (t === 'panel-cancel') {
      hidePanel();
      return;
    }
    if (t === 'open') {
      openProject().then(paintStatus).catch(paintStatus);
      return;
    }
    if (t === 'passport') {
      hidePanel();
      buildPassport().then(afterCandLoad).catch(paintStatus);
      return;
    }
    if (t === 'validate') {
      lastBudgetHint = '正在校验已加入材料…';
      paintStatus();
      validateIncludedEvidence()
        .then(function (pack) {
          if (!(pack.items && pack.items.length)) {
            lastBudgetHint = '没有可校验材料';
            showPanel(
              '<div class="home-pcx-form">' +
                '<span>请先「读取选定文件」并点「加入材料」。名片不能验新鲜度。</span>' +
                '<button type="button" data-pcx="stale-prep-readme">一键读取 README.md</button>' +
                '<button type="button" class="is-ghost" data-pcx="panel-cancel">关闭</button></div>'
            );
            paintStatus();
            toast(lastBudgetHint);
            return;
          }
          paintValidateResults(pack.items || []);
        })
        .catch(paintStatus);
      return;
    }
    if (t === 'stale-prep-readme') {
      lastBudgetHint = '正在读取 README.md…';
      paintStatus();
      readExcerpt('README.md', 1, 40)
        .then(function (c) {
          hidePanel();
          afterCandLoad();
          if (c) {
            lastBudgetHint = '已读 README 片段 — 点下方「加入材料」，再改文件末尾，然后「校验新鲜度」';
            paintStatus();
            toast('请点「加入材料」后再改 README 并校验');
          }
        })
        .catch(paintStatus);
      return;
    }
    if (t === 'stale-keep') {
      var keepId = ev.target.getAttribute('data-mid');
      if (keepId && markStaleUserConfirmed(keepId)) {
        lastBudgetHint = '已标记继续使用旧版';
        hidePanel();
        paintStatus();
        toast(lastBudgetHint);
      }
      return;
    }
    if (t === 'stale-remove') {
      var rmId = ev.target.getAttribute('data-mid');
      var PrepRm = global.OneToneHomePromptPrep;
      if (rmId && PrepRm && PrepRm.removeMaterial) {
        PrepRm.removeMaterial(rmId);
        lastBudgetHint = '已移除过期材料';
        hidePanel();
        paintStatus();
        toast(lastBudgetHint);
      }
      return;
    }
    if (t === 'stale-refresh') {
      var rfId = ev.target.getAttribute('data-mid');
      if (!rfId) return;
      lastBudgetHint = '正在刷新…';
      paintStatus();
      refreshStaleMaterial(rfId)
        .then(function () {
          hidePanel();
          lastBudgetHint = '已刷新为磁盘最新内容';
          lastError = '';
          paintStatus();
          toast(lastBudgetHint);
        })
        .catch(function (err) {
          setError(err);
          paintStatus();
          toast(lastError || '刷新失败');
        });
      return;
    }
    if (t === 'files') {
      showPanel(panelFilesHtml());
      return;
    }
    if (t === 'run-files') {
      var pathEl = document.getElementById('homePcxPath');
      var startEl = document.getElementById('homePcxStart');
      var endEl = document.getElementById('homePcxEnd');
      var path = pathEl && pathEl.value ? String(pathEl.value).trim() : '';
      if (!path) {
        lastError = '请填写相对路径';
        paintStatus();
        return;
      }
      var start = parseInt(startEl && startEl.value, 10) || 1;
      var end = parseInt(endEl && endEl.value, 10) || start + 40;
      lastBudgetHint = '正在读取…';
      paintStatus();
      readExcerpt(path, start, end)
        .then(function () {
          hidePanel();
          afterCandLoad();
        })
        .catch(paintStatus);
      return;
    }
    if (t === 'diff') {
      showPanel(panelDiffPickHtml());
      return;
    }
    if (t === 'run-diff-list') {
      var mode = ev.target.getAttribute('data-mode') || 'unstaged';
      lastBudgetHint = '正在列出 ' + mode + '…';
      // Clear prior Diff candidates so a previous repo's patch is not mistaken for success.
      candidates = [];
      paintCandidates();
      paintStatus();
      gitChanges(mode)
        .then(function (pack) {
          var items = (pack.items || []).slice(0, 20);
          if (!items.length) {
            lastBudgetHint = mode + ' 无变更（可试另一侧，或先改一个已跟踪文件）';
            lastError = '';
            paintStatus();
            showPanel(panelDiffPickHtml());
            return;
          }
          var list =
            '<div class="home-pcx-form"><span>' +
            escapeHtml(mode) +
            ' · 点一项加载 Diff</span><div class="home-pcx-picklist">';
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            list +=
              '<button type="button" data-pcx="run-diff-file" data-mode="' +
              escapeHtml(mode) +
              '" data-path="' +
              escapeHtml(it.relativePath || it.displayPath || '') +
              '">' +
              escapeHtml((it.status || '') + ' ' + (it.displayPath || it.relativePath || '')) +
              '</button>';
          }
          list +=
            '</div><button type="button" class="is-ghost" data-pcx="diff">返回</button></div>';
          showPanel(list);
          paintStatus();
        })
        .catch(function (err) {
          candidates = [];
          paintCandidates();
          paintStatus();
          var raw = String((err && err.message) || err || lastError || '');
          var isNotGit =
            /not_git|不是 Git|not a git/i.test(raw) ||
            /当前工程不是 Git/.test(lastError || '');
          var msg = isNotGit
            ? '当前目录不是 Git 仓库（或只是上级仓库的子目录）— 请改用选定文件'
            : lastError || raw || '无法查看变更';
          showPanel(
            '<div class="home-pcx-form"><span>' +
              escapeHtml(msg) +
              '</span>' +
              '<button type="button" data-pcx="files">改用读取选定文件</button>' +
              '<button type="button" class="is-ghost" data-pcx="panel-cancel">关闭</button></div>'
          );
          toast(msg);
        });
      return;
    }
    if (t === 'run-diff-file') {
      var dm = ev.target.getAttribute('data-mode') || 'unstaged';
      var rp = ev.target.getAttribute('data-path') || '';
      if (!rp) return;
      lastBudgetHint = '正在读取 Diff…';
      paintStatus();
      gitDiff(dm, rp)
        .then(function () {
          hidePanel();
          afterCandLoad();
        })
        .catch(paintStatus);
      return;
    }
    if (t === 'search') {
      showPanel(panelSearchHtml());
      return;
    }
    if (t === 'run-search') {
      var qEl = document.getElementById('homePcxSearch');
      var lit = qEl && qEl.value ? String(qEl.value).trim() : '';
      if (!lit) {
        lastError = '请填写搜索关键词';
        paintStatus();
        return;
      }
      lastBudgetHint = '正在搜索…';
      paintStatus();
      search(lit)
        .then(function (pack) {
          var hits = pack.hits || [];
          if (!hits.length) {
            lastBudgetHint = '无命中（不代表项目不存在此代码）';
            lastError = '';
            paintStatus();
            return;
          }
          var list =
            '<div class="home-pcx-form"><span>命中 ' +
            hits.length +
            ' · 点一项读片段</span><div class="home-pcx-picklist">';
          for (var j = 0; j < Math.min(hits.length, 12); j++) {
            var h = hits[j];
            list +=
              '<button type="button" data-pcx="run-hit" data-path="' +
              escapeHtml(h.relativePath || '') +
              '" data-line="' +
              String(h.line || 1) +
              '">' +
              escapeHtml((h.displayPath || h.relativePath || '') + ':' + h.line) +
              '</button>';
          }
          list +=
            '</div><button type="button" class="is-ghost" data-pcx="search">返回</button></div>';
          showPanel(list);
          paintStatus();
        })
        .catch(paintStatus);
      return;
    }
    if (t === 'run-hit') {
      var hp = ev.target.getAttribute('data-path') || '';
      var hl = parseInt(ev.target.getAttribute('data-line'), 10) || 1;
      if (!hp) return;
      var a = Math.max(1, hl - 3);
      var b = hl + 12;
      lastBudgetHint = '正在读取命中片段…';
      paintStatus();
      readExcerpt(hp, a, b)
        .then(function () {
          hidePanel();
          afterCandLoad();
        })
        .catch(paintStatus);
    }
  }

  function paintStatus() {
    var el = document.getElementById('homePcxStatus');
    if (!el) return;
    var bits = [];
    if (activeScope) bits.push('已选：' + (activeScope.displayName || activeScope.displayRoot || ''));
    if (lastBudgetHint) bits.push(lastBudgetHint);
    if (lastError) bits.push(lastError);
    el.textContent = bits.join(' · ') || '选择工程目录后，再读取选定材料';
  }

  function paintCandidates() {
    var el = document.getElementById('homePcxCands');
    if (!el) return;
    if (!candidates.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = candidates
      .map(function (c, i) {
        var trunc = c.truncated ? ' · 已截断' : '';
        return (
          '<div class="home-pcx-cand" data-ci="' +
          i +
          '"><div class="home-pcx-cand-meta">' +
          escapeHtml(c.label || '') +
          trunc +
          '</div><pre class="home-pcx-cand-body">' +
          escapeHtml((c.content || '').slice(0, 1200)) +
          '</pre><button type="button" data-adopt="' +
          i +
          '">采用</button></div>'
        );
      })
      .join('');
    syncConsultCandidates(candidates);
    el.onclick = function (ev) {
      var a = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-adopt');
      if (a == null) return;
      var c = candidates[parseInt(a, 10)];
      if (!c) return;
      var row = adoptEvidence({
        id: c.evidenceId,
        scopeId: c.scopeId,
        taskScopeId: c.taskScopeId,
        kind: c.kind,
        label: c.label,
        displayPath: c.displayPath,
        sourceRef: c.sourceRef,
        relativePath: c.relativePath,
        range: c.range,
        content: c.content,
        sourceVersion: c.sourceVersion,
        capturedAt: c.capturedAt,
        truncated: c.truncated,
        limitReason: c.limitReason,
        freshness: c.freshness
      });
      if (row) {
        var rangeHint =
          row.provenance && row.provenance.range
            ? ' L' + (row.provenance.range.start || '') + '-' + (row.provenance.range.end || '')
            : '';
        lastBudgetHint =
          '已采用：' +
          (row.name || '') +
          rangeHint +
          ' · 可在下方交接区直发（无需整理）';
        paintStatus();
        toast('已采用：' + (row.name || '工程材料'));
        // Drop adopted preview from consult strip so A′.3「未采用→采用」对照清楚.
        syncConsultCandidates([]);
        var S = global.OneToneHomeAgentV2Store;
        if (S && S.syncMaterialsFromPrep) {
          try {
            S.syncMaterialsFromPrep();
          } catch (_) {}
        }
        if (S && S.setValidationNotice) {
          S.setValidationNotice({
            kind: 'consult',
            message: '已采用材料，进入发送区'
          });
        }
      } else {
        paintStatus();
        toast(lastError || '采用失败');
      }
    };
  }

  /** Keep HA2 consult「采用」in sync with drawer previews (same adopt gate). */
  function syncConsultCandidates(list) {
    var C = global.OneToneHomeContextConcierge;
    if (!C || typeof C.setCandidatesFromPcx !== 'function') return;
    try {
      C.setCandidatesFromPcx(list || []);
    } catch (_) {}
    var S = global.OneToneHomeAgentV2Store;
    if (S && typeof S.setValidationNotice === 'function' && (list || []).length) {
      try {
        S.setValidationNotice({
          kind: 'consult',
          message: '待采用 ' + list.length + ' 条 — 会诊条或预览下点「采用」'
        });
      } catch (_) {}
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function openDrawer() {
    if (!featureEnabled()) return false;
    var host = ensureDrawer();
    if (!host) return false;
    host.hidden = false;
    paintStatus();
    paintCandidates();
    return true;
  }

  /** Phase2.5: backend-native find-materials grant (not FE-only consent). */
  function grantFindMaterials(projectId, _taskScopeId) {
    if (!featureEnabled()) {
      return Promise.reject(new Error('feature_disabled'));
    }
    var ts = _taskScopeId || taskScopeId();
    var pid = String(projectId || '').trim();
    if (!ts || !pid) return Promise.reject(new Error('scope_required'));
    return invoke('cmd_project_context_grant_find_materials', {
      taskScopeId: ts,
      projectId: pid
    }).catch(function (err) {
      setError(err);
      return Promise.reject(err);
    });
  }

  /** Phase2.5: open scope only with matching grant; never send absolute path. */
  function openConfirmedProject(projectId, _taskScopeId) {
    if (!featureEnabled()) {
      return Promise.reject(new Error('feature_disabled'));
    }
    var ts = _taskScopeId || taskScopeId();
    var pid = String(projectId || '').trim();
    if (!ts || !pid) return Promise.reject(new Error('scope_required'));
    return invoke('cmd_project_context_open_confirmed', {
      taskScopeId: ts,
      projectId: pid
    })
      .then(function (scope) {
        activeScope = scope || null;
        candidates = [];
        lastError = '';
        lastBudgetHint = scope
          ? '已授权查找：' + (scope.displayName || scope.displayRoot || '')
          : '';
        paintCandidates();
        return scope;
      })
      .catch(function (err) {
        setError(err);
        return Promise.reject(err);
      });
  }

  function revokeFindGrant(opts) {
    opts = opts || {};
    return invoke('cmd_project_context_revoke_grant', {
      grantId: opts.grantId || null,
      taskScopeId: opts.taskScopeId || taskScopeId() || null,
      projectId: opts.projectId || null
    }).catch(function () {
      return { revoked: false };
    });
  }

  global.OneToneHomeProjectContext = {
    FLAG_KEY: FLAG_KEY,
    featureEnabled: featureEnabled,
    reasonMessage: reasonMessage,
    openProject: openProject,
    openConfirmedProject: openConfirmedProject,
    grantFindMaterials: grantFindMaterials,
    revokeFindGrant: revokeFindGrant,
    closeProject: closeProject,
    queryContext: queryContext,
    adoptEvidence: adoptEvidence,
    validateIncludedEvidence: validateIncludedEvidence,
    markStaleUserConfirmed: markStaleUserConfirmed,
    listFiles: listFiles,
    readExcerpt: readExcerpt,
    buildPassport: buildPassport,
    gitChanges: gitChanges,
    gitDiff: gitDiff,
    search: search,
    openDrawer: openDrawer,
    getActiveScope: function () {
      return activeScope;
    },
    getCandidates: function () {
      return candidates.slice();
    },
    getBudgetHint: function () {
      return lastBudgetHint;
    },
    getLastError: function () {
      return lastError;
    },
    _pushCandidatesForTest: pushCandidates,
    _setActiveScopeForTest: function (s) {
      activeScope = s;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
