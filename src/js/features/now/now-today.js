/**
 * Now home — today's real actions from action history.
 * Sanitize tech strings for UI; do not invent value-bucket marketing.
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

  var CHANNEL_ZH = {
    camera: '摄像头',
    voice: '语音',
    key: '按键',
    softPad: '软垫',
    system: '系统'
  };

  var KEY_ZH = {
    NP_ENTER: '回车',
    NUMPADENTER: '回车',
    ENTER: '回车',
    RETURN: '回车',
    DOT: '句点',
    PERIOD: '句点',
    COMMA: '逗号',
    SEMICOLON: '分号',
    SPACE: '空格',
    SPACEBAR: '空格',
    TAB: '制表键',
    ESC: 'Esc',
    ESCAPE: 'Esc',
    BS: '退格',
    BACKSPACE: '退格',
    DEL: '删除',
    DELETE: '删除'
  };

  var TECH_DROP =
    /\b(AutoTrigger|vosk|MediaPipe|Win32|NP_[A-Z0-9]+|VK_[A-Z0-9]+|RAlt|LAlt|Ctrl\+V)\b/gi;

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

  function zhKey(raw) {
    var k = String(raw || '').trim();
    if (!k) return '';
    if (KEY_ZH[k]) return KEY_ZH[k];
    var up = k.toUpperCase();
    if (KEY_ZH[up]) return KEY_ZH[up];
    var np = up.match(/^NP_?(ENTER|DOT|PERIOD|[0-9])$/);
    if (np) {
      if (np[1] === 'ENTER') return '回车';
      if (np[1] === 'DOT' || np[1] === 'PERIOD') return '句点';
      if (/^[0-9]$/.test(np[1])) return '数字 ' + np[1];
    }
    if (/^NP[0-9]$/i.test(k)) return '数字 ' + k.slice(-1);
    return '';
  }

  /**
   * Drop tech tokens; map SoftPad key codes; keep human phrases.
   */
  function sanitizeSummary(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    s = s.replace(/SoftPad/gi, '软垫');
    s = s.replace(/→/g, '·');
    // Replace known key codes as whole tokens
    s = s.replace(/\b([A-Za-z][A-Za-z0-9_]*)\b/g, function (tok) {
      var zh = zhKey(tok);
      return zh || tok;
    });
    s = s.replace(TECH_DROP, '');
    s = s.replace(/\s*·\s*·+/g, ' · ');
    s = s.replace(/^\s*·\s*|\s*·\s*$/g, '');
    s = s.replace(/\s{2,}/g, ' ').trim();
    // vosk wake line → keep quoted phrase if any
    var phrase = s.match(/「([^」]+)」/) || s.match(/phrase:\s*([^\s)]+)/i);
    if (/唤醒|wake/i.test(String(raw || '')) && phrase) {
      return '语音 · 说「' + phrase[1] + '」';
    }
    return s;
  }

  function mapEntry(e) {
    var status = String((e && e.status) || '');
    var ch = String((e && e.channel) || '');
    var ts = Number((e && (e.tsMs != null ? e.tsMs : e.ts_ms)) || 0);
    var text = sanitizeSummary(String((e && e.summary) || ''));
    return {
      id: e.id,
      time: fmtTime(ts),
      text: text,
      src: CHANNEL_ICON[ch] || '•',
      channel: ch,
      channelLabel: CHANNEL_ZH[ch] || '',
      ok: status === 'executed',
      actionId: entryActionId(e) || null,
      proactive: ch === 'camera' || /camera_local/i.test(String(e.kind || ''))
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
          var row = mapEntry(e);
          if (!row.text) continue;
          out.push(row);
        }
        return out;
      }
    );
  }

  global.OneToneNowToday = {
    loadToday: loadToday,
    sanitizeSummary: sanitizeSummary,
    zhKey: zhKey,
    CHANNEL_ICON: CHANNEL_ICON,
    CHANNEL_ZH: CHANNEL_ZH,
    mapEntry: mapEntry,
    fmtTime: fmtTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
