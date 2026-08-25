/**
 * Workspace layouts — save current window arrangement, list, apply, auto-on-enter.
 * Uses document-level delegation so React island remounts keep working.
 */
(function (global) {
  'use strict';

  var $ = function (id) {
    return global.OneToneDom && global.OneToneDom.$ ? global.OneToneDom.$(id) : document.getElementById(id);
  };
  var bound = false;
  var busy = false;
  var cachedLayouts = [];

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && global.OneToneI18n.t) {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback || key;
  }

  function toast(msg, kind) {
    if (global.OneToneAppToast && global.OneToneAppToast.show) {
      try {
        global.OneToneAppToast.show(msg, kind || 'info');
        return;
      } catch (_) {}
    }
    if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
      try {
        global.OneToneUiFeedback.toast(msg);
      } catch (_) {}
    }
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return Promise.resolve(ipc.invoke(cmd, args || {}));
    }
    return Promise.reject(new Error('IPC unavailable'));
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function st() {
    if (global.OneToneState && global.OneToneState.state) return global.OneToneState.state;
    if (global.OneToneApp && global.OneToneApp.state) return global.OneToneApp.state;
    return global.__otState || null;
  }

  function layoutsFromState() {
    if (cachedLayouts.length) return cachedLayouts.slice();
    var s = st();
    var list = (s && s.config && s.config.workspaceLayouts) || [];
    return Array.isArray(list) ? list.slice() : [];
  }

  function setLayouts(list) {
    cachedLayouts = Array.isArray(list) ? list.slice() : [];
    var s = st();
    if (s) {
      if (!s.config) s.config = {};
      s.config.workspaceLayouts = cachedLayouts;
    }
  }

  function upsertLocal(layout) {
    if (!layout || !layout.id) return;
    var list = layoutsFromState();
    var i = list.findIndex(function (x) {
      return x && x.id === layout.id;
    });
    if (i >= 0) list[i] = layout;
    else list.push(layout);
    setLayouts(list);
  }

  function removeLocal(id) {
    setLayouts(
      layoutsFromState().filter(function (x) {
        return x && x.id !== id;
      })
    );
  }

  var NOISE_EXE = {
    'applicationframehost.exe': 1,
    'systemsettings.exe': 1,
    'textinputhost.exe': 1,
    'shellexperiencehost.exe': 1,
    'searchhost.exe': 1,
    'startmenuexperiencehost.exe': 1,
    'searchapp.exe': 1,
    'runtimebroker.exe': 1,
    'dwm.exe': 1,
    'explorer.exe': 1,
    'onetone.exe': 1
  };

  function exeBase(name) {
    return String(name || '')
      .split(/[/\\]/)
      .pop()
      .toLowerCase();
  }

  function isNoiseExe(name) {
    return !!NOISE_EXE[exeBase(name)];
  }

  function cleanCompanions(list, anchor) {
    var anchorKey = exeBase(anchor);
    return (list || [])
      .map(function (x) {
        return String(x || '').trim();
      })
      .filter(function (x) {
        var n = exeBase(x);
        return x && n !== anchorKey && !isNoiseExe(n);
      });
  }

  function formatTime(ms) {
    var n = Number(ms) || 0;
    if (!n) return '—';
    try {
      return new Date(n).toLocaleString();
    } catch (_) {
      return String(n);
    }
  }

  function applyResultToast(res) {
    if (!res) return;
    var total =
      (res.restoredCount || 0) +
      ((res.failed && res.failed.length) || 0) +
      ((res.skipped && res.skipped.length) || 0);
    var msg = t('workspaceLayoutRestored', '已恢复 {name}（{ok}/{total} 个窗口）')
      .replace('{name}', res.layoutName || '')
      .replace('{ok}', String(res.restoredCount || 0))
      .replace('{total}', String(total || res.restoredCount || 0));
    if (res.failed && res.failed.length) {
      msg += ' · ' + t('workspaceLayoutFailed', '失败') + ': ' + res.failed.join(', ');
    } else if (res.skipped && res.skipped.length) {
      msg += ' · ' + t('workspaceLayoutSkipped', '未找到') + ': ' + res.skipped.join(', ');
    }
    toast(msg, res.ok ? 'scheme' : 'warn');
  }

  function isSelfFg(fg) {
    var exe = String((fg && (fg.exeName || fg.exe_name)) || '')
      .split(/[/\\]/)
      .pop()
      .toLowerCase();
    return !exe || exe === 'onetone.exe';
  }

  function anchorPreferenceScore(name) {
    var n = exeBase(name);
    if (n === 'cursor.exe') return 100;
    if (n === 'code.exe' || n === 'devenv.exe' || n === 'windsurf.exe') return 80;
    if (n.indexOf('chrome') >= 0 || n.indexOf('msedge') >= 0 || n.indexOf('firefox') >= 0) return 15;
    if (n.indexOf('typeless') >= 0 || n.indexOf('notepad') >= 0) return 1;
    return 10;
  }

  function pickAnchorWindow(wins) {
    var best = null;
    var bestScore = -1;
    (wins || []).forEach(function (w, i) {
      if (!w || isNoiseExe(w.processName)) return;
      var score = anchorPreferenceScore(w.processName) * 1000 - (Number(w.zOrder) || i);
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    });
    return best;
  }

  function refreshAnchorLabel() {
    var el = $('workspaceLayoutCurrentAnchor');
    if (!el) return;
    Promise.all([
      invoke('cmd_foreground_app', {}).catch(function () {
        return null;
      }),
      invoke('cmd_workspace_list_windows', {}).catch(function () {
        return [];
      })
    ]).then(function (pair) {
      var fg = pair[0];
      var wins = Array.isArray(pair[1]) ? pair[1] : [];
      if (!isSelfFg(fg) && fg) {
        el.textContent = fg.displayName || fg.exeName || fg.exe_name || '—';
        return;
      }
      var w = pickAnchorWindow(wins);
      if (w) {
        el.textContent =
          (w.displayName || w.processName || '外部窗口') +
          t('workspaceLayoutAnchorWhileOneTone', ' · OneTone 在前台，保存将优先以此为锚点');
        return;
      }
      el.textContent = t('workspaceLayoutNoExternal', '没有可锚定的外部窗口');
    });
  }

  function renderList() {
    var host = $('workspaceLayoutListHost');
    if (!host) return;
    var list = layoutsFromState();
    if (!list.length) {
      host.innerHTML =
        '<p class="pref-row-desc" style="padding:8px 0">' +
        esc(t('workspaceLayoutEmpty', '还没有保存的布局。排好窗口后点保存；用时先开齐应用再点立即恢复。')) +
        '</p>';
      return;
    }
    host.innerHTML = list
      .map(function (item) {
        var auto = item.autoApply === 'onEnterAnchorApp';
        var slots = (item.slots || []).filter(function (s) {
          return s && !isNoiseExe(s.processName);
        }).length;
        var companions =
          cleanCompanions(item.companionApps, item.anchorApp).join(', ') || '—';
        return (
          '<div class="pref-row" data-wl-id="' +
          esc(item.id) +
          '" style="align-items:flex-start">' +
          '<div class="pref-row-meta" style="flex:1">' +
          '<p class="pref-row-label">' +
          esc(item.name || item.anchorApp || '工作区') +
          '</p>' +
          '<p class="pref-row-desc">' +
          esc(item.anchorApp || '') +
          ' · ' +
          slots +
          ' 窗 · ' +
          esc(formatTime(item.savedAt)) +
          '<br/>companions: ' +
          esc(companions) +
          '</p>' +
          '<label style="display:inline-flex;gap:6px;align-items:center;margin-top:6px;font-size:12px">' +
          '<input type="checkbox" data-wl-auto="' +
          esc(item.id) +
          '"' +
          (auto ? ' checked' : '') +
          '/>' +
          esc(t('workspaceLayoutAuto', '进入该应用时自动摆位（不开软件）')) +
          '</label>' +
          '</div>' +
          '<div class="pref-row-control" style="display:flex;flex-direction:column;gap:6px">' +
          '<button type="button" class="control-btn" data-wl-apply="' +
          esc(item.id) +
          '">' +
          esc(t('workspaceLayoutApply', '立即恢复')) +
          '</button>' +
          '<button type="button" class="control-btn" data-wl-overwrite="' +
          esc(item.id) +
          '">' +
          esc(t('workspaceLayoutOverwrite', '覆盖保存')) +
          '</button>' +
          '<button type="button" class="control-btn" data-wl-delete="' +
          esc(item.id) +
          '">' +
          esc(t('workspaceLayoutDelete', '删除')) +
          '</button>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function syncFromBackend() {
    return invoke('cmd_workspace_list_layouts', {})
      .then(function (list) {
        setLayouts(list);
        renderList();
      })
      .catch(function () {
        renderList();
      });
  }

  function saveLayout(opts) {
    opts = opts || {};
    if (busy) return Promise.resolve();
    busy = true;
    return invoke('cmd_workspace_save', {
      name: opts.name || null,
      id: opts.id || null,
      anchorApp: opts.anchorApp || null,
      autoApply: opts.autoApply !== false
    })
      .then(function (layout) {
        if (layout && layout.id) upsertLocal(layout);
        toast(
          t('workspaceLayoutSaved', '已保存工作区布局') +
            (layout && layout.slots
              ? ' · ' +
                layout.slots.length +
                ' 窗：' +
                layout.slots
                  .map(function (s) {
                    return (s && (s.processName || s.displayName)) || '';
                  })
                  .filter(Boolean)
                  .join(', ')
              : ''),
          'scheme'
        );
        renderList();
        return syncFromBackend();
      })
      .catch(function (err) {
        var msg = String((err && (err.message || err)) || '');
        if (msg.indexOf('unsupported_platform') >= 0) {
          toast(t('workspaceLayoutUnsupported', '当前平台暂不支持工作区布局'), 'warn');
        } else if (msg.indexOf('no_foreground_app') >= 0) {
          toast(t('workspaceLayoutNoFg', '请先切到目标应用再保存'), 'warn');
        } else if (msg.indexOf('no_windows') >= 0) {
          toast(t('workspaceLayoutNoWindows', '没有可保存的外部窗口'), 'warn');
        } else {
          toast(t('workspaceLayoutSaveFail', '保存失败') + ': ' + msg, 'warn');
        }
      })
      .finally(function () {
        busy = false;
      });
  }

  function onSaveClick() {
    if (busy) return;
    busy = true;
    var existing = layoutsFromState();
    invoke('cmd_workspace_snapshot', { autoApply: false })
      .then(function (draft) {
        busy = false;
        if (!draft || !draft.anchorApp) {
          toast(t('workspaceLayoutNoFg', '请先切到目标应用再保存'), 'warn');
          return;
        }
        var exe = String(draft.anchorApp || '').trim();
        var hit = existing.find(function (x) {
          return (
            x &&
            String(x.anchorApp || (x.anchorMatch && x.anchorMatch.processName) || '').toLowerCase() ===
              exe.toLowerCase()
          );
        });
        var name = draft.name || exe + ' 工作区';
        if (hit) {
          var overwrite = window.confirm(
            t(
              'workspaceLayoutOverwriteConfirm',
              '该锚定应用已有布局「{name}」。确定覆盖？取消则另存为新布局。'
            ).replace('{name}', hit.name || hit.anchorApp || '')
          );
          if (overwrite) {
            return saveLayout({
              id: hit.id,
              name: hit.name || name,
              anchorApp: exe,
              autoApply: true
            });
          }
        }
        var typed = window.prompt(t('workspaceLayoutNamePrompt', '布局名称'), name);
        if (typed === null) return;
        return saveLayout({
          name: String(typed || name).trim() || name,
          anchorApp: exe,
          autoApply: true
        });
      })
      .catch(function (err) {
        busy = false;
        var msg = String((err && (err.message || err)) || '');
        if (msg.indexOf('unsupported_platform') >= 0) {
          toast(t('workspaceLayoutUnsupported', '当前平台暂不支持工作区布局'), 'warn');
        } else if (msg.indexOf('no_foreground_app') >= 0) {
          toast(t('workspaceLayoutNoFg', '请先切到目标应用（或从该应用切回再保存）'), 'warn');
        } else if (msg.indexOf('no_windows') >= 0) {
          toast(t('workspaceLayoutNoWindows', '没有可保存的外部窗口'), 'warn');
        } else {
          toast(t('workspaceLayoutSaveFail', '保存失败') + ': ' + msg, 'warn');
        }
      });
  }

  function onApplyCurrentClick() {
    if (busy) return;
    busy = true;
    invoke('cmd_workspace_apply_current_anchor', {})
      .then(function (res) {
        applyResultToast(res);
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || '');
        if (msg.indexOf('layout_not_found') >= 0) {
          toast(t('workspaceLayoutNoneForFg', '当前前台应用没有已保存布局'), 'warn');
        } else {
          toast(t('workspaceLayoutApplyFail', '恢复失败') + ': ' + msg, 'warn');
        }
      })
      .finally(function () {
        busy = false;
      });
  }

  function onHostClick(ev) {
    var tEl = ev.target;
    if (!tEl || !tEl.closest) return;
    var applyBtn = tEl.closest('[data-wl-apply]');
    var delBtn = tEl.closest('[data-wl-delete]');
    var owBtn = tEl.closest('[data-wl-overwrite]');
    if (applyBtn) {
      var applyId = applyBtn.getAttribute('data-wl-apply');
      if (!applyId || busy) return;
      busy = true;
      invoke('cmd_workspace_apply', { layoutId: applyId })
        .then(function (res) {
          applyResultToast(res);
        })
        .catch(function (err) {
          var msg = String((err && err.message) || err || '');
          if (msg.indexOf('monitor_fingerprint_mismatch') >= 0) {
            toast(t('workspaceLayoutMonitorChanged', '显示器变了，请手动重新保存布局'), 'warn');
          } else {
            toast(t('workspaceLayoutApplyFail', '恢复失败') + ': ' + msg, 'warn');
          }
        })
        .finally(function () {
          busy = false;
        });
      return;
    }
    if (owBtn) {
      var owId = owBtn.getAttribute('data-wl-overwrite');
      var hit = layoutsFromState().find(function (x) {
        return x && x.id === owId;
      });
      if (!hit) return;
      if (!window.confirm(t('workspaceLayoutOverwriteNow', '用当前桌面覆盖该布局？'))) return;
      saveLayout({
        id: hit.id,
        name: hit.name,
        anchorApp: hit.anchorApp,
        autoApply: true
      });
      return;
    }
    if (delBtn) {
      var delId = delBtn.getAttribute('data-wl-delete');
      if (!delId) return;
      if (!window.confirm(t('workspaceLayoutDeleteConfirm', '删除该布局？'))) return;
      invoke('cmd_workspace_delete', { layoutId: delId })
        .then(function () {
          removeLocal(delId);
          renderList();
          toast(t('workspaceLayoutDeleted', '已删除'), 'scheme');
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'delete failed'), 'warn');
        });
    }
  }

  function onHostChange(ev) {
    var tEl = ev.target;
    if (!tEl || !tEl.getAttribute) return;
    var id = tEl.getAttribute('data-wl-auto');
    if (!id) return;
    var enabled = !!tEl.checked;
    invoke('cmd_workspace_set_auto_apply', { layoutId: id, enabled: enabled })
      .then(function (layout) {
        if (layout && layout.id) upsertLocal(layout);
        return syncFromBackend();
      })
      .catch(function (err) {
        tEl.checked = !enabled;
        toast(String((err && err.message) || err || 'auto apply failed'), 'warn');
      });
  }

  function onDocClick(ev) {
    var tEl = ev.target;
    if (!tEl || !tEl.closest) return;
    if (tEl.closest('#workspaceLayoutSaveBtn')) {
      onSaveClick();
      return;
    }
    if (tEl.closest('#workspaceLayoutApplyCurrentBtn')) {
      onApplyCurrentClick();
      return;
    }
    if (tEl.closest('#workspaceLayoutListHost')) {
      onHostClick(ev);
    }
  }

  function onDocChange(ev) {
    var tEl = ev.target;
    if (!tEl || !tEl.closest) return;
    if (tEl.closest('#workspaceLayoutListHost')) {
      onHostChange(ev);
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', onDocClick);
    document.addEventListener('change', onDocChange);
  }

  function render() {
    bind();
    refreshAnchorLabel();
    syncFromBackend();
  }

  global.OneToneWorkspaceLayoutUi = {
    render: render,
    refresh: render
  };
})(typeof window !== 'undefined' ? window : globalThis);
