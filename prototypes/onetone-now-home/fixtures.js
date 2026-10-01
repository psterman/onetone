/* NowSnapshot — 个人状态入口（UI：状态/情景；数据：habits） */

const HABIT_CATALOG = [
  {
    id: "create",
    name: "创作中",
    short: "创作",
    description: "帮你保持专注，少被打断",
    helping: ["保持专注", "减少打扰", "保护当前工作"],
    actions: [
      { id: "focus", label: "不被消息打断", enabled: true, effect: "创作时压住非紧急通知" },
      { id: "agent_defer", label: "AI 先别出声", enabled: true, effect: "批准请求等你停下再问" },
      { id: "protect_win", label: "保护工作窗口", enabled: true, effect: "离开时暂挡敏感画面" }
    ],
    when: ["Cursor 在前台", "最近在敲键盘", "人在电脑前"],
    does: ["开启专注处理", "压住打扰", "需要时保护窗口"]
  },
  {
    id: "meet",
    name: "会议中",
    short: "会议",
    description: "开会时少打扰、管好麦克风",
    helping: ["减少打断", "留意麦克风", "旁人靠近时提醒"],
    actions: [
      { id: "mute_noise", label: "少被消息打断", enabled: true, effect: "会议期间静音非紧急通知" },
      { id: "mic_guard", label: "留意麦克风", enabled: true, effect: "离开画面时提醒静音" },
      { id: "bystander", label: "旁人靠近时提醒", enabled: false, effect: "画面里出现他人时轻提示" }
    ],
    when: ["会议软件在前台", "或检测到多人对话"],
    does: ["压通知", "麦克风守护"]
  },
  {
    id: "away",
    name: "离开电脑",
    short: "离开",
    description: "你不在时替你看住",
    helping: ["挡住屏幕", "停掉麦克风", "回来后还原"],
    actions: [
      { id: "mask", label: "旁人看不到屏幕", enabled: true, effect: "离开后遮住敏感窗口" },
      { id: "mic_off", label: "停掉麦克风", enabled: true, effect: "离开期间关闭拾音" },
      { id: "restore", label: "回来后还原现场", enabled: true, effect: "返回时恢复窗口布局" }
    ],
    when: ["座位空着一段时间", "键盘也静了"],
    does: ["遮屏", "停麦", "回来还原"]
  },
  {
    id: "rest",
    name: "休息一下",
    short: "休息",
    description: "用久了轻轻问一句",
    helping: ["提醒歇一歇", "提醒抬头"],
    actions: [
      { id: "break", label: "用久了问要不要歇", enabled: true, effect: "连续使用较久时询问" },
      { id: "posture", label: "低头久了提醒抬头", enabled: false, effect: "姿态偏移时轻提示" }
    ],
    when: ["你主动切换，或坐了很久"],
    does: ["温和提醒，不强切"]
  }
];

function cloneActions(actions) {
  return (actions || []).map((a) => ({ ...a }));
}

function habitsFor(activeId, suggestedIds) {
  return HABIT_CATALOG.map((h) => ({
    ...h,
    actions: cloneActions(h.actions),
    state: {
      active: h.id === activeId,
      suggested: (suggestedIds || []).includes(h.id)
    }
  }));
}

const SOURCES = [
  {
    icon: "👁", name: "摄像头", status: "ok", statusLabel: "正常",
    knows: ["你是否在座位上", "离开了多久", "你在看哪块屏幕"],
    note: "画面只在本机处理，不上传", action: "关闭"
  },
  {
    icon: "🎤", name: "麦克风", status: "ok", statusLabel: "正常",
    knows: ["你是否正在说话", "周围有没有杂音"],
    note: "只在你主动触发时录音", action: "关闭"
  },
  {
    icon: "🖥", name: "窗口", status: "ok", statusLabel: "正常",
    knows: ["前台是哪个软件", "窗口怎么排"],
    note: "只读窗口标题，不读内容"
  },
  {
    icon: "⌨️", name: "键鼠", status: "ok", statusLabel: "正常",
    knows: ["最近有没有在敲", "多久没动过"],
    note: "只统计节奏，不记录内容"
  },
  {
    icon: "🤖", name: "AI 助手", status: "warn", statusLabel: "部分连接",
    knows: ["是否在等你批准", "是否在处理"],
    note: "Claude 还没连上", action: "去连接"
  },
  {
    icon: "📁", name: "代码库", status: "ok", statusLabel: "正常",
    knows: ["哪个项目", "有没有未提交改动"],
    note: "只看文件列表"
  }
];

window.ONETONE_NOW_FIXTURES = {
  s1: {
    id: "s1",
    label: "创作中",
    state: {
      time: "22:32",
      system: { ok: true, label: "正常" },
      status: { line: "Cursor 在前台 · 你在敲键盘" },
      habits: habitsFor("create", ["meet"]),
      needsYou: [
        {
          id: "approve_rm",
          title: "批准 Codex 删除命令？",
          detail: "运行 rm，不可逆",
          primary: true
        }
      ],
      sources: SOURCES,
      input: { voice: true, softpad: true, hotkey: "Ctrl+Space" }
    }
  },
  s0: {
    id: "s0",
    label: "刚打开",
    state: {
      time: "22:10",
      system: { ok: true, label: "正常" },
      status: { line: "刚打开 Cursor · 还在摸清状态" },
      habits: habitsFor(null, ["create"]),
      needsYou: [],
      sources: SOURCES,
      input: { voice: true, softpad: true, hotkey: "Ctrl+Space" }
    }
  },
  sWait: {
    id: "sWait",
    label: "等你决定",
    state: {
      time: "22:40",
      system: { ok: true, label: "正常" },
      status: { line: "创作中 · Agent 有事在等你" },
      habits: habitsFor("create", []),
      needsYou: [
        {
          id: "view_reply",
          title: "查看 Agent 请求",
          detail: "有一条确认在等你",
          primary: true
        },
        {
          id: "keep_quiet",
          title: "继续别打扰我",
          detail: "保持当前状态"
        },
        {
          id: "extra_demo",
          title: "确认提交改动？",
          detail: "演示：第 3 条会收进「查看全部」"
        }
      ],
      sources: SOURCES,
      input: { voice: true, softpad: true, hotkey: "Ctrl+Space" }
    }
  },
  sWork: {
    id: "sWork",
    label: "AI 忙碌",
    state: {
      time: "22:42",
      system: { ok: true, label: "正常" },
      status: { line: "创作中 · AI 正在处理" },
      habits: habitsFor("create", []),
      needsYou: [
        {
          id: "view_progress",
          title: "查看进度",
          detail: "可选，不紧急"
        }
      ],
      sources: SOURCES,
      input: { voice: true, softpad: true, hotkey: "Ctrl+Space" }
    }
  },
  sAway: {
    id: "sAway",
    label: "离开中",
    state: {
      time: "22:50",
      system: { ok: true, label: "保护中" },
      status: { line: "座位空着 · 屏幕已保护" },
      habits: habitsFor("away", ["create"]),
      needsYou: [],
      sources: SOURCES,
      input: { voice: false, softpad: true, hotkey: "Ctrl+Space" }
    }
  }
};

function normalizeHabit(h) {
  const st = h.state || {};
  const actions = cloneActions(h.actions || h.ops);
  return {
    id: h.id,
    name: h.name,
    short: h.short || h.name,
    description: h.description || h.blurb || "",
    blurb: h.description || h.blurb || "",
    helping: h.helping || [],
    actions,
    ops: actions.map((a) => ({
      id: a.id,
      title: a.label || a.title,
      enabled: !!a.enabled,
      effect: a.effect || ""
    })),
    when: h.when || [],
    does: h.does || [],
    state: {
      active: !!(st.active ?? h.active),
      suggested: !!(st.suggested ?? h.maybe)
    },
    active: !!(st.active ?? h.active),
    maybe: !!(st.suggested ?? h.maybe)
  };
}

window.projectNowHome = function projectNowHome(raw) {
  const habits = (raw.habits || []).map(normalizeHabit);
  const active = habits.find((h) => h.active) || null;
  return {
    time: raw.time,
    system: raw.system,
    status: raw.status || { line: "" },
    habits,
    active,
    needsYou: raw.needsYou || [],
    sources: raw.sources || SOURCES,
    input: raw.input || { voice: true, softpad: true },
    _raw: raw
  };
};

window.activateHabit = function activateHabit(state, habitId) {
  const next = {
    ...state,
    habits: state.habits.map((h) => {
      const n = normalizeHabit(h);
      const active = n.id === habitId;
      return {
        ...n,
        state: { active, suggested: active ? false : n.state.suggested },
        active,
        maybe: active ? false : n.maybe,
        actions: cloneActions(n.actions)
      };
    })
  };
  const active = next.habits.find((h) => h.state.active);
  if (active) {
    next.status = {
      line: active.id === "away" ? "已切换到离开 · 正在保护" : `已切换到${active.name}`
    };
  }
  return next;
};

window.toggleHabitOp = function toggleHabitOp(state, habitId, opId) {
  return {
    ...state,
    habits: state.habits.map((h) => {
      const n = normalizeHabit(h);
      if (n.id !== habitId) return { ...n, actions: cloneActions(n.actions) };
      const actions = n.actions.map((a) =>
        a.id === opId ? { ...a, enabled: !a.enabled } : { ...a }
      );
      return { ...n, actions, state: { ...n.state } };
    })
  };
};

window.addHabit = function addHabit(state, name) {
  const id = "custom_" + Date.now().toString(36);
  const habit = {
    id,
    name: name || "新状态",
    short: name || "新",
    description: "你刚添加的状态",
    helping: ["按你的方式帮忙"],
    actions: [
      { id: "quiet", label: "少被打断", enabled: true, effect: "此状态下压住非紧急通知" }
    ],
    when: ["你手动切换时"],
    does: ["按你开启的协助执行"],
    state: { active: false, suggested: false }
  };
  return {
    ...state,
    habits: [...state.habits.map((h) => ({ ...normalizeHabit(h), actions: cloneActions(normalizeHabit(h).actions) })), habit]
  };
};

window.removeHabit = function removeHabit(state, habitId) {
  const habits = state.habits.map(normalizeHabit);
  const target = habits.find((h) => h.id === habitId);
  if (!target || target.active) return state;
  return {
    ...state,
    habits: habits
      .filter((h) => h.id !== habitId)
      .map((h) => ({ ...h, actions: cloneActions(h.actions) }))
  };
};
