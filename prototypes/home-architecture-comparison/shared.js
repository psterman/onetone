(function (global) {
  'use strict';

  var runtime = (global.OneToneHomePrototype = global.OneToneHomePrototype || {});
  runtime.variants = runtime.variants || [];

  var base = {
    app: { name: 'Cursor', detail: 'home-focus-view.js' },
    project: { known: true, name: 'OneTone', path: 'E:\\voice-pilot', branch: 'master' },
    provider: { id: 'cursor', name: 'Cursor', status: 'connected' },
    source: { quality: 'local', label: 'Cursor 本地活动', freshness: '刚刚更新' },
    work: {
      title: '重构 OneTone 首页信息架构',
      summary: '已完成通道能力盘点，下一步比较四版首页原型。',
      checkpoint: '今天 14:32',
      progress: '2 / 4'
    }
  };

  var states = {
    idle: {
      status: { tone: 'ready', label: '可以开始' },
      work: { title: '准备开始一项新工作', summary: '当前项目已识别，可以直接说出你想做什么。', checkpoint: '', progress: '' },
      primary: { id: 'start-dictation', label: '开始说话' }
    },
    resume: {
      status: { tone: 'resume', label: '可继续' },
      primary: { id: 'resume-session', label: '继续上次工作' }
    },
    running: {
      status: { tone: 'running', label: 'Cursor 正在工作' },
      work: { title: '正在整理首页信息架构', summary: '正在比较通道能力、数据可信度与首页动作优先级。', checkpoint: '刚刚', progress: '第 3 步' },
      primary: { id: 'focus-agent', label: '回到 Cursor' }
    },
    waiting: {
      provider: { id: 'claude-code', name: 'Claude Code', status: 'waiting_approval' },
      status: { tone: 'attention', label: '需要你确认' },
      work: { title: '是否采用新的首页导航结构？', summary: '将历史、项目记忆和连接信息收进上下文抽屉，首页只保留当前工作。', checkpoint: '1 分钟前', progress: '等待批准' },
      source: { quality: 'native', label: 'Claude Hook', freshness: '实时' },
      primary: { id: 'agent.approve', label: '批准并继续' }
    },
    dictating: {
      status: { tone: 'listening', label: '正在听你说' },
      work: { title: '把首页改成更适合 vibe coding 的续作台', summary: '松开后可检查文字，再发送给当前 Agent。', checkpoint: '00:08', progress: '听写中' },
      source: { quality: 'live', label: 'OneTone 语音', freshness: '实时' },
      primary: { id: 'commit-dictation', label: '完成并发送' }
    },
    degraded: {
      project: { known: false, name: '未确认项目', path: '', branch: '' },
      provider: { id: 'cursor', name: 'Cursor', status: 'unavailable' },
      status: { tone: 'degraded', label: '数据需要修复' },
      source: { quality: 'unavailable', label: '本地活动读取已关闭', freshness: '最后更新于 18 分钟前' },
      work: { title: '暂时无法确认你正在做什么', summary: 'OneTone 不会用猜测填充首页。恢复本地读取或手动选择项目后再继续。', checkpoint: '', progress: '' },
      primary: { id: 'repair-source', label: '恢复数据连接' }
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function merge(target, source) {
    Object.keys(source || {}).forEach(function (key) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = merge(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    });
    return target;
  }

  runtime.modelFor = function (state) {
    var key = states[state] ? state : 'resume';
    return merge(merge({ state: key }, clone(base)), clone(states[key]));
  };

  runtime.reduceIntent = function (context, intent) {
    var next = { state: context.state, variant: context.variant, effect: 'none' };
    if (intent && intent.type === 'primary') {
      if (context.state === 'resume') return { state: 'running', variant: context.variant, effect: 'resume-session' };
      if (context.state === 'idle') return { state: 'dictating', variant: context.variant, effect: 'start-dictation' };
      if (context.state === 'waiting') return { state: 'running', variant: context.variant, effect: 'approve-request' };
      if (context.state === 'dictating') return { state: 'running', variant: context.variant, effect: 'send-dictation' };
      if (context.state === 'degraded') return { state: 'resume', variant: context.variant, effect: 'repair-source' };
      if (context.state === 'running') return { state: 'running', variant: context.variant, effect: 'focus-agent' };
    }
    return next;
  };

  runtime.channelIntent = function (context) {
    if (context && context.actionId === 'agent.approve' && context.channel === 'camera') {
      return {
        allowed: false,
        confirmation: 'cross-channel',
        message: '摄像头只能发起批准请求，请再用按键、语音或 Soft Pad 确认。'
      };
    }
    return { allowed: true, confirmation: 'none', message: '动作可以执行。' };
  };

  runtime.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  runtime.qualityLabel = function (quality) {
    return ({
      native: '官方事件',
      live: '实时',
      local: '本地读取',
      inferred: '推断',
      cached: '缓存',
      unavailable: '不可用'
    })[quality] || '未知来源';
  };

  runtime.statusCopy = function (model) {
    var map = {
      idle: { short: '待命', long: '项目已就绪，等你开始' },
      resume: { short: '可继续', long: '找到一个可恢复的工作位置' },
      running: { short: '工作中', long: model.provider.name + ' 正在处理任务' },
      waiting: { short: '等你确认', long: model.provider.name + ' 需要你的决定' },
      dictating: { short: '听写中', long: 'OneTone 正在听你说' },
      degraded: { short: '数据不完整', long: '没有足够依据确认当前工作' }
    };
    return map[model.state] || map.resume;
  };

  runtime.channelName = function (channel) {
    return ({ keys: '按键', voice: '语音', softpad: 'Soft Pad', camera: '摄像头' })[channel] || channel;
  };

  runtime.icon = function (name) {
    var body = ({
      home: '<path d="M4 11.2 12 4l8 7.2v8.3a.5.5 0 0 1-.5.5h-5v-6h-5v6h-5a.5.5 0 0 1-.5-.5z"/>',
      habits: '<path d="M7 4h10v5H7zM5 11h14v9H5z"/><path d="M9 14h6M9 17h4"/>',
      actions: '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/>',
      agent: '<rect x="4" y="6" width="16" height="12" rx="4"/><path d="M9 11h.01M15 11h.01M9 15h6M12 3v3"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6.2L14.7 4h-5.4L9 6.2a7 7 0 0 0-1.5.9l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.5.9l.3 2.2h5.4l.3-2.2a7 7 0 0 0 1.5-.9l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>',
      mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>',
      keys: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 14h2M11 14h6"/>',
      pad: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8 7h3v3H8zM13 7h3v3h-3zM8 12h3v3H8zM13 12h3v3h-3z"/>',
      camera: '<rect x="3" y="6" width="14" height="12" rx="3"/><path d="m17 10 4-2v8l-4-2z"/>',
      arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
      chevron: '<path d="m9 6 6 6-6 6"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      folder: '<path d="M3 7h7l2 2h9v10H3z"/><path d="M3 7V5h7l2 2"/>',
      branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M8 15c5 0 8-2 8-5"/>',
      activity: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>',
      warning: '<path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5M12 17h.01"/>',
      link: '<path d="M10 14 8.5 15.5a4 4 0 0 1-5.7-5.7L6 6.6a4 4 0 0 1 5.7 0M14 10l1.5-1.5a4 4 0 0 1 5.7 5.7L18 17.4a4 4 0 0 1-5.7 0M8.5 12h7"/>',
      window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
      volume: '<path d="M4 10h4l5-4v12l-5-4H4zM17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
      spark: '<path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
      layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
      eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>'
    })[name] || '<circle cx="12" cy="12" r="8"/>';
    return '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
  };

  runtime.sourcePill = function (model) {
    return '<button type="button" class="source-pill" data-open="sources" data-source-quality="' +
      runtime.esc(model.source.quality) + '" title="查看数据来源"><span class="source-dot" aria-hidden="true"></span><span>' +
      runtime.esc(runtime.qualityLabel(model.source.quality)) + '</span><small>' + runtime.esc(model.source.freshness) + '</small></button>';
  };

  runtime.channelPill = function (channel, label) {
    return '<span class="channel-pill channel-pill--' + runtime.esc(channel) + '">' + runtime.icon(channel === 'softpad' ? 'pad' : channel) + '<span>' + runtime.esc(label) + '</span></span>';
  };

  runtime.channelButton = function (channel, label, disabled) {
    return '<button type="button" class="channel-button channel-button--' + runtime.esc(channel) + '" data-channel="' + runtime.esc(channel) + '"' +
      (disabled ? ' disabled aria-disabled="true"' : '') + ' title="' + runtime.esc(runtime.channelName(channel)) + '：' + runtime.esc(label) + '">' +
      runtime.icon(channel === 'softpad' ? 'pad' : channel) + '<span>' + runtime.esc(label) + '</span></button>';
  };

  runtime.actionSet = function (model) {
    var common = [
      { id: 'agent.focus', label: '回到 Agent', copy: '切回当前 Agent 窗口', risk: 'safe', channels: [['keys', 'Alt+J'], ['voice', '说“回到 Agent”'], ['softpad', '回到']] },
      { id: 'agent.status', label: '当前状态', copy: '读出 Agent 正在做什么', risk: 'safe', channels: [['voice', '问“在做什么”'], ['softpad', '状态']] },
      { id: 'input.start', label: '开始听写', copy: '把想法直接说给当前输入框', risk: 'safe', channels: [['keys', 'Ctrl+Shift+D'], ['voice', '说“开始输入”'], ['softpad', '麦克风']] }
    ];
    if (model.state === 'waiting') {
      return [
        { id: 'agent.approve', label: '批准并继续', copy: '允许 Claude Code 执行下一步', risk: 'confirm', recommended: true, channels: [['keys', 'Enter'], ['voice', '说“批准”'], ['softpad', '批准'], ['camera', '发起确认']] },
        { id: 'agent.reject', label: '拒绝', copy: '拒绝当前请求，不继续执行', risk: 'confirm', channels: [['keys', 'Esc'], ['voice', '说“拒绝”'], ['softpad', '拒绝']] },
        common[0]
      ];
    }
    if (model.state === 'dictating') {
      return [
        { id: 'input.commit', label: '完成并发送', copy: '确认听写文字并发给 Agent', risk: 'safe', recommended: true, channels: [['keys', 'Enter'], ['voice', '说“发送”'], ['softpad', '完成']] },
        { id: 'input.cancel', label: '取消本轮', copy: '丢弃当前听写，不发送', risk: 'safe', channels: [['keys', 'Esc'], ['voice', '说“取消”'], ['softpad', '取消']] },
        common[1]
      ];
    }
    if (model.state === 'running') {
      return [
        Object.assign({ recommended: true }, common[0]),
        { id: 'agent.interrupt', label: '中断 Agent', copy: '请求停止当前执行', risk: 'confirm', channels: [['keys', 'Esc'], ['voice', '说“停止”'], ['softpad', '中断']] },
        common[1]
      ];
    }
    if (model.state === 'degraded') {
      return [
        { id: 'source.repair', label: '恢复数据连接', copy: '重新启用本地活动读取', risk: 'safe', recommended: true, channels: [['keys', 'Enter']] },
        { id: 'project.choose', label: '手动选择项目', copy: '不依赖自动识别，直接指定项目', risk: 'safe', channels: [['keys', 'Ctrl+P'], ['softpad', '选择项目']] }
      ];
    }
    if (model.state === 'idle') {
      return [Object.assign({ recommended: true }, common[2]), { id: 'task.new', label: '新建任务', copy: '从一句目标开始', risk: 'safe', channels: [['voice', '说出目标'], ['softpad', '新任务']] }, common[1]];
    }
    return [
      { id: 'session.resume', label: '继续上次工作', copy: '从今天 14:32 的恢复点继续', risk: 'safe', recommended: true, channels: [['keys', 'Ctrl+Enter'], ['voice', '说“继续”'], ['softpad', '继续'], ['camera', '点头']] },
      { id: 'task.new', label: '新建任务', copy: '保留恢复点，开始另一件事', risk: 'safe', channels: [['voice', '说出目标'], ['softpad', '新任务']] },
      common[1]
    ];
  };

  runtime.frame = function (options) {
    var model = options.model;
    var icon = runtime.icon;
    var stateNames = { idle: '待命', resume: '可继续', running: '工作中', waiting: '等确认', dictating: '听写中', degraded: '数据异常' };
    var stateButtons = Object.keys(stateNames).map(function (state) {
      return '<button type="button" role="menuitemradio" aria-checked="' + (model.state === state) + '" class="state-option' + (model.state === state ? ' is-active' : '') + '" data-set-state="' + state + '"><span class="state-swatch state-swatch--' + state + '"></span>' + stateNames[state] + '</button>';
    }).join('');
    return '<div class="home-shell home-shell--' + runtime.esc(options.id) + '" data-variant="' + runtime.esc(options.id) + '" data-home-state="' + runtime.esc(model.state) + '">' +
      '<aside class="app-rail"><div class="rail-brand"><span class="brand-mark">1</span><span class="rail-brand-copy"><b>OneTone</b><small>自然交互层</small></span></div>' +
      '<nav class="rail-nav" aria-label="主导航">' +
      '<button type="button" class="rail-item is-active" data-nav="home" aria-label="首页" aria-current="page">' + icon('home') + '<span>首页</span></button>' +
      '<button type="button" class="rail-item" data-nav="habits" aria-label="我的习惯">' + icon('habits') + '<span>我的习惯</span></button>' +
      '<button type="button" class="rail-item" data-nav="actions" aria-label="动作与入口">' + icon('actions') + '<span>动作与入口</span></button>' +
      '<button type="button" class="rail-item" data-nav="agent" aria-label="Agent">' + icon('agent') + '<span>Agent</span><i class="rail-signal rail-signal--' + runtime.esc(model.status.tone) + '" aria-hidden="true"></i></button>' +
      '<button type="button" class="rail-item" data-nav="settings" aria-label="设置">' + icon('settings') + '<span>设置</span></button></nav>' +
      '<div class="rail-foot"><span class="onetone-light"></span><span><b>OneTone 已开启</b><small>4 个入口可用</small></span></div></aside>' +
      '<main class="app-main"><header class="app-topbar"><div class="project-crumb"><span class="project-avatar">OT</span><span><b>' + runtime.esc(model.project.name) + '</b><small>' + runtime.esc(model.project.known ? model.project.path : '等待确认当前项目') + '</small></span></div>' +
      '<div class="topbar-actions">' + runtime.sourcePill(model) + '<div class="state-control"><button type="button" class="state-trigger" data-toggle-state-menu aria-haspopup="menu" aria-expanded="false"><span class="status-dot status-dot--' + runtime.esc(model.status.tone) + '"></span>' + runtime.esc(runtime.statusCopy(model).short) + icon('chevron') + '</button>' +
      '<div class="state-popover" data-state-popover role="menu" aria-label="切换演示状态" hidden><p>演示不同首页状态</p>' + stateButtons + '</div></div></div></header>' +
      '<div class="content-scroll content-scroll--' + runtime.esc(options.id) + '"><div class="variant-intro"><span>' + runtime.esc(options.name) + '</span><p>' + runtime.esc(options.axis) + '</p></div>' + options.body + '</div></main></div>';
  };

  runtime.registerVariant = function (variant) {
    runtime.variants.push(variant);
  };
})(typeof window !== 'undefined' ? window : globalThis);
