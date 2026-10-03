(function (global) {
  const stateIds = ['idle', 'listening', 'running', 'waiting', 'missing-config'];
  const labels = { idle: '待命', listening: '正在倾听', running: 'Agent 运行', waiting: '等待用户', 'missing-config': '配置缺失' };
  const base = {
    scene: { id: 'coding', name: 'Vibe Coding', detail: '专注编程 · 勿扰已开启' },
    target: { id: 'cursor', name: 'Cursor', project: 'voice-pilot', confirmed: true },
    channels: [
      { id: 'voice', name: '语音', available: true, detail: '麦克风已就绪', glyph: '◉' },
      { id: 'keys', name: '按键', available: true, detail: '鼠标侧键', glyph: '⌁' },
      { id: 'softpad', name: 'Soft Pad', available: true, detail: '6 个动作', glyph: '▦' },
      { id: 'camera', name: '摄像头', available: true, detail: '仅在本机识别', glyph: '◇' },
    ],
    agents: [
      { id: 'cursor', name: 'Cursor', state: 'idle', detail: '已连接' },
      { id: 'codex', name: 'Codex', state: 'idle', detail: '已连接' },
      { id: 'claude', name: 'Claude', state: 'offline', detail: 'Hook 未连接' },
    ],
    attention: null,
    configurationIssues: [],
    availableActions: [
      { id: 'speak', label: '按住说话', detail: '发送到 Cursor' },
      { id: 'type', label: '输入需求', detail: '先编辑再发送' },
      { id: 'softpad', label: '打开 Soft Pad', detail: '查看全部动作' },
    ],
  };
  const clones = (value) => JSON.parse(JSON.stringify(value));
  function getSnapshot(stateId) {
    const snap = clones(base);
    snap.stateId = stateIds.includes(stateId) ? stateId : 'idle';
    snap.stateLabel = labels[snap.stateId];
    if (snap.stateId === 'listening') {
      snap.transcript = '把首页做成一个清楚的桌面控制中心…';
      snap.availableActions = [{ id: 'pause', label: '暂停' }, { id: 'finish', label: '结束并发送' }, { id: 'cancel', label: '取消' }];
    }
    if (snap.stateId === 'running') {
      snap.agents[0].state = 'running'; snap.agents[0].detail = '正在处理';
      snap.availableActions = [{ id: 'status', label: '查看状态' }, { id: 'stop', label: '停止' }, { id: 'softpad', label: '打开 Soft Pad' }];
    }
    if (snap.stateId === 'waiting') {
      snap.agents[0].state = 'waiting'; snap.agents[0].detail = '等你确认';
      snap.attention = { title: 'Cursor 正等你确认文件修改', detail: '是否应用本次首页原型变更？' };
      snap.availableActions = [{ id: 'decide', label: '查看并决定' }, { id: 'later', label: '稍后处理' }];
    }
    if (snap.stateId === 'missing-config') {
      snap.target = { id: null, name: '尚未选择', project: null, confirmed: false };
      snap.channels[0].available = false; snap.channels[0].detail = '未选择麦克风';
      snap.agents.forEach((agent) => { agent.state = 'unknown'; agent.detail = '状态不可用'; });
      snap.configurationIssues = [{ id: 'microphone', label: '设置麦克风' }, { id: 'target', label: '选择目标应用' }, { id: 'hook', label: '修复 Agent 连接' }];
      snap.availableActions = snap.configurationIssues.map((issue) => ({ id: `repair-${issue.id}`, label: issue.label }));
    }
    return snap;
  }
  global.HomePrototypeFixtures = { stateIds, labels, getSnapshot };
})(window);
