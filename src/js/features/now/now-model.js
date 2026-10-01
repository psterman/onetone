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
    return {
      id: h.id,
      name: h.name,
      short: h.short || h.name,
      description: h.description || h.blurb || '',
      blurb: h.description || h.blurb || '',
      helping: h.helping || [],
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

  global.OneToneNowModel = {
    normalizeHabit: normalizeHabit,
    projectNowHome: projectNowHome,
    activateHabit: activateHabit,
    toggleHabitOp: toggleHabitOp,
    addHabit: addHabit,
    removeHabit: removeHabit
  };
})(typeof window !== 'undefined' ? window : globalThis);
