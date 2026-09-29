(function (global) {
  var core = [
    { word: '说话', act: '开听写', sub: '需输入框', need: true, say: '说话、麦克风' },
    { word: '发送', act: '提交本轮', sub: '需输入框', need: true, say: '发送' },
    { word: '取消', act: '退出收听', sub: '随时可用', need: false, say: '取消、退出' }
  ];

  var added = [
    {
      word: '继续', via: 'is-soft', viaLabel: 'Soft',
      act: 'Soft 槽 · 需输入框', say: '继续', need: true
    },
    {
      word: '撤销', via: 'is-bind', viaLabel: '绑定',
      act: '语音绑定 · Agent', say: '撤销', need: false
    }
  ];

  /** Full add catalog — richer than production Soft-only pair */
  var catalog = [
    {
      id: 'soft:continue', kind: 'soft', name: '继续', say: '继续',
      desc: '让 Agent 接着干', need: true, viaClass: 'is-soft', viaLabel: 'Soft',
      scene: 'agent', inList: true
    },
    {
      id: 'soft:newThread', kind: 'soft', name: '新建对话', say: '新会话、新建',
      desc: '开一条新 Agent 线程', need: true, viaClass: 'is-soft', viaLabel: 'Soft',
      scene: 'agent', inList: false
    },
    {
      id: 'prompt:review', kind: 'prompt', name: '代码审查', say: '审查',
      desc: '注入审查模板', need: true, viaClass: 'is-prompt', viaLabel: '注入',
      scene: 'dictation', inList: false
    },
    {
      id: 'prompt:explain', kind: 'prompt', name: '解释这段', say: '解释',
      desc: '注入解释模板', need: true, viaClass: 'is-prompt', viaLabel: '注入',
      scene: 'dictation', inList: false
    },
    {
      id: 'prompt:fix', kind: 'prompt', name: '修类型错误', say: '修类型',
      desc: '注入修 TS 模板', need: true, viaClass: 'is-prompt', viaLabel: '注入',
      scene: 'dictation', inList: false
    },
    {
      id: 'bind:undo', kind: 'bind', name: '撤销', say: '撤销',
      desc: '撤销上一步 Agent 改动', need: false, viaClass: 'is-bind', viaLabel: '绑定',
      scene: 'agent', inList: true
    },
    {
      id: 'bind:accept', kind: 'bind', name: '接受改动', say: '接受',
      desc: '接受当前 diff', need: false, viaClass: 'is-bind', viaLabel: '绑定',
      scene: 'agent', inList: false
    },
    {
      id: 'bind:reject', kind: 'bind', name: '拒绝改动', say: '拒绝',
      desc: '拒绝当前 diff', need: false, viaClass: 'is-bind', viaLabel: '绑定',
      scene: 'agent', inList: false
    },
    {
      id: 'bind:stop', kind: 'bind', name: '停下生成', say: '停下',
      desc: '中断正在跑的 Agent', need: false, viaClass: 'is-bind', viaLabel: '绑定',
      scene: 'agent', inList: false
    }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rowHtml(r, kind) {
    if (kind === 'core') {
      return (
        '<div class="core-row">' +
        '<div class="core-word">' + esc(r.word) + '</div>' +
        '<div class="core-arrow" aria-hidden="true">→</div>' +
        '<div class="core-act">' + esc(r.act) +
        '<small>' + esc(r.sub) +
        (r.need ? '<span class="badge">前置</span>' : '') +
        '</small></div>' +
        '<input type="text" value="' + esc(r.say) + '" />' +
        '<button type="button" class="tog is-on" aria-pressed="true"></button></div>'
      );
    }
    return (
      '<div class="extra-row">' +
      '<div class="via ' + esc(r.via) + '">' + esc(r.viaLabel) + '</div>' +
      '<div class="extra-name">' + esc(r.word) +
      '<span>' + esc(r.act) + '</span></div>' +
      '<input type="text" value="' + esc(r.say) + '" />' +
      '<button type="button" class="tog is-on" aria-pressed="true"></button></div>'
    );
  }

  global.ORAL_PROTO = {
    core: core,
    added: added,
    catalog: catalog,
    esc: esc,
    rowHtml: rowHtml
  };
})(window);
