/**
 * Shared action-catalog filters for menus (Camera / Soft Pad / Keys).
 * Authority stays BindingViews + agentBindings; this only rejects mismatches.
 */
(function (global) {
  'use strict';

  var MAX_CHANNEL_TRIGGERS_KEEP = 3;

  function t(key, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fb != null ? fb : key;
  }

  function canonicalActionId(token) {
    var A = global.OneToneAgentActions;
    var s = String(token || '');
    if (s.indexOf('agent:') === 0) {
      var raw = s.slice(6);
      if (A && A.resolveCanonicalActionId) return A.resolveCanonicalActionId(raw);
      return raw;
    }
    if (A && A.resolveCanonicalActionId) return A.resolveCanonicalActionId(s);
    if (s === 'pressEsc') return 'input.cancel';
    if (s === 'pressCtrlI') return 'input.start';
    return s;
  }

  function normalizeChannel(ch) {
    var s = String(ch || '').trim();
    if (s === 'key' || s === 'keys') return 'key';
    if (s === 'voice' || s === 'voiceWake') return 'voice';
    if (s === 'softPad' || s === 'softpad' || s === 'soft_pad') return 'softPad';
    if (s === 'camera' || s === 'cam') return 'camera';
    if (s === 'cursor') return 'cursor';
    return s;
  }

  function channelLabel(ch) {
    ch = normalizeChannel(ch);
    if (ch === 'key') return t('cameraPickerChKey', '按键');
    if (ch === 'voice') return t('cameraPickerChVoice', '口头指令');
    if (ch === 'softPad') return t('cameraPickerChSoftPad', '屏幕按钮');
    if (ch === 'camera') return t('cameraPickerChCamera', '摄像头');
    if (ch === 'cursor') return t('keysChannelTabCursor', '软件自带');
    return ch;
  }

  function hintAliases(aid) {
    var id = String(aid || '').trim();
    if (!id) return [];
    var out = [id];
    var canon = canonicalActionId(id);
    if (canon && out.indexOf(canon) < 0) out.push(canon);
    if (id.indexOf('agent:') === 0 && out.indexOf(id.slice(6)) < 0) out.push(id.slice(6));
    if (id.indexOf('.') < 0) {
      var dotted = 'agent.' + id;
      if (out.indexOf(dotted) < 0) out.push(dotted);
    }
    return out;
  }

  function isMultiShortcutAction(token) {
    return canonicalActionId(token) === 'app.shortcut';
  }

  function isMultiInstance(aid) {
    var adapters = global.OneToneActionBindingAdapters;
    if (adapters && adapters.isMultiInstance) return !!adapters.isMultiInstance(aid);
    return canonicalActionId(aid) === 'app.shortcut';
  }

  /** Build per-action hint buckets from BindingViews (or compatible rows). */
  function buildCrossHintMap(views, mappingId) {
    var map = {};
    (views || []).forEach(function (v) {
      if (!v) return;
      if (v.enabled === false) return;
      var raw = String(v.actionId || v.action_id || '').trim();
      if (!raw) return;
      var ch = normalizeChannel(v.channel);
      if (!ch || ch === 'camera') return;
      var trig = String(v.trigger || v.bindingRef || v.binding_ref || '').trim();
      var canon = canonicalActionId(raw);
      var multi = isMultiInstance(canon);
      var inst = String(v.actionInstanceId || v.action_instance_id || '').trim();
      var primaryKey = multi ? canon + '::' + (inst || trig || 'x') : canon;
      var rec = map[primaryKey];
      if (!rec) {
        rec = { aid: canon, current: [], other: [] };
        map[primaryKey] = rec;
        if (!multi) {
          hintAliases(raw).forEach(function (k) {
            if (!map[k]) map[k] = rec;
            else if (map[k].aid && map[k].aid !== canon) {
              /* alias collision — keep first owner */
            } else map[k] = rec;
          });
        }
      }
      var onCurrent = String(v.mappingId || v.mapping_id || mappingId) === String(mappingId);
      var bucket = onCurrent ? rec.current : rec.other;
      var dup = false;
      for (var i = 0; i < bucket.length; i++) {
        if (bucket[i].channel === ch && bucket[i].trigger === trig) {
          dup = true;
          break;
        }
      }
      if (dup) return;
      if (onCurrent) bucket.push({ channel: ch, trigger: trig });
      else
        bucket.push({
          mappingLabel: String(v.mappingLabel || v.mapping_label || ''),
          channel: ch,
          trigger: trig
        });
    });
    return map;
  }

  function lookupHint(token, hintMap) {
    if (!hintMap || token == null || token === '') return null;
    var id = canonicalActionId(token);
    if (hintMap[id]) return hintMap[id];
    var raw = String(token || '');
    if (hintMap[raw]) return hintMap[raw];
    if (raw.indexOf('agent:') === 0 && hintMap[raw.slice(6)]) return hintMap[raw.slice(6)];
    var aliases = hintAliases(raw);
    for (var i = 0; i < aliases.length; i++) {
      var hit = hintMap[aliases[i]];
      if (hit && (!hit.aid || hit.aid === id || hit.aid === aliases[i])) return hit;
    }
    return null;
  }

  function channelTriggerRows(token, hintMap, channel) {
    var hint = lookupHint(token, hintMap);
    if (!hint || !hint.current) return [];
    var want = normalizeChannel(channel);
    return hint.current.filter(function (e) {
      return !want || normalizeChannel(e.channel) === want;
    });
  }

  /** True when action is cleanly bound on channel (rejects dumps / app.shortcut piles). */
  function tokenBoundOnChannel(token, hintMap, channel) {
    if (isMultiShortcutAction(token)) return false;
    var rows = channelTriggerRows(token, hintMap, channel);
    if (!rows.length) return false;
    if (rows.length > MAX_CHANNEL_TRIGGERS_KEEP) return false;
    return true;
  }

  function channelCounts(hintMap) {
    var counts = { key: 0, voice: 0, softPad: 0 };
    var seenRec = [];
    Object.keys(hintMap || {}).forEach(function (aid) {
      var rec = hintMap[aid];
      if (!rec || seenRec.indexOf(rec) >= 0) return;
      seenRec.push(rec);
      if (rec.aid === 'app.shortcut') return;
      var cur = rec.current || [];
      var byCh = {};
      cur.forEach(function (e) {
        var ch = normalizeChannel(e.channel);
        if (counts[ch] == null) return;
        if (!byCh[ch]) byCh[ch] = [];
        byCh[ch].push(e);
      });
      Object.keys(byCh).forEach(function (ch) {
        if (byCh[ch].length > MAX_CHANNEL_TRIGGERS_KEEP) return;
        counts[ch] += 1;
      });
    });
    return counts;
  }

  function formatCrossHint(token, hintMap, channelTab) {
    var hint = lookupHint(token, hintMap);
    if (!hint || !hint.current || !hint.current.length) return '';
    var want = normalizeChannel(channelTab);
    var rows = hint.current.filter(function (e) {
      return !want || normalizeChannel(e.channel) === want;
    });
    if (!rows.length) return '';
    if (want) {
      var primary = rows[0].trigger || '—';
      if (rows.length === 1) return primary;
      return primary + ' +' + String(rows.length - 1);
    }
    var seenCh = {};
    var out = [];
    rows.forEach(function (e) {
      var ch = normalizeChannel(e.channel);
      if (!ch || seenCh[ch]) return;
      seenCh[ch] = true;
      out.push(
        t('cameraPickerHintFmt', '已在{ch} {trig}')
          .replace('{ch}', channelLabel(ch))
          .replace('{trig}', e.trigger || '—')
      );
    });
    return out.join(' · ');
  }

  /** Filter BindingViews for one mapping × optional channel (menus / capability map). */
  function filterViewsForMenu(views, opts) {
    opts = opts || {};
    var mid = String(opts.mappingId || '').trim();
    var ch = normalizeChannel(opts.channel || '');
    var out = [];
    var hintMap = buildCrossHintMap(views, mid);
    (views || []).forEach(function (v) {
      if (!v || v.enabled === false) return;
      if (mid && String(v.mappingId || v.mapping_id || '') !== mid) return;
      var vch = normalizeChannel(v.channel);
      if (ch && vch !== ch) return;
      if (ch === 'camera') {
        out.push(v);
        return;
      }
      if (ch && !tokenBoundOnChannel(v.actionId || v.action_id, hintMap, ch)) return;
      out.push(v);
    });
    return out;
  }

  global.OneToneActionCatalogFilter = {
    MAX_CHANNEL_TRIGGERS_KEEP: MAX_CHANNEL_TRIGGERS_KEEP,
    normalizeChannel: normalizeChannel,
    channelLabel: channelLabel,
    canonicalActionId: canonicalActionId,
    buildCrossHintMap: buildCrossHintMap,
    lookupHint: lookupHint,
    channelTriggerRows: channelTriggerRows,
    tokenBoundOnChannel: tokenBoundOnChannel,
    channelCounts: channelCounts,
    formatCrossHint: formatCrossHint,
    filterViewsForMenu: filterViewsForMenu,
    isMultiShortcutAction: isMultiShortcutAction
  };
})(typeof window !== 'undefined' ? window : globalThis);
