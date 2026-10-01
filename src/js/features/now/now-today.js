/**
 * Now home — today's real actions from action history.
 * Backend already ships user-language `summary`; do NOT re-translate here.
 */
(function (global) {
  'use strict';

  var CHANNEL_ICON = {
    camera: '👁',
    voice: '🎤',
    key: '⌨️',
    softPad: '●',
    system: '⚙'
  };

  var BUCKET_LABEL = {
    interrupt: '减少打断',
    restore: '恢复环境',
    privacy: '保护隐私',
    status: '提醒状态'
  };

  var INTERRUPT_IDS = {
    'agent.interrupt': 1,
    'onetone.pause': 1,
    'input.cancel': 1,
    'input.pause': 1
  };

  var RESTORE_IDS = {
    'onetone.resume': 1,
    'agent.continue': 1,
    'agent.focus': 1,
    'workspace.applyLayout': 1
  };

  var STATUS_IDS = {
    'status.read': 1,
    'agent.status': 1
  };

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return Promise.resolve(null);
    return ipc.invoke(cmd, args || {}).catch(function () {
      return null;
    });
  }

  function fmtTime(tsMs) {
    var n = Number(tsMs) || 0;
    if (!(n > 0)) return '—';
    var d = new Date(n);
    try {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      var h = d.getHours();
      var m = d.getMinutes();
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }
  }

  function entryActionId(e) {
    if (!e) return '';
    return String(e.actionId || e.action_id || '').trim();
  }

  function entrySummary(e) {
    return String((e && e.summary) || '');
  }

  /**
   * channel + action_id + summary → value bucket.
   * Unmatched → status (keeps four-bucket sum == entry count).
   */
  function bucketOf(entry) {
    var id = entryActionId(entry);
    var sum = entrySummary(entry);
    var ch = String((entry && entry.channel) || '');

    if (INTERRUPT_IDS[id] || /打断|暂停|取消/.test(sum)) return 'interrupt';
    if (RESTORE_IDS[id] || /恢复|还原/.test(sum)) return 'restore';
    if (
      /privacy|遮罩|离开保护|保护隐私/i.test(id + ' ' + sum) ||
      (ch === 'camera' && /隐私|遮罩|离开|保护/.test(sum))
    ) {
      return 'privacy';
    }
    if (STATUS_IDS[id]) return 'status';
    return 'status';
  }

  function summarizeBuckets(entries) {
    var out = { total: 0, interrupt: 0, restore: 0, privacy: 0, status: 0 };
    var list = Array.isArray(entries) ? entries : [];
    for (var i = 0; i < list.length; i++) {
      var b = bucketOf(list[i]);
      out.total += 1;
      if (out[b] != null) out[b] += 1;
      else out.status += 1;
    }
    return out;
  }

  function mapEntry(e) {
    var status = String((e && e.status) || '');
    var ch = String((e && e.channel) || '');
    var ts = Number((e && (e.tsMs != null ? e.tsMs : e.ts_ms)) || 0);
    return {
      id: e.id,
      time: fmtTime(ts),
      text: entrySummary(e),
      src: CHANNEL_ICON[ch] || '•',
      channel: ch,
      ok: status === 'executed',
      actionId: entryActionId(e) || null,
      bucket: bucketOf(e)
    };
  }

  function loadToday(hours) {
    var h = hours != null ? hours : 14;
    return invoke('cmd_action_history_list', { limit: 200, hours: h }).then(
      function (res) {
        var entries = (res && res.entries) || [];
        var out = [];
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (!e) continue;
          var st = String(e.status || '');
          if (st !== 'executed' && st !== 'pendingConfirmation') continue;
          out.push(mapEntry(e));
        }
        return out;
      }
    );
  }

  global.OneToneNowToday = {
    loadToday: loadToday,
    CHANNEL_ICON: CHANNEL_ICON,
    BUCKET_LABEL: BUCKET_LABEL,
    bucketOf: bucketOf,
    summarizeBuckets: summarizeBuckets,
    mapEntry: mapEntry,
    fmtTime: fmtTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
