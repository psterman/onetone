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
    // Codex-style aliases: chat↔think, work↔edit. readonly kept for old storage only.
    if (m === 'chat' || m === 'dialogue' || m === 'talk') return 'think';
    if (m === 'work' || m === 'agent' || m === 'edit' || m === 'write' || m === 'code') {
      return 'edit';
    }
    if (m === 'readonly' || m === 'read' || m === 'read_only') return 'readonly';
    return 'think';
  }

  /**
   * Goals that clearly want workspace writes / desktop export — not chat-only.
   * Used to auto-promote 对话→工作 so "更新 readme2 发到桌面" does not silently chat.
   */
  function looksLikeWorkspaceEditGoal(text) {
    var s = String(text || '').trim();
    if (!s) return false;
    return /readme2?|\.md\b|放到桌面|发到桌面|复制到桌面|导出到桌面|export.*desktop|写(入|到|一个|个).{0,12}(文件|文档|readme)|更新.{0,16}(文档|文件|readme)|改(代码|文件)|创建.{0,12}(文件|文档)|apply_patch|propose_changes|export_to_desktop/i.test(
      s
    );
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
      agent_task: projectAgentTask(input),
      // implemented always; available/ready depends on Soft Pad keys + callPolicy (see projectTaskOrganize).
      task_organize: projectTaskOrganize(input),
      read_project: projectReadProject(input),
      project_passport: projectContextCap(input, 'passport'),
      project_evidence: projectContextCap(input, 'evidence'),
      project_search: projectContextCap(input, 'search'),
      project_diff_summary: projectContextCap(input, 'diff_summary'),
      project_diff_excerpt: projectContextCap(input, 'diff_excerpt'),
      write_project: projectWriteProject(input),
      run_command: projectRunCommand(input),
      approval_execute: projectApprovalExecute(input),
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

  /**
   * Internal Agent Task Runtime (event-sourced tool loop) vs external Agent Center control.
   * Pass agentTaskRuntime: true when ATR IPC is available / flag on.
   */
  function projectAgentTask(input) {
    input = input || {};
    if (input.agentTaskRuntime === true) {
      var atr = entry('partial', '单 Agent 受控工具循环（默认写盘需批准；非多 Agent）', [
        'cmd_agent_task_start',
        'cmd_agent_task_status',
        'cmd_agent_task_approve_patch',
        'cmd_agent_task_cancel',
        'cmd_agent_task_ready'
      ]);
      atr.implemented = true;
      atr.ready = true;
      return atr;
    }
    return entry('partial', '可聚焦 / 续跑 / 中断外部 Agent；内置 Task Runtime 默认未投影', [
      'cmd_agent_center_snapshot',
      'cmd_agent_center_action'
    ]);
  }

  function projectWriteProject(input) {
    input = input || {};
    if (input.agentTaskRuntime === true && input.agentTaskGrant === true) {
      var w = entry('partial', '仅 Agent Task grant 内写盘（write_with_approval）', [
        'cmd_agent_task_approve_patch',
        'cmd_agent_task_start'
      ]);
      w.implemented = true;
      w.ready = true;
      return w;
    }
    if (input.agentTaskRuntime === true) {
      var p = entry('partial', '写盘管道已实现；需启动任务并授予工作区后可用', [
        'cmd_agent_task_start'
      ]);
      p.implemented = true;
      p.ready = false;
      return p;
    }
    return entry('not_wired', '首页尚未接入文件修改管道', []);
  }

  function projectRunCommand(input) {
    input = input || {};
    if (input.agentTaskRuntime === true && input.agentTaskGrant === true) {
      var r = entry('partial', '仅允许 check_id 白名单检查（非任意 shell）', [
        'cmd_agent_task_start'
      ]);
      r.implemented = true;
      r.ready = true;
      return r;
    }
    if (input.agentTaskRuntime === true) {
      var p = entry('partial', '结构化检查已实现；需任务 grant', ['cmd_agent_task_start']);
      p.implemented = true;
      p.ready = false;
      return p;
    }
    return entry('not_wired', '无带权限模型的本地命令沙箱', []);
  }

  function projectApprovalExecute(input) {
    input = input || {};
    if (input.agentTaskRuntime === true) {
      var a = entry('partial', 'apply_patch 审批 token（绑定 task+patch+file hash+version）', [
        'cmd_agent_task_approve_patch'
      ]);
      a.implemented = true;
      a.ready = true;
      return a;
    }
    return entry('not_wired', '首页尚未接入授权执行', []);
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
    var wp = projectWriteProject(input || {});
    if (wp.implemented) {
      out.write_project = entry(wp.status, wp.reason, wp.ipcHints);
      out.write_project.implemented = true;
      out.write_project.ready = !!wp.ready;
    }
    var rc = projectRunCommand(input || {});
    if (rc.implemented) {
      out.run_safe_command = entry(rc.status, rc.reason, rc.ipcHints);
      out.run_safe_command.implemented = true;
      out.run_safe_command.ready = !!rc.ready;
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
      // ATR path: implemented write + approval (flag via agentTaskRuntime projection).
      // Do not require .available — partial caps keep available=false by design.
      var Atr = typeof global !== 'undefined' ? global.OneToneHomeAgentTask : null;
      if (Atr && typeof Atr.editModeSelectable === 'function') {
        modeEffective = Atr.editModeSelectable(Caps);
      } else {
        modeEffective = !!(
          Caps.write_project &&
          Caps.write_project.implemented &&
          Caps.approval_execute &&
          Caps.approval_execute.implemented
        );
      }
      modeReason = modeEffective
        ? ''
        : '修改代码需开启 Agent Task Runtime，并具备写盘与审批管道';
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
   * Keep short — models echo long role text into the user-facing reply.
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
      'OneTone 对话模式：按用户目标作答；少改写、少说教，信息尽量原样传递。',
      '鼓励结构化呈现：列表、表格、步骤、短原型草图、Mermaid（flowchart / sequence）。',
      '本机对话不能读写磁盘；需要改文件时一句提示可切「工作」模式即可。',
      '仅当用户明确要求交接/导出给其他 Agent 时，再给可粘贴的短交接说明。',
      '无文件正文勿编造路径/diff；有截图但无像素时仍按文字目标给方案，勿只回「无 OCR」。'
    ];
    if (path) {
      lines.push('项目：' + (name ? name + ' · ' : '') + path);
    } else {
      lines.push('未选定项目；缺仓库细节时先点明缺什么。');
    }
    if (work) lines.push('工作线索：' + work);
    if (mats.length) lines.push('已附材料名：' + mats.join('、'));
    return lines.join('\n');
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inlineFmtEscaped(escaped) {
    return String(escaped || '')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  /**
   * Presentation-only: markdown-ish → HTML (lists / headings / tables / fenced code+mermaid).
   * Does not rewrite wording — mechanical layout for 对话预览.
   */
  function formatChatBodyHtml(text) {
    var src = String(text || '');
    if (!src) return '';
    var parts = [];
    var re = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
    var last = 0;
    var m;
    while ((m = re.exec(src))) {
      if (m.index > last) parts.push({ kind: 'md', text: src.slice(last, m.index) });
      parts.push({
        kind: 'fence',
        lang: String(m[1] || '').toLowerCase(),
        text: m[2] || ''
      });
      last = m.index + m[0].length;
    }
    if (last < src.length) parts.push({ kind: 'md', text: src.slice(last) });
    if (!parts.length) parts.push({ kind: 'md', text: src });

    function flushTable(rows, out) {
      if (!rows.length) return;
      out.push('<table class="ha2-md-table"><tbody>');
      var r;
      for (r = 0; r < rows.length; r++) {
        var cells = rows[r];
        var tag = r === 0 ? 'th' : 'td';
        out.push(
          '<tr>' +
            cells
              .map(function (c) {
                return '<' + tag + '>' + inlineFmtEscaped(escHtml(c)) + '</' + tag + '>';
              })
              .join('') +
            '</tr>'
        );
      }
      out.push('</tbody></table>');
      rows.length = 0;
    }

    function renderMd(chunk) {
      var lines = String(chunk || '').split(/\r?\n/);
      var out = [];
      var inList = false;
      var tableRows = [];
      var i;
      for (i = 0; i <= lines.length; i++) {
        var raw = i < lines.length ? lines[i] : '';
        var table = i < lines.length ? raw.match(/^\s*\|(.+)\|\s*$/) : null;
        var sep = i < lines.length && /^\s*\|?\s*:?-{3,}.*\|/.test(raw);
        if (table && !sep) {
          if (inList) {
            out.push('</ul>');
            inList = false;
          }
          tableRows.push(
            table[1].split('|').map(function (c) {
              return String(c || '').trim();
            })
          );
          continue;
        }
        if (tableRows.length) flushTable(tableRows, out);
        if (sep) continue;
        var bullet = i < lines.length ? raw.match(/^\s*[-•*]\s+(.*)$/) : null;
        if (bullet) {
          if (!inList) {
            out.push('<ul>');
            inList = true;
          }
          out.push('<li>' + inlineFmtEscaped(escHtml(bullet[1])) + '</li>');
          continue;
        }
        if (inList) {
          out.push('</ul>');
          inList = false;
        }
        if (i === lines.length) break;
        if (!raw.trim()) continue;
        var head = raw.match(/^\s*#{1,4}\s+(.*)$/);
        if (head) {
          out.push('<div class="ha2-md-h">' + inlineFmtEscaped(escHtml(head[1])) + '</div>');
          continue;
        }
        out.push('<p>' + inlineFmtEscaped(escHtml(raw)) + '</p>');
      }
      return out.join('');
    }

    return parts
      .map(function (p) {
        if (p.kind === 'fence') {
          var cls =
            p.lang === 'mermaid' ? 'ha2-md-mermaid' : 'ha2-md-code';
          var label = p.lang ? '<span class="ha2-md-lang">' + escHtml(p.lang) + '</span>' : '';
          return (
            '<pre class="' +
            cls +
            '">' +
            label +
            escHtml(p.text.replace(/\s+$/, '')) +
            '</pre>'
          );
        }
        return renderMd(p.text);
      })
      .join('');
  }

  /**
   * Collapse Phase2.5 triage markdown into a short local-chat user turn.
   * Full checklist is for Cursor handoff; models echo it section-by-section if sent raw.
   */
  function compactLocalChatUserText(raw) {
    raw = String(raw || '').trim();
    if (!raw) return '';
    var looksTriage =
      /^##\s*目标/m.test(raw) ||
      /##\s*已确认证据/.test(raw) ||
      /##\s*请求/.test(raw) ||
      /##\s*建议检查/.test(raw) ||
      /##\s*给 Cursor/.test(raw) ||
      /##\s*验收标准/.test(raw);
    if (!looksTriage) return raw;

    function sectionBody(titleRe) {
      var m = raw.match(titleRe);
      return m ? String(m[1] || '').trim() : '';
    }
    function firstLine(block) {
      var line = String(block || '')
        .split(/\n/)
        .map(function (l) {
          return l.replace(/^\s*[-*]\s*/, '').trim();
        })
        .filter(Boolean)[0];
      return line || '';
    }
    var emptyish = function (s) {
      s = String(s || '').trim();
      return !s || s === '（无）' || s === '(无)' || s === '（待用户确认）';
    };

    var goal = firstLine(sectionBody(/##\s*目标\s*\n+([\s\S]*?)(?=\n##\s|$)/));
    var observed = firstLine(sectionBody(/##\s*用户观察\s*\n+([\s\S]*?)(?=\n##\s|$)/));
    var mats = [];
    var ev = sectionBody(/##\s*已确认证据\s*\n+([\s\S]*?)(?=\n##\s|$)/);
    if (ev) {
      ev.replace(/`([^`]+)`/g, function (_, p) {
        if (p && mats.indexOf(p) < 0) mats.push(p);
      });
    }

    var bits = [];
    if (!emptyish(goal)) bits.push(goal);
    if (!emptyish(observed) && observed !== goal) bits.push('现象：' + observed);
    if (mats.length) bits.push('材料：' + mats.slice(0, 4).join('、'));
    if (!bits.length) bits.push(raw.slice(0, 240));
    return bits.join('\n');
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
    looksLikeWorkspaceEditGoal: looksLikeWorkspaceEditGoal,
    isWaitingForUserStatus: isWaitingForUserStatus,
    projectRole: projectRole,
    projectTaskOrganize: projectTaskOrganize,
    projectCapabilities: projectCapabilities,
    projectPermissions: projectPermissions,
    projectSession: projectSession,
    resolveHomeTimelineWorkspace: resolveHomeTimelineWorkspace,
    buildLocalChatSystemPrompt: buildLocalChatSystemPrompt,
    formatChatBodyHtml: formatChatBodyHtml,
    compactLocalChatUserText: compactLocalChatUserText,
    closedCapabilities: closedCapabilities,
    closedPermissions: closedPermissions
  };
})(typeof window !== 'undefined' ? window : globalThis);
