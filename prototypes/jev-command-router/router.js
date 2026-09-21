/**
 * Jev → OneTone command router (prototype).
 * UMD: works under file:// in Chrome (no ES modules) and via require() in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.JevOneToneRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var CONFIDENCE_AUTO = 0.75;
  var CONFIDENCE_CONFIRM = 0.45;

  var COMMANDS = [
    {
      id: 'summonCodex',
      actionId: 'agent.focus',
      label: '召唤 Agent',
      criteria: '召唤 Codex / Claude / 小助手 / 打开助手 / 唤起 Agent',
      aliases: ['小助手', '召唤codex', '召唤助手', '打开助手'],
      risk: 'safe',
    },
    {
      id: 'pushToTalk',
      actionId: 'input.start',
      label: '开始听写',
      criteria: '开始说话 / 开始听写 / 我说 / 按住说话',
      aliases: ['开始说话', '开始听写', '我说'],
      risk: 'safe',
    },
    {
      id: 'stopOrSend',
      actionId: 'input.send',
      label: '结束或发送',
      criteria: '发送 / 说完了 / 结束听写 / 提交',
      aliases: ['发送', '说完了', '结束', '提交'],
      risk: 'confirm',
    },
    {
      id: 'cancel',
      actionId: 'input.cancel',
      label: '取消',
      criteria: '取消 / 算了 / 不要了 / 撤销本轮',
      aliases: ['取消', '算了', '不要了'],
      risk: 'safe',
    },
    {
      id: 'commandPalette',
      actionId: 'commandPalette',
      label: '命令菜单',
      criteria: '打开命令面板 / 命令菜单 / Command Palette / 快捷命令',
      aliases: ['命令面板', '命令菜单', 'command palette'],
      risk: 'safe',
    },
    {
      id: 'newThread',
      actionId: 'newThread',
      label: '新对话',
      criteria: '新建对话 / 新线程 / 新上下文 / 开一个新聊天',
      aliases: ['新对话', '新建对话', '新线程', '新上下文'],
      risk: 'safe',
    },
    {
      id: 'openTerminal',
      actionId: 'openTerminal',
      label: '打开终端',
      criteria: '打开终端 / 终端 / Terminal',
      aliases: ['打开终端', '终端', 'terminal'],
      risk: 'safe',
    },
    {
      id: 'none',
      actionId: null,
      label: '不是命令',
      criteria: '闲聊、口述代码正文、与控制无关的内容',
      aliases: [],
      risk: 'safe',
    },
  ];

  function normalize(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？、,.!?]/g, '');
  }

  function localExactMatch(transcript) {
    var n = normalize(transcript);
    if (!n) return null;
    for (var i = 0; i < COMMANDS.length; i++) {
      var cmd = COMMANDS[i];
      if (cmd.id === 'none') continue;
      for (var j = 0; j < cmd.aliases.length; j++) {
        if (normalize(cmd.aliases[j]) === n) return cmd;
      }
    }
    return null;
  }

  function keywordHits(hay, criteria) {
    var parts = String(criteria)
      .split(/[\/|,，、\s]+/)
      .map(normalize)
      .filter(function (p) {
        return p.length >= 2;
      });
    var best = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (hay.indexOf(p) !== -1) {
        best = Math.max(best, Math.min(1, p.length / Math.max(4, hay.length * 0.45)));
      } else if (p.indexOf(hay) !== -1 && hay.length >= 2) {
        best = Math.max(best, 0.55);
      }
    }
    return best;
  }

  function mockJevDecide(transcript, session) {
    var n = normalize(transcript);
    var raw = COMMANDS.map(function (cmd) {
      var s = 0.02;
      if (cmd.id === 'none') return { id: cmd.id, score: s };
      s = Math.max(s, keywordHits(n, cmd.criteria) * 1.15);
      for (var i = 0; i < cmd.aliases.length; i++) {
        var an = normalize(cmd.aliases[i]);
        if (!an) continue;
        if (n === an) s = Math.max(s, 1);
        else if (n.indexOf(an) !== -1) s = Math.max(s, 0.92);
        else if (an.indexOf(n) !== -1 && n.length >= 2) s = Math.max(s, 0.7);
      }
      return { id: cmd.id, score: s };
    });

    var bestCmd = 0;
    for (var i = 0; i < raw.length; i++) {
      if (raw[i].id !== 'none') bestCmd = Math.max(bestCmd, raw[i].score);
    }
    for (var k = 0; k < raw.length; k++) {
      if (raw[k].id === 'none') {
        raw[k].score = bestCmd >= 0.55 ? 0.08 : Math.max(0.55, 0.95 - bestCmd);
      }
    }

    var temp = 0.22;
    var exps = raw.map(function (x) {
      return { id: x.id, e: Math.exp(x.score / temp) };
    });
    var z = 0;
    for (var e = 0; e < exps.length; e++) z += exps[e].e;
    var probabilities = {};
    for (var p = 0; p < exps.length; p++) probabilities[exps[p].id] = exps[p].e / z;

    var ranked = Object.keys(probabilities)
      .map(function (id) {
        return [id, probabilities[id]];
      })
      .sort(function (a, b) {
        return b[1] - a[1];
      });
    var choice = ranked[0][0];
    var top = ranked[0][1];
    var second = ranked[1] ? ranked[1][1] : 0;
    var confidence = Math.min(0.99, Math.max(0.05, (top - second) / Math.max(top, 1e-6)));
    var isCommand = choice === 'none' ? 1 - top : Math.min(0.99, top + confidence * 0.15);
    var riskLevel = choice === 'stopOrSend' ? 1.6 : choice === 'none' ? 0.2 : 0.55;

    return {
      model: 'mock-jev',
      state: {
        transcript: transcript,
        foreground: (session && session.foreground) || 'Cursor',
        dictating: !!(session && session.dictating),
      },
      answers: {
        command: {
          type: 'choice',
          choice: choice,
          probabilities: probabilities,
          confidence: confidence,
        },
        is_voice_command: { type: 'noul', noul: isCommand },
        action_risk: {
          type: 'score',
          score: riskLevel,
          legend: ['safe', 'caution', 'confirm'],
          confidence: 0.7,
        },
      },
    };
  }

  function decideDisposition(answers, cmdMeta) {
    var choice = answers.command.choice;
    var confidence = answers.command.confidence;
    var isCmd = answers.is_voice_command.noul;

    if (choice === 'none' || isCmd < 0.4) return 'ignore';
    if (confidence < CONFIDENCE_CONFIRM) return 'ignore';
    if (cmdMeta && cmdMeta.risk === 'confirm') {
      return confidence >= CONFIDENCE_AUTO ? 'confirm' : 'ignore';
    }
    if (confidence >= CONFIDENCE_AUTO) return 'auto';
    if (confidence >= CONFIDENCE_CONFIRM) return 'confirm';
    return 'ignore';
  }

  function buildJevRequestBody(transcript, session) {
    var criteria = {};
    for (var i = 0; i < COMMANDS.length; i++) criteria[COMMANDS[i].id] = COMMANDS[i].criteria;
    return {
      model: 'jev-latest',
      state: {
        transcript: String(transcript || ''),
        app: (session && session.foreground) || 'Cursor',
        dictating: !!(session && session.dictating),
        product: 'OneTone voice command fallback',
      },
      questions: {
        command: {
          type: 'choice',
          instructions: '用户这句话最接近哪条 OneTone 控制命令？若是听写正文或闲聊选 none。',
          criteria: criteria,
        },
        is_voice_command: {
          type: 'noul',
          instructions: '这是一条要执行的控制命令（而不是要写入编辑器的正文）吗？',
        },
        action_risk: {
          type: 'score',
          instructions: '若执行该命令，误触代价有多高？',
          criteria: ['可逆、低代价', '需留意', '会提交/发送，误触代价高'],
        },
      },
    };
  }

  return {
    CONFIDENCE_AUTO: CONFIDENCE_AUTO,
    CONFIDENCE_CONFIRM: CONFIDENCE_CONFIRM,
    COMMANDS: COMMANDS,
    normalize: normalize,
    localExactMatch: localExactMatch,
    mockJevDecide: mockJevDecide,
    decideDisposition: decideDisposition,
    buildJevRequestBody: buildJevRequestBody,
  };
});
