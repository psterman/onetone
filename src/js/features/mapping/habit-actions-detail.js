/**
 * Habit 「动作与入口」 full page (habitView=actions).
 */
(function (global) {
  'use strict';

  var HOST_ID = 'habitActionsDetailHost';

  function t(k, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(k);
      if (v && v !== k) return v;
    }
    return fb || k;
  }

  function ui() {
    return (global.OneToneState && global.OneToneState.ui) || {};
  }

  function ensureHost() {
    var panel = document.getElementById('settingsPanelHabits');
    if (!panel) return null;
    var host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement('section');
    host.id = HOST_ID;
    host.className = 'habit-actions-detail';
    host.hidden = true;
    panel.appendChild(host);
    return host;
  }

  function mapping() {
    var id = global.OneToneState && global.OneToneState.selectedMappingId;
    if (!id) return null;
    var cfg = global.OneToneState.cfg;
    if (!cfg || !cfg.mappings) return null;
    for (var i = 0; i < cfg.mappings.length; i++) {
      if (cfg.mappings[i].id === id) return cfg.mappings[i];
    }
    return null;
  }

  function open(mappingId) {
    if (global.OneToneState) {
      if (mappingId) global.OneToneState.selectedMappingId = mappingId;
      ui().habitView = 'actions';
    }
    render();
  }

  function close() {
    ui().habitView = 'hub';
    var host = document.getElementById(HOST_ID);
    if (host) host.hidden = true;
    if (global.OneToneHabitHub && global.OneToneHabitHub.render) {
      global.OneToneHabitHub.render();
    }
  }

  function groupByAction(views) {
    var map = {};
    (views || []).forEach(function (v) {
      var id = v.actionId || v.action_id;
      if (!id) return;
      if (!map[id]) map[id] = [];
      map[id].push(v);
    });
    return map;
  }

  function render() {
    var host = ensureHost();
    if (!host) return;
    var m = mapping();
    if (!m) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var hub = document.getElementById('habitHubView');
    if (hub) hub.hidden = true;
    host.innerHTML =
      '<header class="had-header">' +
      '<button type="button" class="had-back" id="hadBack">' +
      t('hadBack', '← 我的习惯') +
      '</button>' +
      '<h2 class="had-title">' +
      escapeHtml(m.name || m.id) +
      '</h2>' +
      '<p class="had-sub">' +
      t('hadSub', '同一个动作，可以由多个入口触发') +
      '</p>' +
      '</header>' +
      '<div class="had-body" id="hadBody">' +
      t('hadLoading', '加载中…') +
      '</div>' +
      '<div class="had-footer">' +
      '<button type="button" class="had-add" id="hadAdd">' +
      t('hadAdd', '添加控制动作') +
      '</button>' +
      '</div>';
    document.getElementById('hadBack').onclick = close;
    document.getElementById('hadAdd').onclick = function () {
      if (!global.OneToneSemanticActionPicker) return;
      var store = global.OneToneSemanticActionStore;
      global.OneToneSemanticActionPicker.open({
        mappingId: m.id,
        placement: 'habitDetail',
        onSelect: function (sel) {
          if (!sel || !sel.actionId) return;
          var meta = store && store.entryMeta ? store.entryMeta(sel.actionId) : null;
          var channels = (meta && meta.channels) || [];
          // Prefer catalog channels; fall back to picker channel if single.
          var allowed = ['key', 'voice', 'camera', 'softPad'].filter(function (ch) {
            return channels.indexOf(ch) >= 0;
          });
          if (!allowed.length && sel.channel) allowed = [sel.channel];
          if (!allowed.length) allowed = ['key'];

          function go(ch) {
            if (global.OneToneActionNav) {
              global.OneToneActionNav.openChannelEditor({
                mappingId: m.id,
                channel: ch,
                actionId: sel.actionId,
                bindingRef: null
              });
            }
          }

          if (allowed.length === 1) {
            go(allowed[0]);
            return;
          }
          // Lightweight channel chooser (no new page).
          var labels = {
            key: t('hadChKey', '快捷键'),
            voice: t('hadChVoice', '语音'),
            camera: t('hadChCamera', '摄像头'),
            softPad: t('hadChSoftPad', 'Soft Pad')
          };
          var pick = window.prompt(
            t('hadPickChannel', '选择入口') +
              ':\n' +
              allowed
                .map(function (ch, i) {
                  return i + 1 + '. ' + (labels[ch] || ch);
                })
                .join('\n'),
            '1'
          );
          var idx = parseInt(pick, 10) - 1;
          if (isNaN(idx) || idx < 0 || idx >= allowed.length) {
            // Also accept channel id typed directly.
            var typed = String(pick || '').trim();
            if (allowed.indexOf(typed) >= 0) go(typed);
            return;
          }
          go(allowed[idx]);
        }
      });
    };
    var store = global.OneToneSemanticActionStore;
    if (!store) return;
    store.ensureCatalog().then(function () {
      return store.bindingViews(m.id);
    }).then(function (views) {
      var body = document.getElementById('hadBody');
      if (!body) return;
      var grouped = groupByAction(views);
      var ids = Object.keys(grouped);
      if (!ids.length) {
        body.innerHTML =
          '<p class="had-empty">' + t('hadEmpty', '尚未绑定动作。点下方添加。') + '</p>';
        return;
      }
      var en = global.OneToneI18n && global.OneToneI18n.getLang && global.OneToneI18n.getLang() === 'en';
      body.innerHTML = ids
        .map(function (aid) {
          var meta = store.entryMeta(aid);
          var label = meta ? (en ? meta.labelEn : meta.labelZh) : aid;
          var chips = grouped[aid]
            .map(function (v) {
              var ch = v.channel || '';
              var trig = v.trigger || '';
              return (
                '<button type="button" class="had-chip" data-channel="' +
                escapeHtml(ch) +
                '" data-action="' +
                escapeHtml(aid) +
                '" data-ref="' +
                escapeHtml(v.slotId || v.bindingRef || '') +
                '">[' +
                escapeHtml(ch) +
                ' ' +
                escapeHtml(trig) +
                ']</button>'
              );
            })
            .join(' ');
          return (
            '<div class="had-row">' +
            '<div class="had-row-title">' +
            escapeHtml(label) +
            (meta ? ' · ' + escapeHtml(meta.risk) : '') +
            '</div>' +
            '<div class="had-chips">' +
            chips +
            '</div></div>'
          );
        })
        .join('');
      body.querySelectorAll('.had-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (global.OneToneActionNav) {
            global.OneToneActionNav.openChannelEditor({
              mappingId: m.id,
              channel: btn.getAttribute('data-channel'),
              actionId: btn.getAttribute('data-action'),
              bindingRef: btn.getAttribute('data-ref') || null
            });
          }
        });
      });
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function syncVisibility() {
    var host = document.getElementById(HOST_ID);
    var isActions = (ui().habitView || '') === 'actions';
    if (host) host.hidden = !isActions;
    var hub = document.getElementById('habitHubView');
    if (hub && isActions) hub.hidden = true;
  }

  global.OneToneHabitActionsDetail = {
    open: open,
    close: close,
    render: render,
    syncVisibility: syncVisibility
  };
})(typeof window !== 'undefined' ? window : globalThis);
