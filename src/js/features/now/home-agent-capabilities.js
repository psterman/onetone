/**
 * OneToneHomeAgentCapabilities — pure home-session capability / permission projection.
 * No localStorage, no IPC, no polling. Callers pass plain inputs.
 */
(function (global) {
  'use strict';

  var CAP_IDS = [
    'text_chat',
    'agent_task',
    'task_organize',
    'read_project',
    'project_passport',
    'project_evidence',
    'project_search',
    'project_diff_summary',
    'project_diff_excerpt',
    'write_project',
    'run_command',
    'approval_execute',
    'diff',
    'rollback'
  ];

  var PERM_IDS = [
    'read_project',
    'write_project',
    'run_safe_command',
    'run_risky_command',
    'network_access',
    'external_path_access'
  ];

  function entry(status, reason, ipcHints) {
    var st = status === 'available' || status === 'partial' ? status : 'not_wired';
    return {
      status: st,
      available: st === 'available',
      reason: reason != null ? String(reason) : '',
      ipcHints: Array.isArray(ipcHints) ? ipcHints.slice() : []
    };
  }

  function normalizeWbSendMode(mode) {
    return mode === 'desktop' ? 'desktop' : 'local';
  }

  /** Real wait/needs status only — ignore phantom approval.approve actions. */
  function isWaitingForUserStatus(status) {
    return /needs|waiting|approval|needsinput/.test(String(status || ''));
  }

  function normalizeWorkMode(mode) {
    var m = String(mode || 'think').toLowerCase();
    if (m === 'readonly' || m === 'read' || m === 'read_only') return 'readonly';
    if (m === 'edit' || m === 'write' || m === 'code') return 'edit';
    return 'think';
  }

  /**
   * @param {{ selectedKind?: string|null, wbSendMode?: string }} input
   * @returns {'think'|'code'}
   */
  /**
   * task_organize: implemented=true always; available only when runtime ready.
   * Callers may pass assistReady: { ready, reason, implemented }.
   */
  function projectTaskOrganize(input) {
    input = input || {};
    var readyInfo = input.assistReady || null;
    var implemented = !readyInfo || readyInfo.implemented !== false;
    if (!implemented) {
      return entry('not_wired', 'task_organize 未实现', []);
    }
    if (readyInfo && readyInfo.ready) {
      var e = entry('available', '使用已纳入材料生成可编辑任务草稿', [
        'cmd_assist_run',
        'cmd_assist_cancel'
      ]);
      e.implemented = true;
      e.ready = true;
      return e;
    }
    var reason =
      (readyInfo && readyInfo.reason) ||
      '需 Soft Pad 密钥，且 free_only 仅接受零价模型（或用户开启允许计量）';
    var partial = entry('partial', reason, ['cmd_assist_run', 'cmd_assist_cancel']);
    partial.implemented = true;
    partial.ready = false;
    return partial;
  }

  function projectRole(input) {
    input = input || {};
    var kind = String(input.selectedKind || '').toLowerCase();
    var wbMode = normalizeWbSendMode(input.wbSendMode);
    if (kind === 'workbuddy' && wbMode === 'local') return 'think';
    return 'code';
  }

  /**
   * Home-surface capabilities (not Soft Pad / TM private availability).
   * @param {{ selectedKind?: string|null, wbSendMode?: string }} input
   */
  function projectCapabilities(input) {
    input = input || {};
    var kind = String(input.selectedKind || '').toLowerCase();
    var wbLocal = kind === 'workbuddy' && normalizeWbSendMode(input.wbSendMode) === 'local';

    var caps = {
      text_chat: wbLocal
        ? entry('available', 'WorkBuddy 本机文本对话', [
            'cmd_workbuddy_local_chat',
            'workbuddy_local_llm'
          ])
        : entry(
            'not_wired',
            kind === 'workbuddy'
              ? '桌面投递不是本机文本对话'
              : '本机文本对话仅 WorkBuddy 本机模式可用',
            []
          ),
      agent_task: entry('partial', '可聚焦 / 续跑 / 中断外部 Agent，非沙箱任务', [
        'cmd_agent_center_snapshot',
        'cmd_agent_center_action'
      ]),
      // implemented always; available/ready depends on Soft Pad keys + callPolicy (see projectTaskOrganize).
      task_organize: projectTaskOrganize(input),
      read_project: projectReadProject(input),
      project_passport: projectContextCap(input, 'passport'),
      project_evidence: projectContextCap(input, 'evidence'),
      project_search: projectContextCap(input, 'search'),
      project_diff_summary: projectContextCap(input, 'diff_summary'),
      project_diff_excerpt: projectContextCap(input, 'diff_excerpt'),
      write_project: entry('not_wired', '首页尚未接入文件修改管道', []),
      run_command: entry('not_wired', '无带权限模型的本地命令沙箱', []),
      approval_execute: entry('not_wired', '首页尚未接入授权执行', []),
      // TM has real diff/restore; home only opens project timeline (no session-bound diff).
      diff: entry('partial', '仅支持打开项目时间线（会话 Git patch 见 project_diff_*）', [
        'cmd_tm_diff_summary',
        'OneToneAgentNavTarget'
      ]),
      rollback: entry('partial', '仅支持打开项目时间线（恢复在 Time Machine）', [
        'cmd_tm_restore',
        'cmd_tm_undo_restore'
      ])
    };
    return caps;
  }

  function projectContextFlagOn(input) {
    // Pure projection — callers pass projectContextEnabled; never touch localStorage/IPC here.
    return !!(input && input.projectContextEnabled === true);
  }

  /** Selective read only — never implies write/run/approval or full-repo agent mode. */
  function projectReadProject(input) {
    input = input || {};
    if (!projectContextFlagOn(input)) {
      // Flag default off → not_wired for session projection; IPC may still exist in binary.
      var off = entry(
        'not_wired',
        '受限选择性读取已实现但默认关闭（传入 projectContextEnabled 或开启 flag 后可用）',
        []
      );
      off.implemented = true;
      off.ready = false;
      off.scopeGranted = false;
      return off;
    }
    var on = entry('partial', '受限选择性读取（用户确认后加入材料，非全库分析）', [
      'cmd_project_context_open',
      'cmd_project_context_query',
      'cmd_project_context_close',
      'cmd_project_context_cancel'
    ]);
    on.implemented = true;
    on.ready = true;
    on.scopeGranted = !!input.scopeGranted;
    return on;
  }

  function projectContextCap(input, which) {
    input = input || {};
    var base = projectReadProject(input);
    var reasons = {
      passport: '项目名片（根目录白名单 + 用户点选规则）',
      evidence: '选定文件片段',
      search: '有限字面搜索后选入',
      diff_summary: 'Git 变更文件列表（staged/unstaged）',
      diff_excerpt: '用户选定文件的有限 patch'
    };
    if (!base.ready) {
      var off = entry('not_wired', (reasons[which] || '工程材料') + '（需开启工程材料入口）', []);
      off.implemented = true;
      off.ready = false;
      off.scopeGranted = false;
      return off;
    }
    var e = entry('partial', reasons[which] || '工程材料', base.ipcHints);
    e.implemented = true;
    e.ready = true;
    e.scopeGranted = !!base.scopeGranted;
    return e;
  }

  /**
   * Permission gates — all not_wired until real IPC exists.
   * Shape matches capabilities; available always derived from status.
   */
  function projectPermissions(input) {
    var reason = '首页权限闸尚未接入后端';
    var out = {};
    for (var i = 0; i < PERM_IDS.length; i++) {
      out[PERM_IDS[i]] = entry('not_wired', reason, []);
    }
    // Selective read permission tracks flag — never elevates write/run.
    // Default (flag off): stay not_wired so session projection does not fake a grant.
    var rp = projectReadProject(input || {});
    if (rp.ready) {
      out.read_project = entry('partial', rp.reason, rp.ipcHints);
      out.read_project.implemented = true;
      out.read_project.ready = true;
      out.read_project.scopeGranted = !!rp.scopeGranted;
    } else if (rp.implemented) {
      out.read_project.implemented = true;
      out.read_project.ready = false;
    }
    return out;
  }

  /**
   * @param {{
   *   selectedKind?: string|null,
   *   wbSendMode?: string,
   *   workMode?: string,
   *   projectPath?: string|null,
   *   agentId?: string|null,
   *   handoffId?: string|null
   * }} input
   */
  function projectSession(input) {
    input = input || {};
    var Caps = projectCapabilities(input);
    var Perms = projectPermissions(input);
    var role = projectRole(input);
    var mode = normalizeWorkMode(input.workMode);
    var modeEffective = false;
    var modeReason = '';
    if (mode === 'think') {
      modeEffective = !!(Caps.text_chat && Caps.text_chat.available);
      modeReason = modeEffective
        ? ''
        : (Caps.text_chat && Caps.text_chat.reason) || '思考模式需本机文本对话';
    } else if (mode === 'readonly') {
      modeEffective = !!(Caps.read_project && Caps.read_project.available);
      modeReason =
        (Caps.read_project && Caps.read_project.reason) || '只读分析暂未接入';
    } else {
      modeEffective = !!(
        Caps.write_project &&
        Caps.write_project.available &&
        Caps.approval_execute &&
        Caps.approval_execute.available
      );
      modeReason = modeEffective
        ? ''
        : '修改代码需文件修改、授权执行与 Diff；当前暂未接入';
    }

    return {
      sessionId: null,
      externalSessionId: null,
      handoffId: input.handoffId != null ? input.handoffId : null,
      title: '',
      role: role,
      mode: mode,
      modeEffective: modeEffective,
      modeReason: modeReason,
      projectPath: input.projectPath != null ? input.projectPath : null,
      agentKind: input.selectedKind != null ? input.selectedKind : null,
      agentId: input.agentId != null ? input.agentId : null,
      capabilities: Caps,
      permissions: Perms,
      diffRef: null,
      execution: 'idle'
    };
  }

  /**
   * Home → Time Machine workspace: prefer confirmed home project over TM current.
   * @param {{ projectPath?: string|null, tmWorkspace?: string|null }} input
   */
  function resolveHomeTimelineWorkspace(input) {
    input = input || {};
    var home = String(input.projectPath || '').trim();
    if (home) return home;
    var tm = String(input.tmWorkspace || '').trim();
    return tm || null;
  }

  /**
   * System prompt for WorkBuddy in-app local chat. Honest: path context only, no fake FS.
   * @param {{
   *   projectPath?: string|null,
   *   projectName?: string|null,
   *   workTitle?: string|null,
   *   materialNames?: string[]|null,
   *   materialTitles?: string[]|null
   * }} input
   */
  function buildLocalChatSystemPrompt(input) {
    input = input || {};
    var path = String(input.projectPath || '').trim();
    var name = String(input.projectName || '').trim();
    var work = String(input.workTitle || '').trim();
    var rawMats = Array.isArray(input.materialNames)
      ? input.materialNames
      : Array.isArray(input.materialTitles)
        ? input.materialTitles
        : [];
    var mats = rawMats
      .map(function (m) {
        return String(m || '').trim();
      })
      .filter(Boolean)
      .slice(0, 8);
    if (!name && path) {
      var parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
      name = parts[parts.length - 1] || '';
    }
    var lines = [
      '你是 OneTone 首页的 WorkBuddy 本机讨论助手（思考/方案，不打开桌面 WorkBuddy，也不改仓库）。',
      '请在用户当前工作区语境下回答；没有文件内容时不要编造路径、diff 或命令输出。'
    ];
    if (path) {
      lines.push('当前项目路径：' + path);
      if (name) lines.push('项目名：' + name);
    } else {
      lines.push('当前未选定项目路径；若问题依赖仓库细节，请先说明缺少项目语境。');
    }
    if (work) lines.push('近期工作线索：' + work);
    if (mats.length) lines.push('已附材料（仅名称，无正文）：' + mats.join('、'));
    lines.push('你不能读写磁盘；需要改代码或查文件时，建议用户交接给 Cursor / 桌面模式。');
    return lines.join('\n');
  }

  /** Fail-closed empty projection when module consumers call without Caps loaded. */
  function closedCapabilities() {
    var out = {};
    for (var i = 0; i < CAP_IDS.length; i++) {
      out[CAP_IDS[i]] = entry('not_wired', '能力投影模块未加载', []);
    }
    return out;
  }

  function closedPermissions() {
    var out = {};
    for (var i = 0; i < PERM_IDS.length; i++) {
      out[PERM_IDS[i]] = entry('not_wired', '能力投影模块未加载', []);
    }
    return out;
  }

  global.OneToneHomeAgentCapabilities = {
    CAP_IDS: CAP_IDS.slice(),
    PERM_IDS: PERM_IDS.slice(),
    entry: entry,
    normalizeWbSendMode: normalizeWbSendMode,
    normalizeWorkMode: normalizeWorkMode,
    isWaitingForUserStatus: isWaitingForUserStatus,
    projectRole: projectRole,
    projectTaskOrganize: projectTaskOrganize,
    projectCapabilities: projectCapabilities,
    projectPermissions: projectPermissions,
    projectSession: projectSession,
    resolveHomeTimelineWorkspace: resolveHomeTimelineWorkspace,
    buildLocalChatSystemPrompt: buildLocalChatSystemPrompt,
    closedCapabilities: closedCapabilities,
    closedPermissions: closedPermissions
  };
})(typeof window !== 'undefined' ? window : globalThis);
