/**
 * Now home — current-scene cockpit (see / tweak / switch).
 * mount / show / hide / setView on #nowHomeRoot.
 */
(function (global) {
  'use strict';

  var ROOT_ID = 'nowHomeRoot';
  var STACK_SEL = '#wbDashboardStack, .wb-dashboard-stack';

  var root = null;
  var mounted = false;
  var visible = false;
  var view = 'now';
  var live = null;
  var tier = 's1';
  var needsExpanded = false;
  var adjustOpen = false;
  var focusHabitId = '';
  var isDemo = false;

  function $(id) {
    return document.getElementById(id);
  }

  function model() {
    return global.OneToneNowModel;
  }

  function ui() {
    return global.OneToneNowHomeUi;
  }

  function fixtures() {
    return global.OneToneNowFixtures;
  }

  function detectDemo() {
    try {
      return new URLSearchParams(location.search).get('nowDemo') === '1';
    } catch (_) {
      return false;
    }
  }

  function dashboardStack() {
    return document.querySelector(STACK_SEL);
  }

  function ensureLive() {
    if (live) return;
    var fx = fixtures();
    live = fx
      ? fx.cloneState(tier)
      : {
          habits: [],
          needsYou: [],
          status: { line: '' },
          system: { ok: true, label: '正常' },
          input: {}
        };
  }

  function snapshot() {
    ensureLive();
    var m = model();
    return m
      ? m.projectNowHome(live)
      : { habits: [], needsYou: [], status: { line: '' }, active: null, input: {} };
  }

  function paint() {
    if (!root) return;
    var U = ui();
    if (!U || !model()) return;
    var snap = snapshot();
    var html = '';
    if (isDemo) html += U.renderDemoBar({ tier: tier });
    if (view === 'scenes') {
      html += U.renderScenesView({ snapshot: snap, focusHabitId: focusHabitId });
    } else {
      html += U.renderNowView({
        snapshot: snap,
        needsExpanded: needsExpanded,
        adjustOpen: adjustOpen
      });
    }
    root.innerHTML = html;

    if (view === 'scenes' && focusHabitId) {
      var el = $('now-habit-' + focusHabitId);
      if (el && el.scrollIntoView) {
        setTimeout(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      }
      if (focusHabitId === 'new') {
        var input = $('nowNewName');
        if (input) input.focus();
      }
    }
  }

  function openSettings() {
    if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
      global.OneToneSettingsDrawer.open({ panel: 'basic' });
      return;
    }
    var btn = $('wbNavGeneral');
    if (btn) btn.click();
  }

  function triggerVoice() {
    var orb = $('wbHeroOrb');
    if (orb) {
      orb.click();
      return;
    }
    if (global.OneToneVoiceWake && typeof global.OneToneVoiceWake.toggle === 'function') {
      global.OneToneVoiceWake.toggle();
      return;
    }
    if (global.OneToneApp && typeof global.OneToneApp.startVoice === 'function') {
      global.OneToneApp.startVoice();
    }
  }

  function onRootClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var tierBtn = t.closest('[data-now-tier]');
    if (tierBtn) {
      loadTier(tierBtn.getAttribute('data-now-tier'));
      return;
    }

    var back = t.closest('[data-now-back]');
    if (back) {
      setView('now');
      return;
    }

    var settings = t.closest('[data-now-settings]');
    if (settings) {
      openSettings();
      return;
    }

    var adjustDone = t.closest('[data-now-adjust-done]');
    if (adjustDone) {
      adjustOpen = false;
      paint();
      return;
    }

    var adjust = t.closest('[data-now-adjust]');
    if (adjust) {
      adjustOpen = true;
      paint();
      return;
    }

    var scenes = t.closest('[data-now-scenes]');
    if (scenes) {
      var hid = scenes.getAttribute('data-now-scenes') || '';
      adjustOpen = false;
      setView('scenes', hid || '');
      return;
    }

    var act = t.closest('[data-now-activate]');
    if (act) {
      live = model().activateHabit(live, act.getAttribute('data-now-activate'));
      needsExpanded = false;
      adjustOpen = false;
      paint();
      return;
    }

    var rem = t.closest('[data-now-remove]');
    if (rem) {
      live = model().removeHabit(live, rem.getAttribute('data-now-remove'));
      paint();
      return;
    }

    var op = t.closest('[data-now-op]');
    if (op) {
      var parts = String(op.getAttribute('data-now-op') || '').split(':');
      if (parts.length >= 2) {
        live = model().toggleHabitOp(live, parts[0], parts[1]);
        paint();
      }
      return;
    }

    var add = t.closest('[data-now-add]');
    if (add) {
      var nameEl = $('nowNewName');
      var name = nameEl ? String(nameEl.value || '').trim() : '';
      live = model().addHabit(live, name || '新情景');
      if (nameEl) nameEl.value = '';
      paint();
      return;
    }

    var more = t.closest('[data-now-need-more]');
    if (more) {
      needsExpanded = !needsExpanded;
      paint();
      return;
    }

    var voice = t.closest('[data-now-voice]');
    if (voice && !voice.disabled) {
      triggerVoice();
    }
  }

  function loadTier(id) {
    tier = id || 's1';
    needsExpanded = false;
    adjustOpen = false;
    live = fixtures().cloneState(tier);
    paint();
  }

  function setView(next, habitId) {
    view = next === 'scenes' ? 'scenes' : 'now';
    focusHabitId = habitId || '';
    if (view === 'now') {
      needsExpanded = false;
    } else {
      adjustOpen = false;
    }
    paint();
  }

  function mount() {
    if (mounted) return;
    root = $(ROOT_ID);
    if (!root) return;
    isDemo = detectDemo();
    ensureLive();
    root.addEventListener('click', onRootClick);
    mounted = true;
    paint();
  }

  function show() {
    mount();
    if (!root) return;
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    var stack = dashboardStack();
    if (stack) {
      stack.hidden = true;
      stack.setAttribute('aria-hidden', 'true');
    }
    visible = true;
    paint();
  }

  function hide() {
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
    var stack = dashboardStack();
    if (stack) {
      stack.hidden = false;
      stack.removeAttribute('aria-hidden');
    }
    visible = false;
  }

  function isVisible() {
    return visible;
  }

  global.OneToneNowHome = {
    mount: mount,
    show: show,
    hide: hide,
    setView: setView,
    loadTier: loadTier,
    isVisible: isVisible,
    paint: paint
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mount();
    });
  } else {
    mount();
  }
})(typeof window !== 'undefined' ? window : globalThis);
