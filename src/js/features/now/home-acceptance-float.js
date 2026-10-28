/**
 * Phase1 / Phase2 RC / Phase2.5 A′ acceptance radar + guided verify desk.
 * Enable: localStorage onetone.acceptanceFloat=1  or  Ctrl+Shift+A
 * Marks: localStorage onetone.acceptanceMarks / onetone.acceptanceMarksP25
 * (operator only — ≠ release docs; never auto-write audit passed)
 */
(function (global) {
  'use strict';

  var FLAG = 'onetone.acceptanceFloat';
  var MARKS_KEY = 'onetone.acceptanceMarks';
  var MARKS_P25_KEY = 'onetone.acceptanceMarksP25';
  var PCX_FLAG = 'onetone.projectContext.enabled';
  var ROOT_ID = 'onetoneAcceptanceFloat';
  /** Bump when click handlers change — stale DOM from HMR keeps old bind otherwise. */
  var BIND_VER = '6';
  var AUTO_CMD = 'npm run verify:phase2-rc';
  var EVIDENCE_DIR = 'docs/phase2.5-evidence/';

  var LABEL = {
    passed: '通过',
    pending: '待验',
    skipped: '跳过',
    unverified: '未验证',
    failed: '失败'
  };

  /** Manual queue — cannot be one-click (native dialog / real UI). */
  var GUIDE = [
    {
      id: 'a1_flag',
      title: '打开工程材料入口',
      how: '点下方「启用入口」→ 刷新后应出现「添加工程材料」。未启用时必须隐藏。'
    },
    {
      id: 'a3_dialog',
      title: '原生目录选择器',
      how: '主窗口打开材料抽屉 →「选择工程目录」→ 系统文件夹对话框选一个小仓库。禁止手输路径开权。'
    },
    {
      id: 'a5_read',
      title: '读片段 / 名片',
      how: '点「添加项目名片」或「读取选定文件」→ 抽屉内填路径（勿用系统 prompt）→ 出现候选预览。'
    },
    {
      id: 'a7_adopt',
      title: 'Adopt 与预算',
      how: '点候选下「加入材料」→ 状态栏显示已加入；材料进入交接区（未加入前不进发送正文）。'
    },
    {
      id: 'a9_send',
      title: '无 key 直发',
      how: '首页交接区对已加入材料直接发送（不要点整理）。无模型密钥也应能发。'
    },
    {
      id: 'a8_stale',
      title: 'Stale 三态',
      how: '先读文件片段并加入（名片无效）→ 改磁盘文件 →「校验新鲜度」→ 刷新/继续旧版/移除任选一。'
    },
    {
      id: 'b1_git',
      title: 'Git staged ≠ unstaged',
      how: '「查看变更」→ 分别点 unstaged / staged → 从列表点文件加载 Diff。无变更时先改一个已跟踪文件。'
    },
    {
      id: 'b_degrade',
      title: '非 Git / 降级',
      how: '选非 Git 文件夹后点「查看变更」→ 应出现「改用读取选定文件」。'
    },
    {
      id: 'a10_shot',
      title: '截图留证',
      how: 'Win+Shift+S 截：材料抽屉、Diff 列表、新鲜度过期面板各一张即可。'
    }
  ];

  /** Phase2.5 A′ — click actions help; screenshots + marks still operator. */
  var GUIDE_P25 = [
    {
      id: 'p25_a1',
      title: 'A′.1 flag 开/关对照',
      how:
        '点「关 flag」→ 会诊条与「手动添加材料」应立刻消失 → 截图 →「开 flag」→ 两者立刻回来 → 再截。不必整页刷新；面板上 PCX flag 药丸应跟手变色。',
      actions: [
        { act: 'p25-flag-off', label: '关 flag', primary: true },
        { act: 'p25-flag-on', label: '开 flag' },
        { act: 'p25-reload', label: '硬刷新' },
        { act: 'p25-shot-hint', label: '截图提示' }
      ]
    },
    {
      id: 'p25_a2',
      title: 'A′.2 无 grant 不读盘',
      how:
        '只验会诊「查找材料」路径：先别点它。点「自检无 grant」应显示通过。手动抽屉「选择工程目录」是 Phase2 另一条路——出现「已选：xxx」不算本步失败，可「清手动 scope」去掉干扰后再截图。',
      actions: [
        { act: 'p25-check-no-grant', label: '自检无 grant', primary: true },
        { act: 'p25-clear-manual-scope', label: '清手动 scope' },
        { act: 'p25-scroll-consult', label: '定位会诊条' },
        { act: 'p25-shot-hint', label: '截图提示' }
      ]
    },
    {
      id: 'p25_a3',
      title: 'A′.3 查找 → 未 adopt → adopt',
      how:
        '未采用预览有两处：会诊条「采用」，或材料抽屉里 README 预览下的「加入材料」（同一含义）。抽屉打开时会挡住会诊条——可先截抽屉预览，再点「加入材料/采用」，最后截页脚材料数>0。不要在未截图前点加入。',
      actions: [
        { act: 'p25-seed-draft', label: '填草稿 README' },
        { act: 'p25-consult-find', label: '查找材料' },
        { act: 'p25-adopt', label: '采用/加入材料', primary: true },
        { act: 'p25-shot-hint', label: '截图提示' }
      ]
    },
    {
      id: 'p25_a4',
      title: 'A′.4 suggested → 确认理解',
      how:
        '草稿写一句现象 →「帮我说清楚」→ 截建议稿 →「确认理解」→ 截已确认。禁止出现「诊断完成/已找到病因」。',
      actions: [
        { act: 'p25-consult-clarify', label: '帮我说清楚', primary: true },
        { act: 'p25-consult-confirm', label: '确认理解' },
        { act: 'p25-consult-compile', label: '生成检查单' },
        { act: 'p25-shot-hint', label: '截图提示' }
      ]
    },
    {
      id: 'p25_a5',
      title: 'A′.5 纯截图诚实',
      how:
        '用「+ / 添加」加入一张无文字截图。检查单/会诊不得宣称已 OCR 或据此定根因。',
      actions: [
        { act: 'p25-add-mat', label: '点添加材料 +', primary: true },
        { act: 'p25-consult-compile', label: '生成检查单' },
        { act: 'p25-shot-hint', label: '截图提示' }
      ]
    },
    {
      id: 'p25_a6',
      title: 'A′.6 证据收束',
      how:
        '把截图放进 ' +
        EVIDENCE_DIR +
        '，勾本步通过。B′ 引用 Phase2、C′ skipped。齐后才改 phase2.5-audit 为 passed。',
      actions: [
        { act: 'p25-copy-evidence', label: '复制证据清单', primary: true },
        { act: 'p25-copy-audit-line', label: '复制审计结论草稿' }
      ]
    }
  ];

  var DATA = {
    stamp: 'RC 闭环 2026-10-28 · C skipped',
    layers:
      'implementation: passed\n' +
      'automated verification: passed\n' +
      'Phase2.0 preflight: passed\n' +
      'local desktop: passed\n' +
      'remote organize: skipped\n' +
      'release acceptance: passed',
    phase1Banner:
      'Phase1 status: accepted\nAssist: implemented\ntask_organize: local verified · real skipped',
    phase1: [
      { status: 'passed', title: 'Assist Runtime', note: 'cmd_assist_run / cancel / ready' },
      { status: 'passed', title: '出站快照 + citeMode', note: 'buildAssistInputSnapshot' },
      { status: 'passed', title: '草稿守卫 / 直接发送', note: 'raw / organized / activeDraft' },
      { status: 'passed', title: '本地假传输整理', note: 'task_organize · local/fake verified' },
      { status: 'skipped', title: '真实提供商整理', note: 'real provider · skipped（无授权）' },
      { status: 'passed', title: '真机引导 / 截图', note: '引导九步全绿 2026-10-28' },
      { status: 'passed', title: '模拟 UI checklist', note: '自动化层' }
    ],
    phase2: [
      { status: 'passed', title: '实现 + 自动化', note: 'verify:phase2-rc 全绿' },
      { status: 'passed', title: 'Phase2.0 预检门', note: '七项通过 · RC 口径' },
      { status: 'passed', title: 'Assist IPC args 包装', note: 'test-home-assist-ipc-contract' },
      { status: 'passed', title: '主窗口 capability', note: 'project-context-main only' },
      { status: 'passed', title: '路径安全 / junction', note: 'lib tests · Windows' },
      { status: 'passed', title: 'exe 重建 (debug)', note: '含 dialog/serde 修复' },
      { status: 'passed', title: '桌面本地闭环 A', note: '引导九步真机点通' },
      { status: 'passed', title: 'Git 闭环 B', note: 'unstaged + 非 Git 降级' },
      { status: 'skipped', title: '真实远程整理 C', note: '无费用授权 · skipped' },
      { status: 'passed', title: 'Release acceptance', note: 'A+B 过 · C skipped · 非 NSIS' }
    ]
  };

  function flagOn() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(FLAG) === '1');
    } catch (_) {
      return false;
    }
  }

  function setFlag(on) {
    try {
      if (!global.localStorage) return;
      if (on) global.localStorage.setItem(FLAG, '1');
      else global.localStorage.removeItem(FLAG);
    } catch (_) {}
  }

  function loadMarks() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(MARKS_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function saveMarks(marks) {
    try {
      if (global.localStorage) global.localStorage.setItem(MARKS_KEY, JSON.stringify(marks || {}));
    } catch (_) {}
  }

  function loadMarksP25() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(MARKS_P25_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function saveMarksP25(marks) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(MARKS_P25_KEY, JSON.stringify(marks || {}));
      }
    } catch (_) {}
  }

  function pcxOn() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(PCX_FLAG) === '1');
    } catch (_) {
      return false;
    }
  }

  /** Write flag, verify, and re-paint Agent dock so 会诊/手动入口跟手显隐. */
  function applyPcxFlag(on) {
    try {
      if (!global.localStorage) {
        toast('无 localStorage');
        return false;
      }
      if (on) global.localStorage.setItem(PCX_FLAG, '1');
      else global.localStorage.removeItem(PCX_FLAG);
    } catch (_) {
      toast('无法写 localStorage');
      return false;
    }
    var ok = pcxOn() === !!on;
    if (!ok) {
      toast('flag 写入后读回不一致');
      return false;
    }
    var S = global.OneToneHomeAgentV2Store;
    if (S && typeof S.setValidationNotice === 'function') {
      try {
        S.setValidationNotice({
          kind: 'pcx-flag',
          message: on ? '工程材料入口已开（会诊条应出现）' : '工程材料入口已关（会诊条应隐藏）'
        });
      } catch (_) {}
    }
    var pcxBtn = document.querySelector('[data-ha2-pcx]');
    if (pcxBtn) pcxBtn.hidden = !on;
    return true;
  }

  function hardReload() {
    try {
      var u = String(global.location.href || '');
      if (u) {
        global.location.replace(u);
        return;
      }
    } catch (_) {}
    try {
      global.location.reload();
    } catch (_) {
      toast('请按 Ctrl+R 手动刷新');
    }
  }

  function clickSel(sel) {
    var el = document.querySelector(sel);
    if (!el) return false;
    try {
      el.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  function scrollConsult() {
    var el =
      document.querySelector('[data-ha2-consult]') ||
      document.querySelector('.ha2-consult') ||
      document.querySelector('[data-ha2-consult-find]');
    if (el && el.scrollIntoView) {
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_) {
        el.scrollIntoView(true);
      }
      return true;
    }
    return false;
  }

  function prepModel() {
    var Prep = global.OneToneHomePromptPrep;
    try {
      return Prep && Prep._model ? Prep._model() : null;
    } catch (_) {
      return null;
    }
  }

  function currentProjectId() {
    var S = global.OneToneHomeAgentV2Store;
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    if (snap && snap.project && snap.project.id) return String(snap.project.id);
    if (snap && snap.focusDto && snap.focusDto.project && snap.focusDto.project.id) {
      return String(snap.focusDto.project.id);
    }
    var C = global.OneToneHomeContextConcierge;
    var st = C && C.getPublicState ? C.getPublicState() : null;
    if (st && st.capsule && st.capsule.projectId) return String(st.capsule.projectId);
    return '';
  }

  function ipcInvoke(cmd, payload) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return ipc.invoke(cmd, { args: payload || {} });
  }

  /** A′.2: consult path must not read without grant; manual dialog scope is a different road. */
  function checkNoGrant() {
    var C = global.OneToneHomeContextConcierge;
    var PC = global.OneToneHomeProjectContext;
    var st = C && C.getPublicState ? C.getPublicState() : null;
    var fails = [];
    var notes = [];
    if (!pcxOn()) fails.push('PCX flag 未开');
    if (st && st.grant && st.grant.grantId) {
      fails.push('会诊仍持有 grant（先清手动/撤权或硬刷新）');
    }
    if (st && st.candidates && st.candidates.length) {
      fails.push('会诊候选未空×' + st.candidates.length);
    }
    var pm = prepModel();
    var mats = (pm && pm.materials) || [];
    var pcxMats = mats.filter(function (m) {
      return m && (m.evidenceId || (m.provenance && (m.provenance.scopeId || m.provenance.relativePath)));
    });
    if (pcxMats.length) fails.push('已加入工程材料×' + pcxMats.length + '（应先清空）');

    var scope = PC && PC.getActiveScope ? PC.getActiveScope() : null;
    if (scope) {
      notes.push(
        '手动 scope「' +
          (scope.displayName || scope.displayRoot || '') +
          '」仍在 — Phase2 另一条路，点「清手动 scope」再验更干净'
      );
    }

    var suggestP =
      C && typeof C.suggestEvidence === 'function'
        ? C.suggestEvidence({ rawText: '' }).then(function (res) {
            res = res || {};
            if (res.reason === 'grant_required') return;
            if (res.candidates && res.candidates.length) {
              fails.push('suggestEvidence 无 grant 却返回候选');
            } else if (res.reason && res.reason !== 'feature_disabled') {
              notes.push('suggestEvidence reason=' + res.reason);
            }
          })
        : Promise.resolve();

    var pid = currentProjectId();
    var ts = (pm && pm.taskScopeId) || '';
    var backendP;
    if (!pid || !ts) {
      notes.push('缺 projectId/taskScope，跳过后端 open_confirmed 探针（请先确认项目）');
      backendP = Promise.resolve();
    } else {
      backendP = ipcInvoke('cmd_project_context_open_confirmed', {
        taskScopeId: ts,
        projectId: pid
      })
        .then(function () {
          fails.push('后端 open_confirmed 无 grant 却成功（应拒绝）');
        })
        .catch(function (err) {
          var msg = String((err && err.message) || err || '');
          if (/grant_required|GrantRequired|not_found|NotFound|feature_disabled/i.test(msg)) {
            notes.push('后端已拒绝 open_confirmed');
            return;
          }
          // Any rejection still counts as「未打开读盘」for A′.2.
          notes.push('后端拒绝：' + msg.slice(0, 80));
        });
    }

    return Promise.all([suggestP, backendP]).then(function () {
      return { ok: !fails.length, fails: fails, notes: notes };
    });
  }

  function clearManualScope() {
    var PC = global.OneToneHomeProjectContext;
    var C = global.OneToneHomeContextConcierge;
    var pid = currentProjectId();
    // Drops FE grant + candidates and closes PCX scope (manual or confirmed).
    if (C && typeof C.invalidateOnProjectChange === 'function') {
      try {
        C.invalidateOnProjectChange(pid || null);
      } catch (_) {}
    } else {
      if (PC && typeof PC.revokeFindGrant === 'function') {
        try {
          PC.revokeFindGrant({});
        } catch (_) {}
      }
      if (PC && typeof PC.closeProject === 'function') {
        try {
          PC.closeProject();
        } catch (_) {}
      }
    }
    var S = global.OneToneHomeAgentV2Store;
    if (S && S.setValidationNotice) {
      S.setValidationNotice({
        kind: 'pcx-flag',
        message: '已清手动 scope / 查找 grant — 再点「自检无 grant」'
      });
    }
    return !(PC && PC.getActiveScope && PC.getActiveScope());
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function count(items) {
    var pass = 0;
    var pend = 0;
    for (var i = 0; i < items.length; i++) {
      var st = items[i].status;
      if (st === 'passed') pass++;
      else if (st === 'pending' || st === 'unverified') pend++;
    }
    return { pass: pass, pend: pend };
  }

  function listHtml(items) {
    var html = '<ul class="acc-list">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html +=
        '<li class="acc-item">' +
        '<span class="acc-dot" data-s="' +
        esc(it.status) +
        '"></span>' +
        '<div class="acc-item-main"><b>' +
        esc(it.title) +
        '</b><small>' +
        esc(it.note) +
        '</small></div>' +
        '<span class="acc-pill" data-s="' +
        esc(it.status) +
        '">' +
        esc(LABEL[it.status] || it.status) +
        '</span></li>';
    }
    return html + '</ul>';
  }

  function guideProgress(marks) {
    var done = 0;
    for (var i = 0; i < GUIDE.length; i++) {
      var st = marks[GUIDE[i].id];
      if (st === 'passed' || st === 'skipped') done++;
    }
    return { done: done, total: GUIDE.length };
  }

  function firstOpenStep(marks) {
    for (var i = 0; i < GUIDE.length; i++) {
      if (!marks[GUIDE[i].id]) return { index: i, step: GUIDE[i] };
    }
    return null;
  }

  function guideHtml(marks, stepIndex) {
    var gp = guideProgress(marks);
    var idx = typeof stepIndex === 'number' ? stepIndex : 0;
    if (idx < 0) idx = 0;
    if (idx >= GUIDE.length) idx = GUIDE.length - 1;
    var step = GUIDE[idx];
    var st = marks[step.id] || 'pending';
    var open = firstOpenStep(marks);
    var allDone = !open;

    var trail = '<ol class="acc-trail">';
    for (var i = 0; i < GUIDE.length; i++) {
      var m = marks[GUIDE[i].id] || 'pending';
      trail +=
        '<li class="acc-trail-item' +
        (i === idx ? ' is-current' : '') +
        '" data-acc="goto" data-idx="' +
        i +
        '"><span class="acc-dot" data-s="' +
        esc(m) +
        '"></span>' +
        esc(GUIDE[i].title) +
        '</li>';
    }
    trail += '</ol>';

    return (
      '<div class="acc-guide" data-guide-idx="' +
      idx +
      '">' +
      '<div class="acc-layer">一键只能跑自动化。本台逐步勾选手动项（存本机，≠ 文档 release）。</div>' +
      '<div class="acc-auto-row">' +
      '<button type="button" class="acc-cta" data-acc="copy-auto">复制：' +
      esc(AUTO_CMD) +
      '</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="enable-pcx">启用入口</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="open-pcx">打开材料抽屉</button>' +
      '</div>' +
      '<p class="acc-guide-prog">手动进度 <strong>' +
      gp.done +
      '/' +
      gp.total +
      '</strong>' +
      (allDone ? ' · 可回填 A/B 文档' : '') +
      '</p>' +
      '<div class="acc-guide-card">' +
      '<em>步骤 ' +
      (idx + 1) +
      '/' +
      GUIDE.length +
      '</em>' +
      '<b>' +
      esc(step.title) +
      '</b>' +
      '<p>' +
      esc(step.how) +
      '</p>' +
      '<span class="acc-pill" data-s="' +
      esc(st) +
      '">' +
      esc(LABEL[st] || st) +
      '</span>' +
      '<div class="acc-guide-actions">' +
      '<button type="button" class="acc-cta" data-acc="mark" data-mark="passed" data-id="' +
      esc(step.id) +
      '">本步通过</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="mark" data-mark="failed" data-id="' +
      esc(step.id) +
      '">失败</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="mark" data-mark="skipped" data-id="' +
      esc(step.id) +
      '">跳过</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="prev">上一步</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="next">下一步</button>' +
      '</div></div>' +
      trail +
      '<button type="button" class="acc-cta is-ghost acc-reset" data-acc="reset-marks">清空手动勾选</button>' +
      '</div>'
    );
  }

  function paintGuide(el, stepIndex) {
    var panel = el.querySelector('[data-panel="guide"]');
    if (!panel) return;
    var marks = loadMarks();
    var idx = stepIndex;
    if (idx == null) {
      var open = firstOpenStep(marks);
      idx = open ? open.index : 0;
    }
    panel.innerHTML = guideHtml(marks, idx);
  }

  function firstOpenStepP25(marks) {
    for (var i = 0; i < GUIDE_P25.length; i++) {
      if (!marks[GUIDE_P25[i].id]) return { index: i, step: GUIDE_P25[i] };
    }
    return null;
  }

  function guideProgressP25(marks) {
    var done = 0;
    for (var i = 0; i < GUIDE_P25.length; i++) {
      var st = marks[GUIDE_P25[i].id];
      if (st === 'passed' || st === 'skipped') done++;
    }
    return { done: done, total: GUIDE_P25.length };
  }

  function p25ActionsHtml(step) {
    var acts = step.actions || [];
    var html = '<div class="acc-guide-actions acc-p25-actions">';
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      html +=
        '<button type="button" class="acc-cta' +
        (a.primary ? '' : ' is-ghost') +
        '" data-acc="' +
        esc(a.act) +
        '">' +
        esc(a.label) +
        '</button>';
    }
    return html + '</div>';
  }

  function guideP25Html(marks, stepIndex) {
    var gp = guideProgressP25(marks);
    var idx = typeof stepIndex === 'number' ? stepIndex : 0;
    if (idx < 0) idx = 0;
    if (idx >= GUIDE_P25.length) idx = GUIDE_P25.length - 1;
    var step = GUIDE_P25[idx];
    var st = marks[step.id] || 'pending';
    var open = firstOpenStepP25(marks);
    var allDone = !open;
    var flag = pcxOn() ? '开' : '关';

    var trail = '<ol class="acc-trail">';
    for (var i = 0; i < GUIDE_P25.length; i++) {
      var m = marks[GUIDE_P25[i].id] || 'pending';
      trail +=
        '<li class="acc-trail-item' +
        (i === idx ? ' is-current' : '') +
        '" data-acc="p25-goto" data-idx="' +
        i +
        '"><span class="acc-dot" data-s="' +
        esc(m) +
        '"></span>' +
        esc(GUIDE_P25[i].title) +
        '</li>';
    }
    trail += '</ol>';

    return (
      '<div class="acc-guide" data-guide-p25-idx="' +
      idx +
      '">' +
      '<div class="acc-layer">Phase2.5 A′ 点验台 · 按钮帮你点 UI；截图与「本步通过」仍要人手。' +
      'B′ 引用 Phase2 · C′ skipped · <strong>勿在未齐证据时改审计 passed</strong>。</div>' +
      '<div class="acc-auto-row">' +
      '<span class="acc-pill" data-s="' +
      (pcxOn() ? 'passed' : 'pending') +
      '">PCX flag：' +
      flag +
      '</span>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-flag-on">开 flag</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-flag-off">关 flag</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-reload">刷新</button>' +
      '</div>' +
      '<p class="acc-guide-prog">A′ 进度 <strong>' +
      gp.done +
      '/' +
      gp.total +
      '</strong>' +
      (allDone ? ' · 可回填 phase2.5-audit' : '') +
      '</p>' +
      '<div class="acc-guide-card">' +
      '<em>A′ ' +
      (idx + 1) +
      '/' +
      GUIDE_P25.length +
      '</em>' +
      '<b>' +
      esc(step.title) +
      '</b>' +
      '<p>' +
      esc(step.how) +
      '</p>' +
      '<span class="acc-pill" data-s="' +
      esc(st) +
      '">' +
      esc(LABEL[st] || st) +
      '</span>' +
      p25ActionsHtml(step) +
      '<div class="acc-guide-actions">' +
      '<button type="button" class="acc-cta" data-acc="p25-mark" data-mark="passed" data-id="' +
      esc(step.id) +
      '">本步通过</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-mark" data-mark="failed" data-id="' +
      esc(step.id) +
      '">失败</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-mark" data-mark="skipped" data-id="' +
      esc(step.id) +
      '">跳过</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-prev">上一步</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="p25-next">下一步</button>' +
      '</div></div>' +
      trail +
      '<button type="button" class="acc-cta is-ghost acc-reset" data-acc="p25-reset">清空 A′ 勾选</button>' +
      '</div>'
    );
  }

  function paintP25(el, stepIndex) {
    var panel = el.querySelector('[data-panel="p25"]');
    if (!panel) return;
    var marks = loadMarksP25();
    var idx = stepIndex;
    if (idx == null) {
      var open = firstOpenStepP25(marks);
      idx = open ? open.index : 0;
    }
    panel.innerHTML = guideP25Html(marks, idx);
  }

  function currentP25Idx(el) {
    var g = el.querySelector('[data-guide-p25-idx]');
    if (!g) return 0;
    return parseInt(g.getAttribute('data-guide-p25-idx'), 10) || 0;
  }

  function ensure() {
    var el = document.getElementById(ROOT_ID);
    // HMR / re-inject leaves old click bind; rebuild when version drifts.
    if (el && el.getAttribute('data-acc-ver') !== BIND_VER) {
      try {
        el.remove();
      } catch (_) {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
      el = null;
    }
    if (el) return el;

    var all = DATA.phase1.concat(DATA.phase2);
    var c = count(all);
    var pct = all.length ? c.pass / all.length : 0;

    el = document.createElement('aside');
    el.id = ROOT_ID;
    el.className = 'acc-float acc-float--desk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'OneTone 验收台');
    el.setAttribute('data-acc-ver', BIND_VER);
    el.style.setProperty('--pct', String(pct));
    el.innerHTML =
      '<header class="acc-head" data-acc="drag">' +
      '<div class="acc-badge" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/>' +
      '</svg></div>' +
      '<div class="acc-titles"><strong>验收台 · Phase2.5 A′</strong>' +
      '<span>' +
      esc(DATA.stamp) +
      ' · 2.5 桌面未 passed</span></div>' +
      '<div class="acc-actions">' +
      '<button type="button" class="acc-icon-btn" data-acc="collapse" title="折叠" aria-expanded="true">−</button>' +
      '<button type="button" class="acc-icon-btn" data-acc="close" title="关闭">×</button>' +
      '</div></header>' +
      '<div class="acc-body">' +
      '<div class="acc-summary">' +
      '<div class="acc-stat" data-tone="pass"><em>Auto 层</em><strong>' +
      c.pass +
      '</strong></div>' +
      '<div class="acc-stat" data-tone="pend"><em>仍待验</em><strong>' +
      c.pend +
      '</strong></div></div>' +
      '<div class="acc-tabs" role="tablist">' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="p25" aria-selected="true">2.5 A′</button>' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="guide" aria-selected="false">Phase2 引导</button>' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="1" aria-selected="false">Phase1</button>' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="2" aria-selected="false">Phase2</button>' +
      '</div>' +
      '<div data-acc="panel" data-panel="p25"></div>' +
      '<div data-acc="panel" data-panel="guide" hidden></div>' +
      '<div data-acc="panel" data-panel="1" hidden>' +
      '<div class="acc-layer">' +
      esc(DATA.phase1Banner) +
      '</div>' +
      listHtml(DATA.phase1) +
      '</div>' +
      '<div data-acc="panel" data-panel="2" hidden>' +
      '<div class="acc-layer">' +
      esc(DATA.layers) +
      '</div>' +
      listHtml(DATA.phase2) +
      '</div></div>' +
      '<footer class="acc-foot">自动：<code>' +
      esc(AUTO_CMD) +
      '</code> · A′ 点验：本台 · <code>Ctrl+Shift+A</code></footer>';

    document.body.appendChild(el);
    paintP25(el);
    paintGuide(el);
    bind(el);
    return el;
  }

  function currentGuideIdx(el) {
    var g = el.querySelector('.acc-guide');
    if (!g) return 0;
    return parseInt(g.getAttribute('data-guide-idx'), 10) || 0;
  }

  function toast(msg) {
    if (typeof global.__vp_toast__ === 'function') global.__vp_toast__(msg);
    else if (global.console) global.console.info('[acceptance]', msg);
  }

  function bind(el) {
    el.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest('[data-acc]');
      if (!t) return;
      var act = t.getAttribute('data-acc');
      if (act === 'close') {
        hide();
        setFlag(false);
        return;
      }
      if (act === 'collapse') {
        var on = el.classList.toggle('is-collapsed');
        t.textContent = on ? '+' : '−';
        t.setAttribute('aria-expanded', on ? 'false' : 'true');
        return;
      }
      if (act === 'tab') {
        var which = t.getAttribute('data-tab');
        var tabs = el.querySelectorAll('[data-acc="tab"]');
        var panels = el.querySelectorAll('[data-acc="panel"]');
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].setAttribute(
            'aria-selected',
            tabs[i].getAttribute('data-tab') === which ? 'true' : 'false'
          );
        }
        for (var j = 0; j < panels.length; j++) {
          panels[j].hidden = panels[j].getAttribute('data-panel') !== which;
        }
        if (which === 'guide') paintGuide(el, currentGuideIdx(el));
        if (which === 'p25') paintP25(el, currentP25Idx(el));
        return;
      }
      if (act === 'copy-auto') {
        var done = function () {
          toast('已复制 ' + AUTO_CMD + ' — 在仓库根目录终端执行');
        };
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(AUTO_CMD).then(done).catch(done);
        } else {
          done();
        }
        return;
      }
      if (act === 'enable-pcx') {
        if (applyPcxFlag(true)) toast('已开工程材料入口 — 会诊条应立刻出现');
        paintGuide(el, currentGuideIdx(el));
        return;
      }
      if (act === 'open-pcx') {
        var PC = global.OneToneHomeProjectContext;
        if (PC && typeof PC.openDrawer === 'function') {
          try {
            PC.openDrawer();
            toast('已请求打开材料抽屉');
          } catch (err) {
            toast(String(err && err.message ? err.message : err));
          }
        } else if (PC && typeof PC.ensureDrawer === 'function') {
          var host = PC.ensureDrawer();
          if (host) host.hidden = false;
          toast(host ? '抽屉已显示' : '请先启用入口并刷新');
        } else {
          toast('Project Context 未加载或未启用');
        }
        return;
      }
      if (act === 'mark') {
        var id = t.getAttribute('data-id');
        var mark = t.getAttribute('data-mark');
        var marks = loadMarks();
        marks[id] = mark;
        saveMarks(marks);
        var nextIdx = currentGuideIdx(el) + (mark === 'passed' || mark === 'skipped' ? 1 : 0);
        if (nextIdx >= GUIDE.length) nextIdx = GUIDE.length - 1;
        paintGuide(el, nextIdx);
        return;
      }
      if (act === 'next') {
        paintGuide(el, Math.min(GUIDE.length - 1, currentGuideIdx(el) + 1));
        return;
      }
      if (act === 'prev') {
        paintGuide(el, Math.max(0, currentGuideIdx(el) - 1));
        return;
      }
      if (act === 'goto') {
        paintGuide(el, parseInt(t.getAttribute('data-idx'), 10) || 0);
        return;
      }
      if (act === 'reset-marks') {
        saveMarks({});
        paintGuide(el, 0);
        toast('已清空手动勾选');
        return;
      }

      if (act === 'p25-flag-on') {
        if (applyPcxFlag(true)) toast('已开 flag — 看主界面会诊条 / 手动添加材料');
        paintP25(el, currentP25Idx(el));
        return;
      }
      if (act === 'p25-flag-off') {
        if (applyPcxFlag(false)) toast('已关 flag — 会诊条与手动入口应消失');
        paintP25(el, currentP25Idx(el));
        return;
      }
      if (act === 'p25-reload') {
        toast('正在硬刷新…');
        hardReload();
        return;
      }
      if (act === 'p25-shot-hint') {
        toast('Win+Shift+S 截图 → 存到 ' + EVIDENCE_DIR);
        return;
      }
      if (act === 'p25-check-no-grant') {
        toast('正在自检无 grant…');
        checkNoGrant().then(function (r) {
          if (r.ok) {
            toast(
              'A′.2 自检通过' +
                (r.notes && r.notes.length ? ' · ' + r.notes.join('；') : '')
            );
          } else {
            toast('A′.2 未过：' + (r.fails || []).join('；'));
          }
          paintP25(el, currentP25Idx(el));
        });
        return;
      }
      if (act === 'p25-clear-manual-scope') {
        var cleared = clearManualScope();
        toast(cleared ? '手动 scope 已清' : '已请求清理（若抽屉仍显示已选，关抽屉再自检）');
        paintP25(el, currentP25Idx(el));
        return;
      }
      if (act === 'p25-scroll-consult') {
        toast(
          scrollConsult()
            ? '已滚到会诊条'
            : '未找到会诊条 — 请开 flag 并刷新，确认在 Agent 首页'
        );
        return;
      }
      if (act === 'p25-open-pcx') {
        var PC2 = global.OneToneHomeProjectContext;
        if (PC2 && typeof PC2.openDrawer === 'function') {
          try {
            PC2.openDrawer();
            toast('已打开材料抽屉');
          } catch (err2) {
            toast(String(err2 && err2.message ? err2.message : err2));
          }
        } else {
          toast('Project Context 未加载 — 先开 flag 并刷新');
        }
        return;
      }
      if (act === 'p25-seed-draft') {
        var ta = document.querySelector('[data-ha2-draft]');
        var Sdraft = global.OneToneHomeAgentV2Store;
        var seed = 'README.md 打开失败 error';
        if (ta) {
          ta.value = seed;
          try {
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (_) {}
        }
        if (Sdraft && Sdraft.setDraft) {
          try {
            Sdraft.setDraft(seed, { silent: true });
          } catch (_) {}
        }
        toast('草稿已填关键词 — 再点「查找材料」');
        return;
      }
      if (act === 'p25-adopt') {
        // Consult「采用」or drawer「加入材料」— same adopt gate for A′.3.
        if (
          clickSel('[data-ha2-consult-adopt]') ||
          clickSel('[data-ha2-consult-adopt="0"]') ||
          clickSel('[data-adopt="0"]') ||
          clickSel('[data-adopt]')
        ) {
          toast('已点采用/加入材料 — 再截页脚材料数');
        } else {
          toast('没有可点的候选 — 先查找或打开抽屉读出 README 预览');
        }
        return;
      }
      if (act === 'p25-consult-find') {
        scrollConsult();
        if (!clickSel('[data-ha2-consult-find]')) {
          toast('未找到按钮 — 开 flag、刷新，并确认在 Agent 首页');
          return;
        }
        // confirm() runs sync inside click; after return, probe outcome.
        setTimeout(function () {
          var C = global.OneToneHomeContextConcierge;
          var st = C && C.getPublicState ? C.getPublicState() : null;
          var n = (st && st.candidates && st.candidates.length) || 0;
          if (st && st.grant && n > 0) {
            toast('已有 ' + n + ' 条未采用候选 — 先截图，再点「采用」');
          } else if (st && st.grant) {
            toast('已授权但仍无候选 — 点「填草稿 README」后再查找一次');
          } else {
            toast('未拿到 grant（确认框是否点了确定？或项目未确认）');
          }
          paintP25(el, currentP25Idx(el));
        }, 400);
        return;
      }
      if (act === 'p25-consult-clarify') {
        scrollConsult();
        toast(
          clickSel('[data-ha2-consult-clarify]')
            ? '已点「帮我说清楚问题」'
            : '未找到澄清按钮'
        );
        return;
      }
      if (act === 'p25-consult-confirm') {
        scrollConsult();
        toast(
          clickSel('[data-ha2-consult-confirm]')
            ? '已点「确认理解」'
            : '未找到确认按钮'
        );
        return;
      }
      if (act === 'p25-consult-compile') {
        scrollConsult();
        toast(
          clickSel('[data-ha2-consult-compile]')
            ? '已点「生成检查单」'
            : '未找到生成检查单按钮'
        );
        return;
      }
      if (act === 'p25-add-mat') {
        if (
          clickSel('[data-ha2-add]') ||
          clickSel('[data-ha2-mat]') ||
          clickSel('[data-ha2-pcx]')
        ) {
          toast('已点添加/材料入口 — 请选一张截图');
        } else {
          toast('未找到添加入口 — 可用「手动添加材料」或 Soft Pad');
        }
        return;
      }
      if (act === 'p25-copy-evidence') {
        var lines = [
          'Phase2.5 A′ evidence → ' + EVIDENCE_DIR,
          '[ ] a1-flag-off.png',
          '[ ] a1-flag-on.png',
          '[ ] a2-no-grant.png',
          '[ ] a3-before-adopt.png',
          '[ ] a3-after-adopt.png',
          '[ ] a4-suggested.png',
          '[ ] a4-confirmed.png',
          '[ ] a5-image-only.png',
          'B′: cite Phase2 RC Git (no retest this round)',
          'C′: skipped'
        ].join('\n');
        var doneEv = function () {
          toast('已复制证据文件名清单');
        };
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(lines).then(doneEv).catch(doneEv);
        } else {
          doneEv();
        }
        return;
      }
      if (act === 'p25-copy-audit-line') {
        var line =
          'Phase2.5 桌面验收：passed（' +
          new Date().toISOString().slice(0, 10) +
          '；C skipped）— 仅在 A′ 截图齐备后粘贴到 docs/phase2.5-audit.md';
        var doneAu = function () {
          toast('已复制审计结论草稿（确认证据齐再粘贴）');
        };
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(line).then(doneAu).catch(doneAu);
        } else {
          doneAu();
        }
        return;
      }
      if (act === 'p25-mark') {
        var pid = t.getAttribute('data-id');
        var pmark = t.getAttribute('data-mark');
        var pmarks = loadMarksP25();
        pmarks[pid] = pmark;
        saveMarksP25(pmarks);
        var pNext = currentP25Idx(el) + (pmark === 'passed' || pmark === 'skipped' ? 1 : 0);
        if (pNext >= GUIDE_P25.length) pNext = GUIDE_P25.length - 1;
        paintP25(el, pNext);
        return;
      }
      if (act === 'p25-next') {
        paintP25(el, Math.min(GUIDE_P25.length - 1, currentP25Idx(el) + 1));
        return;
      }
      if (act === 'p25-prev') {
        paintP25(el, Math.max(0, currentP25Idx(el) - 1));
        return;
      }
      if (act === 'p25-goto') {
        paintP25(el, parseInt(t.getAttribute('data-idx'), 10) || 0);
        return;
      }
      if (act === 'p25-reset') {
        saveMarksP25({});
        paintP25(el, 0);
        toast('已清空 A′ 勾选');
      }
    });

    var drag = el.querySelector('[data-acc="drag"]');
    var ox = 0;
    var oy = 0;
    var dragging = false;
    if (!drag) return;
    drag.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      dragging = true;
      var r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      try {
        drag.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    drag.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      el.style.left = Math.max(8, e.clientX - ox) + 'px';
      el.style.top = Math.max(8, e.clientY - oy) + 'px';
    });
    drag.addEventListener('pointerup', function () {
      dragging = false;
    });
  }

  function show() {
    var el = ensure();
    el.hidden = false;
    el.classList.remove('is-collapsed');
    setFlag(true);
    paintP25(el);
    paintGuide(el);
    return el;
  }

  function hide() {
    var el = document.getElementById(ROOT_ID);
    if (el) el.hidden = true;
  }

  function toggle() {
    var el = document.getElementById(ROOT_ID);
    if (el && !el.hidden) {
      hide();
      setFlag(false);
      return false;
    }
    show();
    return true;
  }

  function boot() {
    var stale = document.getElementById(ROOT_ID);
    if (stale && stale.getAttribute('data-acc-ver') !== BIND_VER) {
      show();
      return;
    }
    if (flagOn()) show();
  }

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        toggle();
      }
    },
    true
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.OneToneAcceptanceFloat = {
    show: show,
    hide: hide,
    toggle: toggle,
    data: DATA,
    guide: GUIDE,
    guideP25: GUIDE_P25,
    FLAG: FLAG,
    MARKS_KEY: MARKS_KEY,
    MARKS_P25_KEY: MARKS_P25_KEY,
    AUTO_CMD: AUTO_CMD,
    EVIDENCE_DIR: EVIDENCE_DIR
  };
})(typeof window !== 'undefined' ? window : globalThis);
