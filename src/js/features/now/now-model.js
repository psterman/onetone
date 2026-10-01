/**
 * Now home model — project / activate / toggle / add / remove.
 */
(function (global) {
  'use strict';

  function cloneActions(actions) {
    var fn = global.OneToneNowFixtures && global.OneToneNowFixtures.cloneActions;
    if (fn) return fn(actions);
    return (actions || []).map(function (a) {
      return Object.assign({}, a);
    });
  }

  function normalizeHabit(h) {
    var st = h.state || {};
    var actions = cloneActions(h.actions || h.ops);
    var active = !!(st.active != null ? st.active : h.active);
    var suggested = !!(st.suggested != null ? st.suggested : h.maybe);
    var helping = h.helping;
    if ((!helping || !helping.length) && Array.isArray(h.assists) && h.assists.length) {
      helping = h.assists.slice();
    }
    helping = helping || [];
    return {
      id: h.id,
      name: h.name,
      short: h.short || h.name,
      description: h.description || h.blurb || '',
      blurb: h.description || h.blurb || '',
      helping: helping,
      assists: Array.isArray(h.assists) ? h.assists.slice() : helping.slice(),
      actions: actions,
      ops: actions.map(function (a) {
        return {
          id: a.id,
          title: a.label || a.title,
          enabled: !!a.enabled,
          effect: a.effect || ''
        };
      }),
      when: h.when || [],
      does: h.does || [],
      state: { active: active, suggested: suggested },
      active: active,
      maybe: suggested
    };
  }

  function projectNowHome(raw) {
    var habits = (raw.habits || []).map(normalizeHabit);
    var active = null;
    for (var i = 0; i < habits.length; i++) {
      if (habits[i].active) {
        active = habits[i];
        break;
      }
    }
    return {
      time: raw.time,
      system: raw.system,
      status: raw.status || { line: '' },
      habits: habits,
      active: active,
      needsYou: raw.needsYou || [],
      today: Array.isArray(raw.today) ? raw.today : [],
      input: raw.input || { voice: true, softpad: true }
    };
  }

  function activateHabit(state, habitId) {
    var next = Object.assign({}, state, {
      habits: state.habits.map(function (h) {
        var n = normalizeHabit(h);
        var active = n.id === habitId;
        return Object.assign({}, n, {
          state: { active: active, suggested: active ? false : n.state.suggested },
          active: active,
          maybe: active ? false : n.maybe,
          actions: cloneActions(n.actions)
        });
      })
    });
    var active = null;
    for (var i = 0; i < next.habits.length; i++) {
      if (next.habits[i].state.active) {
        active = next.habits[i];
        break;
      }
    }
    if (active) {
      next.status = {
        line:
          active.id === 'away'
            ? '已切换到离开 · 正在保护'
            : '已切换到' + active.name
      };
    }
    return next;
  }

  function toggleHabitOp(state, habitId, opId) {
    return Object.assign({}, state, {
      habits: state.habits.map(function (h) {
        var n = normalizeHabit(h);
        if (n.id !== habitId) {
          return Object.assign({}, n, { actions: cloneActions(n.actions) });
        }
        var actions = n.actions.map(function (a) {
          return a.id === opId
            ? Object.assign({}, a, { enabled: !a.enabled })
            : Object.assign({}, a);
        });
        return Object.assign({}, n, { actions: actions, state: Object.assign({}, n.state) });
      })
    });
  }

  function addHabit(state, name) {
    var id = 'custom_' + Date.now().toString(36);
    var habit = {
      id: id,
      name: name || '新状态',
      short: name || '新',
      description: '你刚添加的状态',
      helping: ['按你的方式帮忙'],
      actions: [
        {
          id: 'quiet',
          label: '少被打断',
          enabled: true,
          effect: '此状态下压住非紧急通知'
        }
      ],
      when: ['你手动切换时'],
      does: ['按你开启的协助执行'],
      state: { active: false, suggested: false }
    };
    var habits = state.habits.map(function (h) {
      var n = normalizeHabit(h);
      return Object.assign({}, n, { actions: cloneActions(n.actions) });
    });
    habits.push(habit);
    return Object.assign({}, state, { habits: habits });
  }

  function removeHabit(state, habitId) {
    var habits = state.habits.map(normalizeHabit);
    var target = null;
    for (var i = 0; i < habits.length; i++) {
      if (habits[i].id === habitId) {
        target = habits[i];
        break;
      }
    }
    if (!target || target.active) return state;
    return Object.assign({}, state, {
      habits: habits
        .filter(function (h) {
          return h.id !== habitId;
        })
        .map(function (h) {
          return Object.assign({}, h, { actions: cloneActions(h.actions) });
        })
    });
  }

  function statusLineFromRuntime(rtSnap) {
    var src = (rtSnap && rtSnap.source) || {};
    var cur = (rtSnap && rtSnap.current) || {};
    if (src.pin) return cur.badge || '已锁定当前情景';
    if (src.override) return cur.badge || '临时选用';
    if (src.foreground) return '正在跟随前台';
    return '手动切换';
  }

  function descriptionForMapping(m, rtSnap, active) {
    if (!active) return String((m && (m.group || m.label)) || '').trim();
    var cur = (rtSnap && rtSnap.current) || {};
    if (cur.badge) return String(cur.badge);
    if (cur.tooltip) return String(cur.tooltip);
    return String((m && (m.group || m.label)) || '').trim();
  }

  /** Stable assist IDs; labels are projection only (never persist Chinese). */
  var ASSIST_CATALOG = [
    {
      id: 'focus',
      label: '保持专注',
      effect: '此情景下压住非紧急通知'
    },
    {
      id: 'quiet',
      label: '减少消息打扰',
      effect: '批准请求等你停下再问'
    },
    {
      id: 'protect',
      label: '保护当前工作',
      effect: '离开时暂挡敏感画面并保留现场'
    }
  ];

  function catalogById(id) {
    id = String(id || '');
    for (var i = 0; i < ASSIST_CATALOG.length; i++) {
      if (ASSIST_CATALOG[i].id === id) return ASSIST_CATALOG[i];
    }
    return null;
  }

  function catalogIdByLabel(label) {
    label = String(label || '').trim();
    for (var i = 0; i < ASSIST_CATALOG.length; i++) {
      if (ASSIST_CATALOG[i].label === label) return ASSIST_CATALOG[i].id;
    }
    return '';
  }

  function findMapping(habitId) {
    habitId = String(habitId || '');
    var st = global.OneToneState && global.OneToneState.state;
    var list = (st && st.config && st.config.mappings) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === habitId) return list[i];
    }
    return null;
  }

  /** Normalize stored assists to IDs; migrate legacy Chinese labels in-place. */
  function migrateAssistsToIds(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var out = [];
    var seen = {};
    var dirty = false;
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i] || '').trim();
      if (!s) continue;
      var id = s;
      if (!catalogById(s)) {
        var fromLabel = catalogIdByLabel(s);
        if (fromLabel) {
          id = fromLabel;
          dirty = true;
        } else {
          dirty = true;
          continue;
        }
      }
      if (seen[id]) {
        dirty = true;
        continue;
      }
      seen[id] = true;
      out.push(id);
    }
    if (list.length && out.length !== list.length) dirty = true;
    return { ids: out, dirty: dirty };
  }

  /** Enabled assist IDs. Empty storage → catalog defaults (all ON). */
  function enabledIdsForMapping(m) {
    if (!m || !Array.isArray(m.assists) || !m.assists.length) {
      return ASSIST_CATALOG.map(function (a) {
        return a.id;
      });
    }
    var mig = migrateAssistsToIds(m.assists);
    if (mig.dirty) m.assists = mig.ids.slice();
    return mig.ids.slice();
  }

  function resolveActionsForHabit(habitId) {
    var m = findMapping(habitId);
    var enabled = enabledIdsForMapping(m);
    var set = {};
    for (var i = 0; i < enabled.length; i++) set[enabled[i]] = true;
    return ASSIST_CATALOG.map(function (a) {
      return {
        id: a.id,
        label: a.label,
        enabled: !!set[a.id],
        effect: a.effect
      };
    });
  }

  function helpingFromActions(actions) {
    var out = [];
    for (var i = 0; i < (actions || []).length; i++) {
      if (actions[i].enabled) out.push(actions[i].label);
    }
    return out.length ? out : ['按当前情景协助'];
  }

  /**
   * Toggle one assist on MappingEntry.assists (stable IDs).
   * @returns {{ ok:boolean, enabled?:boolean }}
   */
  function toggleHabitAssist(habitId, assistId) {
    habitId = String(habitId || '').trim();
    assistId = String(assistId || '').trim();
    if (!habitId || !catalogById(assistId)) return { ok: false };
    var m = findMapping(habitId);
    if (!m) return { ok: false };
    var enabled = enabledIdsForMapping(m);
    var idx = enabled.indexOf(assistId);
    var nowOn;
    if (idx >= 0) {
      enabled.splice(idx, 1);
      nowOn = false;
    } else {
      enabled.push(assistId);
      nowOn = true;
    }
    m.assists = enabled;
    var persist = global.OneToneConfigPersist;
    if (persist && persist.saveAsync) persist.saveAsync({ source: 'nowAssist' });
    else if (persist && persist.save) persist.save();
    var hr = global.OneToneHabitRuntime;
    if (hr && hr.notify) {
      try {
        hr.notify('config', {});
      } catch (_) {}
    }
    return { ok: true, enabled: nowOn };
  }

  function projectNeedsYou(attention) {
    attention = attention || {};
    var kinds = Array.isArray(attention.waitingKinds)
      ? attention.waitingKinds
      : Array.isArray(attention.waiting_kinds)
        ? attention.waiting_kinds
        : [];
    var rows = Array.isArray(attention.rows) ? attention.rows : [];

    function rowState(r) {
      var st = r && (r.state || r.State);
      if (!st) return '';
      if (typeof st === 'string') return st;
      if (st.needsInput) return 'needsInput';
      if (st.working) return 'working';
      return String(st);
    }

    function rowCause(r) {
      var c = r && (r.cause || r.Cause);
      if (!c) return '';
      return String(c);
    }

    function rowAgent(r) {
      return String((r && (r.agent || r.Agent)) || 'Agent').trim() || 'Agent';
    }

    function waitedMinutes(r) {
      var ts = Number(
        (r && (r.observedAtMs != null ? r.observedAtMs : r.observed_at_ms)) || 0
      );
      if (!(ts > 0)) return 0;
      var mins = Math.floor((Date.now() - ts) / 60000);
      return mins > 0 ? mins : 0;
    }

    function waitDetail(base, r) {
      var n = waitedMinutes(r);
      if (n > 0) return base + ' · 已经等你 ' + n + ' 分钟';
      return base;
    }

    var needsInputRows = rows.filter(function (r) {
      return rowState(r) === 'needsInput';
    });

    if (!kinds.length && !needsInputRows.length) {
      var working = rows.some(function (r) {
        return rowState(r) === 'working';
      });
      if (working) {
        return [
          {
            id: 'view_progress',
            title: '查看进度',
            detail: 'AI 正在处理，可选查看',
            primary: false
          }
        ];
      }
      return [];
    }

    var permissionRow = null;
    var textRow = null;
    for (var i = 0; i < needsInputRows.length; i++) {
      var cause = rowCause(needsInputRows[i]).toLowerCase();
      if (cause === 'permission' && !permissionRow) permissionRow = needsInputRows[i];
      if (
        (cause === 'elicitation' ||
          cause === 'userinput' ||
          cause === 'onetoneask') &&
        !textRow
      ) {
        textRow = needsInputRows[i];
      }
    }

    var out = [];
    if (permissionRow || kinds.indexOf('waitingApproval') >= 0 || /approval|permission/i.test(kinds.join(','))) {
      var agentP = rowAgent(permissionRow || needsInputRows[0] || {});
      out.push({
        id: 'approve_rm',
        title: '批准 ' + agentP + ' 的操作？',
        detail: waitDetail(agentP + ' 在等你决定', permissionRow || needsInputRows[0]),
        primary: true
      });
    } else if (textRow || kinds.length || needsInputRows.length) {
      var agentT = rowAgent(textRow || needsInputRows[0] || {});
      var label = kinds.length
        ? kinds
            .map(function (k) {
              return String(k || '').trim();
            })
            .filter(Boolean)
            .join('、')
        : agentT;
      out.push({
        id: 'view_reply',
        title: agentT + ' 需要你回复',
        detail: waitDetail(label + ' 在等你', textRow || needsInputRows[0]),
        primary: true
      });
    }

    out.push({
      id: 'keep_quiet',
      title: '继续别打扰我',
      detail: '保持当前情景'
    });
    return out;
  }

  function isMeetingForeground(identity) {
    if (!identity) return false;
    var blob = [
      identity.exeName || identity.exe_name || '',
      identity.fullPath || identity.full_path || '',
      identity.windowClass || identity.window_class || '',
      identity.matchedPresetAppId || identity.matched_preset_app_id || identity.appId || ''
    ]
      .join(' ')
      .toLowerCase();
    return /zoom|teams|webex|tencentmeeting|feishu|lark|slack|discord|outlook|skype|voov|会议/.test(
      blob
    );
  }

  function looksLikeMeetHabit(m) {
    if (!m) return false;
    var blob = [m.id, m.group, m.label, m.name]
      .map(function (x) {
        return String(x || '').toLowerCase();
      })
      .join(' ');
    return /meet|会议|通话|call/.test(blob);
  }

  /**
   * Suggest habit ids (not current). Meeting FG → meet-like; waiting → focus/create-like.
   */
  function projectSuggestedIds(mappings, opts) {
    opts = opts || {};
    var currentId = String(opts.currentId || '');
    var identity = opts.identity || null;
    var attention = opts.attention || {};
    var kinds = Array.isArray(attention.waitingKinds)
      ? attention.waitingKinds
      : Array.isArray(attention.waiting_kinds)
        ? attention.waiting_kinds
        : [];
    var list = Array.isArray(mappings) ? mappings : [];
    var out = [];
    function pushId(id) {
      id = String(id || '');
      if (!id || id === currentId || out.indexOf(id) >= 0) return;
      out.push(id);
    }
    if (isMeetingForeground(identity)) {
      for (var i = 0; i < list.length; i++) {
        if (looksLikeMeetHabit(list[i])) pushId(list[i].id);
      }
    }
    if (kinds.length) {
      for (var j = 0; j < list.length; j++) {
        var m = list[j];
        if (!m) continue;
        var blob = [m.group, m.label, m.id].join(' ').toLowerCase();
        if (/创作|专注|create|focus|工作/.test(blob) && !looksLikeMeetHabit(m)) {
          pushId(m.id);
        }
      }
    }
    return out;
  }

  /**
   * Project Now home snapshot from HabitRuntime facade + saved mappings.
   * Catalog fixtures are NOT the source of truth here.
   * @param opts.attention AttentionPublicSnapshot-like
   * @param opts.identity foreground identity
   */
  function projectFromRuntime(rtSnap, mappings, opts) {
    opts = opts || {};
    rtSnap = rtSnap || {};
    var list = Array.isArray(mappings) ? mappings : [];
    var currentId = String((rtSnap.current && rtSnap.current.id) || '');
    var habits = [];
    var attention = opts.attention || null;
    var identity = opts.identity || null;
    var suggestedIds = projectSuggestedIds(list, {
      currentId: currentId,
      identity: identity,
      attention: attention || {}
    });
    var suggestedSet = {};
    for (var s = 0; s < suggestedIds.length; s++) suggestedSet[suggestedIds[s]] = true;

    if (!rtSnap.hasHabits) {
      return {
        empty: true,
        time: undefined,
        system: { ok: true, label: '正常' },
        status: { line: '还没有情景' },
        habits: [],
        active: null,
        needsYou: projectNeedsYou(attention),
        today: [],
        input: { voice: true, softpad: true }
      };
    }

    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !m.id) continue;
      var id = String(m.id);
      var name = '';
      if (global.OneToneHabitProfile && global.OneToneHabitProfile.habitDisplayName) {
        name = global.OneToneHabitProfile.habitDisplayName(m);
      } else {
        name = String(m.group || m.label || m.id || '').trim();
      }
      var active = id === currentId;
      var actions = resolveActionsForHabit(id);
      habits.push(
        normalizeHabit({
          id: id,
          name: name,
          short: name,
          description: descriptionForMapping(m, rtSnap, active),
          helping: active ? helpingFromActions(actions) : [],
          actions: actions,
          when: ['你手动切换，或系统建议后确认'],
          does: actions
            .filter(function (a) {
              return a.enabled;
            })
            .map(function (a) {
              return a.label;
            }),
          state: {
            active: active,
            suggested: !active && !!suggestedSet[id]
          }
        })
      );
    }

    var activeHabit = null;
    for (var j = 0; j < habits.length; j++) {
      if (habits[j].active) {
        activeHabit = habits[j];
        break;
      }
    }

    return {
      empty: false,
      time: undefined,
      system: { ok: true, label: '正常' },
      status: { line: statusLineFromRuntime(rtSnap) },
      habits: habits,
      active: activeHabit,
      needsYou: projectNeedsYou(attention),
      today: [],
      input: { voice: true, softpad: true },
      runtime: rtSnap
    };
  }

  /**
   * Empty-state one-shot: create universal「创作中」+ assists IDs + scenarioEssentials.
   * Does not bind appTargetId (cross-app).
   * @returns {{ ok:boolean, mappingId?:string, reason?:string, created?:boolean }}
   */
  function bootstrapRecommendedHabit() {
    var st = global.OneToneState && global.OneToneState.state;
    var cfg = st && st.config;
    if (!cfg) return { ok: false, reason: 'no_config' };
    if (!Array.isArray(cfg.mappings)) cfg.mappings = [];

    var core = global.OneToneMappingCore;
    var hp = global.OneToneHabitProfile;
    function isLib(m) {
      if (hp && hp.isLibraryHabit) return !!hp.isLibraryHabit(m, cfg);
      if (core && core.isSaved) return !!core.isSaved(m);
      return !!(m && m.triggerKey && m.targetKey);
    }
    for (var i = 0; i < cfg.mappings.length; i++) {
      if (isLib(cfg.mappings[i])) {
        return { ok: true, created: false, mappingId: String(cfg.mappings[i].id) };
      }
    }

    var id =
      core && core.newMappingId
        ? core.newMappingId()
        : 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    var pack =
      global.OneToneLocaleDefaults && global.OneToneLocaleDefaults.contentPack
        ? global.OneToneLocaleDefaults.contentPack(
            global.OneToneLocaleDefaults.contentLocale
              ? global.OneToneLocaleDefaults.contentLocale()
              : 'zh'
          )
        : null;
    var targetKey = (pack && pack.mappingTargetKey) || 'RAlt';

    var m = {
      id: id,
      label: '创作中',
      group: '创作中',
      triggerKey: 'AutoTrigger',
      targetKey: targetKey,
      enabled: true,
      order: cfg.mappings.length,
      triggerMode: 'tap',
      appTargetId: '',
      assists: ['focus', 'quiet', 'protect'],
      agentBindings: [],
      agentTemplateId: '',
      agentProviderId: ''
    };

    var A = global.OneToneAgentActions;
    if (A && A.buildCodexMicro13Bindings) {
      m.agentBindings = A.buildCodexMicro13Bindings({
        enableProfile: 'scenarioEssentials'
      });
    }
    // Universal: never inherit Codex app target from template helpers
    m.appTargetId = '';

    if (core && core.ensureMappingExtras) core.ensureMappingExtras(m);
    cfg.mappings.push(m);
    cfg.activeSceneId = id;

    var persist = global.OneToneConfigPersist;
    if (persist && persist.saveAsync) persist.saveAsync({ source: 'nowBootstrap' });
    else if (persist && persist.save) persist.save();

    var hr = global.OneToneHabitRuntime;
    if (hr && hr.switch) {
      hr.switch(id, {
        source: 'home_quick_switch',
        allowForegroundFollow: true
      });
    } else if (hr && hr.notify) {
      try {
        hr.notify('config', {});
      } catch (_) {}
    }

    return { ok: true, created: true, mappingId: id };
  }

  global.OneToneNowModel = {
    ASSIST_CATALOG: ASSIST_CATALOG,
    normalizeHabit: normalizeHabit,
    projectNowHome: projectNowHome,
    projectFromRuntime: projectFromRuntime,
    projectNeedsYou: projectNeedsYou,
    projectSuggestedIds: projectSuggestedIds,
    resolveActionsForHabit: resolveActionsForHabit,
    toggleHabitAssist: toggleHabitAssist,
    bootstrapRecommendedHabit: bootstrapRecommendedHabit,
    activateHabit: activateHabit,
    toggleHabitOp: toggleHabitOp,
    addHabit: addHabit,
    removeHabit: removeHabit
  };
})(typeof window !== 'undefined' ? window : globalThis);
