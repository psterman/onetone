/**
 * Oral command scheme UI — voice settings editor + keys loader.
 * Data: mapping.oralCommandScheme { triggerKey, items }
 */
(function (global) {
  'use strict';

  function t(key, fb) {
    try {
      if (global.OneToneI18n && global.OneToneI18n.t) {
        var s = global.OneToneI18n.t(key);
        if (s && s !== key) return s;
      }
    } catch (_) {}
    return fb != null ? fb : key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function langIsEn() {
    try {
      return (
        global.OneToneI18n &&
        global.OneToneI18n.getLang &&
        String(global.OneToneI18n.getLang()).toLowerCase().indexOf('en') === 0
      );
    } catch (_) {
      return false;
    }
  }

  function config() {
    return (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config) || {};
  }

  function mappingById(id) {
    id = String(id || '').trim();
    if (!id) return null;
    var maps = Array.isArray(config().mappings) ? config().mappings : [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && String(maps[i].id) === id) return maps[i];
    }
    return null;
  }

  function selectedMappingId() {
    var K = global.OneToneKeysChannelCommandPicker;
    if (K && typeof K.activeTriggerMappingId === 'function') {
      var kid = String(K.activeTriggerMappingId() || '').trim();
      if (kid) return kid;
    }
    var st = global.OneToneState && global.OneToneState.state;
    return String((st && (st.selectedMappingId || st.activeSceneId)) || '').trim();
  }

  function activeMapping() {
    return mappingById(selectedMappingId());
  }

  /** UI category for G editor (persists across remount in-session). */
  var oralEditorCat = 'core';

  var ORAL_CATS = [
    { id: 'core', titleKey: 'keysOralGroupCore', titleFb: '核心', hintKey: 'keysOralCatHintCore', hintFb: '默认可说 · 不建议删' },
    { id: 'soft', titleKey: 'keysOralGroupSoft', titleFb: 'Soft 槽', hintKey: 'keysOralCatHintSoft', hintFb: '与屏幕按钮同一动作' },
    { id: 'prompt', titleKey: 'voiceIntentPrompt', titleFb: '一词注入', hintKey: 'keysOralCatHintPrompt', hintFb: '来自本 App 模板' },
    { id: 'bind', titleKey: 'keysOralViaVoiceBind', titleFb: '语音绑定', hintKey: 'keysOralCatHintBind', hintFb: '来自 Agent / 按键绑定' },
    { id: 'extra', titleKey: 'keysOralGroupExtra', titleFb: '已加入', hintKey: 'keysOralCatHintExtra', hintFb: '其它按键命令' }
  ];

  var ORAL_SOFT_SLOTS = [
    {
      id: 'soft:pushToTalk',
      slotId: 'pushToTalk',
      microKeyId: 'ACT10',
      name: '说话',
      desc: '打开听写，把话写进当前输入框',
      auto: '说话、麦克风',
      core: true,
      needsComposer: true
    },
    {
      id: 'soft:stopOrSend',
      slotId: 'stopOrSend',
      microKeyId: 'ACT12',
      name: '发送',
      desc: '提交本轮内容给 Agent',
      auto: '发送',
      core: true,
      needsComposer: true
    },
    {
      id: 'soft:continue',
      slotId: 'continue',
      microKeyId: 'AG02',
      name: '继续',
      desc: '让 Agent 接着上一轮继续干',
      auto: '继续',
      core: false,
      needsComposer: true
    },
    {
      id: 'soft:newThread',
      slotId: 'newThread',
      microKeyId: 'AG01',
      name: '新建对话',
      desc: '开一条新的 Agent 线程',
      auto: '新会话、新建',
      core: false,
      needsComposer: true
    },
    {
      id: 'soft:cancelListen',
      slotId: 'cancelListen',
      microKeyId: 'ACT08',
      name: '取消',
      desc: '退出口头收听，不执行其它动作',
      auto: '取消',
      core: true,
      needsComposer: false
    }
  ];

  function softSlotById(id) {
    for (var i = 0; i < ORAL_SOFT_SLOTS.length; i++) {
      if (ORAL_SOFT_SLOTS[i].id === id) return ORAL_SOFT_SLOTS[i];
    }
    return null;
  }

  /** Soft core default on; optional Soft / prompt / bind need explicit enabled:true. */
  function softDefaultOn(id) {
    var d = softSlotById(id);
    return !!(d && d.core);
  }

  function softListed(ov, id) {
    var d = softSlotById(id);
    if (!d) return false;
    if (d.core) return true;
    return ov && ov.enabled === true;
  }

  function softRowEnabled(ov, id) {
    var d = softSlotById(id);
    if (!d) return false;
    // G: core always on (no toggle); optional soft only when explicitly added.
    if (d.core) return true;
    return !!(ov && ov.enabled === true);
  }

  function oralCatMeta(id) {
    for (var i = 0; i < ORAL_CATS.length; i++) {
      if (ORAL_CATS[i].id === id) return ORAL_CATS[i];
    }
    return ORAL_CATS[0];
  }

  function rowSortVal(items, id, fallback) {
    var ov = items && items[id];
    if (ov && ov.sort != null && isFinite(Number(ov.sort))) return Number(ov.sort);
    return fallback;
  }

  function sortOralRows(rows, items) {
    var buckets = {};
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      r._ord = i;
      if (!buckets[r.source]) buckets[r.source] = [];
      buckets[r.source].push(r);
    }
    var out = [];
    for (i = 0; i < ORAL_CATS.length; i++) {
      var list = buckets[ORAL_CATS[i].id] || [];
      list.sort(function (a, b) {
        return rowSortVal(items, a.id, a._ord) - rowSortVal(items, b.id, b._ord);
      });
      out = out.concat(list);
    }
    return out;
  }

  function ensureOralScheme(m) {
    if (!m) return { items: {}, triggerKey: '' };
    if (!m.oralCommandScheme || typeof m.oralCommandScheme !== 'object') {
      m.oralCommandScheme = { items: {}, triggerKey: '' };
    }
    if (!m.oralCommandScheme.items || typeof m.oralCommandScheme.items !== 'object') {
      m.oralCommandScheme.items = {};
    }
    if (m.oralCommandScheme.triggerKey == null) m.oralCommandScheme.triggerKey = '';
    return m.oralCommandScheme;
  }

  function oralSchemeState(m) {
    var raw = (m && m.oralCommandScheme) || {};
    var items = raw.items && typeof raw.items === 'object' ? raw.items : {};
    return { items: items };
  }

  function persistOralScheme(m, items) {
    if (!m) return;
    var prevKey = String((m.oralCommandScheme && m.oralCommandScheme.triggerKey) || '').trim();
    m.oralCommandScheme = { items: items || {}, triggerKey: prevKey };
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.ensureConfig) {
        global.OneToneConfigPersist.ensureConfig();
      }
      if (global.OneToneConfigPersist && typeof global.OneToneConfigPersist.save === 'function') {
        global.OneToneConfigPersist.save({ source: 'oralCommandScheme' });
      } else if (global.OneToneConfigApi && typeof global.OneToneConfigApi.save === 'function') {
        global.OneToneConfigApi.save();
      }
    } catch (_) {}
  }

  function tokenizeOralSay(v) {
    return String(v || '')
      .split(/[、,，;\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function oralPeerWakeSay(peer) {
    var ov = peer && (peer.voiceOverride || peer.voice_override);
    var wp = ov && (ov.wakePhrases || ov.wake_phrases);
    if (!Array.isArray(wp) || !wp.length) return '';
    return wp
      .map(function (p) {
        return String(p || '').trim();
      })
      .filter(Boolean)
      .join('、');
  }

  function promptTextFromMapping(m) {
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a) continue;
      var ty = String(a.type || a.kind || '')
        .trim()
        .toLowerCase();
      if (ty === 'text' || ty === 'type' || ty === 'string') {
        return String(a.value != null ? a.value : a.text || '');
      }
    }
    return '';
  }

  function isPromptInjectMapping(m) {
    if (!m || !m.id) return false;
    var ref = m.captureHeroRef;
    var kind =
      ref && typeof ref === 'object'
        ? String(ref.kind || '')
            .trim()
            .toLowerCase()
        : '';
    if (kind !== 'prompt') return false;
    var bref = String((ref && ref.bindingRef) || '').trim();
    return bref === String(m.id);
  }

  function listPromptPeersForApp(appId) {
    appId = String(appId || '').trim();
    if (!appId) return [];
    var maps = Array.isArray(config().mappings) ? config().mappings : [];
    var out = [];
    for (var i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m || !isPromptInjectMapping(m)) continue;
      if (String(m.appTargetId || '').trim() !== appId) continue;
      out.push(m);
    }
    return out;
  }

  function stampPromptPeerWakePhrases(peer, phrases) {
    if (!peer) return;
    var list = (phrases || [])
      .map(function (p) {
        return String(p || '').trim();
      })
      .filter(Boolean);
    if (!peer.voiceOverride) peer.voiceOverride = {};
    peer.voiceOverride.wakePhrases = list;
  }

  function writeOralVoiceBindSay(m, bindingRef, say) {
    if (!m || !Array.isArray(m.agentBindings)) return;
    var ref = String(bindingRef || '').trim();
    var phrase = tokenizeOralSay(say).join('、') || String(say || '').trim();
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (!b || b.enabled === false) continue;
      if (String(b.triggerType || b.trigger_type || '').trim() !== 'voice') continue;
      var br = String(b.slotId || b.slot_id || b.bindingRef || b.binding_ref || '').trim();
      if (br !== ref) continue;
      b.triggerBinding = phrase;
      if (b.trigger_binding != null) b.trigger_binding = phrase;
      return;
    }
  }

  function actionLabel(actionId) {
    var store = global.OneToneSemanticActionStore;
    if (store && store.entryMeta) {
      var meta = store.entryMeta(actionId);
      if (meta) {
        if (!langIsEn() && meta.labelZh) return meta.labelZh;
        if (meta.labelEn) return meta.labelEn;
        if (meta.labelZh) return meta.labelZh;
      }
    }
    return String(actionId || '').trim() || '—';
  }

  function canonicalActionId(raw) {
    if (global.OneToneAgentActions && global.OneToneAgentActions.resolveCanonicalActionId) {
      return global.OneToneAgentActions.resolveCanonicalActionId(raw);
    }
    return String(raw || '').trim();
  }

  function normalizeChord(chord) {
    return String(chord || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  function oralTriggerKeyRaw(m) {
    var K = global.OneToneKeysChannelCommandPicker;
    if (K && typeof K.oralTriggerKeyRaw === 'function') return String(K.oralTriggerKeyRaw(m) || '').trim();
    return String((m && m.oralCommandScheme && m.oralCommandScheme.triggerKey) || '').trim();
  }

  function oralTriggerKeyLabel(m) {
    var raw = oralTriggerKeyRaw(m);
    if (!raw) return '';
    try {
      var KL = global.OneToneKeyLabels;
      if (KL && typeof KL.friendlyKeyName === 'function') {
        return String(KL.friendlyKeyName(raw, langIsEn() ? 'en' : 'zh') || raw).trim() || raw;
      }
    } catch (_) {}
    return raw;
  }

  function appDisplayName(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var ab = global.OneToneAppBehaviorRules;
    if (ab && ab.appDisplayName) {
      try {
        return String(ab.appDisplayName(id, null) || id);
      } catch (_) {}
    }
    return id;
  }

  function habitPill(m) {
    var appId = m && String(m.appTargetId || '').trim();
    if (appId && appId !== 'custom') {
      return t('keysVoicePickPillUsing', '正在用') + ' · ' + appDisplayName(appId);
    }
    return t('keysVoicePickPillGeneral', '正在用 · 通用');
  }

  function applyOralWriteback(m, domItems) {
    if (!m || !domItems) return;
    var prev = oralSchemeState(m).items;
    var whitelist = {};
    // Keep optional soft / prompt / bind that were opt-in but currently hidden (enabled false cleanup).
    Object.keys(prev).forEach(function (id) {
      if (domItems[id]) return;
      if (id.indexOf('soft:') === 0) {
        var d = softSlotById(id);
        if (d && !d.core && prev[id] && prev[id].enabled === true) {
          // Was enabled but not in DOM — drop (user removed via add-picker inverse).
        }
        return;
      }
      if (
        (id.indexOf('key:') === 0 || id.indexOf('seq:') === 0 || id.indexOf('agent:') === 0) &&
        prev[id] &&
        prev[id].enabled === true
      ) {
        whitelist[id] = prev[id];
      }
    });
    Object.keys(domItems).forEach(function (id) {
      var it = domItems[id] || {};
      var enabled = it.enabled !== false;
      var say = String(it.say || '').trim();
      if (id.indexOf('soft:') === 0) {
        var slot = softSlotById(id);
        if (slot && !slot.core && !enabled) {
          // Optional soft off → omit (must re-add).
          return;
        }
        whitelist[id] = { enabled: enabled, say: say };
        return;
      }
      if (id.indexOf('prompt:') === 0) {
        if (!enabled) return;
        whitelist[id] = { enabled: true };
        var peer = mappingById(id.slice(7));
        if (peer && isPromptInjectMapping(peer)) {
          stampPromptPeerWakePhrases(peer, tokenizeOralSay(say));
        }
        return;
      }
      if (id.indexOf('bind:') === 0) {
        if (!enabled) return;
        whitelist[id] = { enabled: true };
        writeOralVoiceBindSay(m, id.slice(5), say);
        return;
      }
      if (!enabled) return;
      whitelist[id] = { enabled: true, say: say };
    });
    persistOralScheme(m, whitelist);
  }

  function oralCommandRows(m) {
    var state = oralSchemeState(m);
    var items = state.items;
    var seen = {};
    var out = [];
    var i;
    var appId = String((m && m.appTargetId) || '').trim();

    for (i = 0; i < ORAL_SOFT_SLOTS.length; i++) {
      var d = ORAL_SOFT_SLOTS[i];
      var ov = items[d.id] || {};
      if (!softListed(ov, d.id)) continue;
      var say = ov.say != null && String(ov.say).trim() ? String(ov.say) : d.auto;
      seen[d.id] = 1;
      out.push({
        id: d.id,
        name: d.name,
        desc: d.desc || '',
        auto: d.auto,
        say: say,
        enabled: softRowEnabled(ov, d.id),
        source: d.core ? 'core' : 'soft',
        via: d.core ? t('keysOralGroupCore', '核心') : t('keysOralViaSoft', 'Soft 槽'),
        microKeyId: d.microKeyId || '',
        slotId: d.slotId || '',
        needsComposer: !!d.needsComposer,
        core: !!d.core
      });
    }

    // Prompt / bind: opt-in only (scheme enabled === true).
    Object.keys(items).forEach(function (pid) {
      if (seen[pid]) return;
      if (pid.indexOf('prompt:') !== 0) return;
      var pov = items[pid] || {};
      if (pov.enabled !== true) return;
      var peer = mappingById(pid.slice(7));
      if (!peer || !isPromptInjectMapping(peer)) return;
      var text = String(promptTextFromMapping(peer) || '').trim();
      if (!text) return;
      var wake = oralPeerWakeSay(peer);
      var plabel = String(peer.label || '').trim();
      if (!plabel || plabel === text || plabel.length > 18) {
        plabel = text.length > 18 ? text.slice(0, 18) + '…' : text;
      }
      seen[pid] = 1;
      out.push({
        id: pid,
        name: plabel,
        desc: t('keysOralDescPrompt', '说短词写入一词注入模板'),
        auto: wake || plabel,
        say: wake || plabel,
        enabled: true,
        source: 'prompt',
        via: t('voiceIntentPrompt', '一词注入'),
        needsComposer: false,
        core: false
      });
    });

    var binds = (m && m.agentBindings) || [];
    for (i = 0; i < binds.length; i++) {
      var b = binds[i];
      if (!b || b.enabled === false) continue;
      if (String(b.triggerType || b.trigger_type || '').trim() !== 'voice') continue;
      var ref = String(b.slotId || b.slot_id || b.bindingRef || b.binding_ref || '').trim();
      if (!ref) continue;
      var id = 'bind:' + ref;
      if (seen[id]) continue;
      var ovb = items[id] || {};
      if (ovb.enabled !== true) continue;
      var aid = canonicalActionId(b.actionId || b.action_id || '');
      var bSay = String(b.triggerBinding || b.trigger_binding || '').trim();
      var name = (aid && actionLabel(aid)) || bSay || ref;
      if (!name) continue;
      seen[id] = 1;
      out.push({
        id: id,
        name: name,
        desc: t('keysOralDescBind', '执行已配置的语音绑定动作'),
        auto: bSay || name,
        say: bSay || name,
        enabled: true,
        source: 'bind',
        via: t('keysOralViaVoiceBind', '语音绑定'),
        needsComposer: false,
        core: false
      });
    }

    Object.keys(items).forEach(function (cid) {
      if (seen[cid]) return;
      if (cid.indexOf('key:') !== 0 && cid.indexOf('seq:') !== 0 && cid.indexOf('agent:') !== 0) {
        return;
      }
      var ovc = items[cid] || {};
      if (ovc.enabled !== true) return;
      var cname = String(ovc.say || cid).trim() || cid;
      seen[cid] = 1;
      out.push({
        id: cid,
        name: cname,
        desc: t('keysOralDescExtra', '已加入的按键命令'),
        auto: cname,
        say: String(ovc.say || cname).trim(),
        enabled: true,
        source: 'extra',
        via: t('keysOralViaKey', '按键'),
        needsComposer: false,
        core: false
      });
    });
    return sortOralRows(out, items);
  }

  function oralDupConflicts(rows) {
    var map = {};
    var conflicts = [];
    rows.forEach(function (row) {
      if (!row.enabled) return;
      tokenizeOralSay(row.say).forEach(function (tok) {
        if (!map[tok]) map[tok] = [];
        map[tok].push(row);
      });
    });
    Object.keys(map).forEach(function (tok) {
      if (map[tok].length > 1) conflicts.push({ tok: tok, rows: map[tok] });
    });
    return conflicts;
  }

  function oralCardHtml(row, ri, conflicts, catLen) {
    var edited = String(row.say).trim() !== String(row.auto).trim();
    var isDup = conflicts.some(function (c) {
      return c.rows.some(function (r) {
        return r.id === row.id;
      });
    });
    var sid = 'oral-say-' + String(row.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    var pre =
      row.needsComposer
        ? '<span class="keys-oral-pre" title="' +
          esc(t('voiceOralPreComposer', '需要对准 Agent 输入框')) +
          '">' +
          esc(t('voiceOralPreComposerShort', '需输入框')) +
          '</span>'
        : '<span class="keys-oral-pre is-ok">' +
          esc(t('keysOralReadyAnytime', '随时可用')) +
          '</span>';
    var removeBtn = row.core
      ? ''
      : '<button type="button" class="keys-oral-remove" data-oral-remove="1" title="' +
        esc(t('keysOralRemove', '移除')) +
        '" aria-label="' +
        esc(t('keysOralRemove', '移除')) +
        '">×</button>';
    return (
      '<article class="keys-oral-card' +
      (isDup ? ' is-dup' : '') +
      '" data-oral-card="1" data-oral-id="' +
      esc(row.id) +
      '" data-oral-src="' +
      esc(row.source) +
      '" data-oral-sort="' +
      ri +
      '" style="--oral-i:' +
      ri +
      '">' +
      '<div class="keys-oral-card__row">' +
      '<div class="keys-oral-card__id">' +
      '<strong class="keys-oral-name">' +
      esc(row.name) +
      '</strong>' +
      '<span class="keys-oral-desc">' +
      esc(row.desc || row.via) +
      '</span></div>' +
      pre +
      '<div class="keys-oral-card__acts">' +
      '<button type="button" class="keys-oral-sort__btn" data-oral-up="1" title="' +
      esc(t('keysOralSortUp', '上移')) +
      '"' +
      (ri === 0 ? ' disabled' : '') +
      '>↑</button>' +
      '<button type="button" class="keys-oral-sort__btn" data-oral-down="1" title="' +
      esc(t('keysOralSortDown', '下移')) +
      '"' +
      (ri >= catLen - 1 ? ' disabled' : '') +
      '>↓</button>' +
      removeBtn +
      '</div></div>' +
      '<div class="keys-oral-card__say">' +
      '<label class="keys-oral-say-lb" for="' +
      esc(sid) +
      '">' +
      esc(t('keysOralColSay', '说法')) +
      '</label>' +
      '<input type="text" class="keys-oral-say" id="' +
      esc(sid) +
      '" data-oral-auto="' +
      esc(row.auto) +
      '" value="' +
      esc(row.say) +
      '" placeholder="' +
      esc(t('keysOralSayPlaceholder', '点击修改，多个用顿号分隔')) +
      '" autocomplete="off" spellcheck="false" />' +
      (edited
        ? '<span class="keys-oral-tag is-edit">' + esc(t('keysOralTagEdit', '已改')) + '</span>'
        : '') +
      '</div></article>'
    );
  }

  function enabledSayList(rows) {
    return rows
      .filter(function (r) {
        return r.enabled;
      })
      .map(function (r) {
        return tokenizeOralSay(r.say)[0] || r.name;
      });
  }

  function prerequisiteBanner(m) {
    var appId = String((m && m.appTargetId) || '').trim();
    var appName = appId && appId !== 'custom' ? appDisplayName(appId) : '';
    var bits = [];
    bits.push(
      t('voiceOralPreApp', '先切到目标应用再武装口头收听') + (appName ? '（' + appName + '）' : '')
    );
    bits.push(t('voiceOralPreComposerHint', '发送 / 继续 / 新建 / 说话 需对准 Agent 输入框'));
    return (
      '<div class="keys-oral-prebanner" role="note">' + esc(bits.join(' · ')) + '</div>'
    );
  }

  function removeOralItem(m, id) {
    if (!m || !id) return false;
    var slot = softSlotById(id);
    if (slot && slot.core) return false;
    ensureOralScheme(m);
    var items = Object.assign({}, oralSchemeState(m).items);
    if (!items[id]) return false;
    delete items[id];
    persistOralScheme(m, items);
    return true;
  }

  function renumberCatSort(m, cat, orderedIds) {
    ensureOralScheme(m);
    var items = Object.assign({}, oralSchemeState(m).items);
    orderedIds.forEach(function (oid, i) {
      var prev = items[oid] || {};
      var slot = softSlotById(oid);
      if (oid.indexOf('soft:') === 0) {
        items[oid] = {
          enabled: true,
          say: prev.say != null ? prev.say : (slot && slot.auto) || '',
          sort: i
        };
      } else if (oid.indexOf('prompt:') === 0 || oid.indexOf('bind:') === 0) {
        items[oid] = Object.assign({}, prev, { enabled: true, sort: i });
      } else {
        items[oid] = Object.assign({}, prev, { enabled: true, sort: i });
      }
    });
    persistOralScheme(m, items);
  }

  function shiftOralInCat(m, id, dir) {
    if (!m || !id || !dir) return false;
    var rows = oralCommandRows(m);
    var row = null;
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === id) {
        row = rows[i];
        break;
      }
    }
    if (!row) return false;
    var catRows = rows.filter(function (r) {
      return r.source === row.source;
    });
    var idx = -1;
    for (i = 0; i < catRows.length; i++) {
      if (catRows[i].id === id) {
        idx = i;
        break;
      }
    }
    var j = idx + dir;
    if (idx < 0 || j < 0 || j >= catRows.length) return false;
    var order = catRows.map(function (r) {
      return r.id;
    });
    var tmp = order[idx];
    order[idx] = order[j];
    order[j] = tmp;
    renumberCatSort(m, row.source, order);
    return true;
  }

  function renderOralEditorHtml(m, opts) {
    opts = opts || {};
    m = m || activeMapping();
    ensureOralScheme(m);
    var cat = String(opts.cat || oralEditorCat || 'core').trim() || 'core';
    oralEditorCat = cat;
    var rows = oralCommandRows(m);
    var conflicts = oralDupConflicts(rows);
    var enabledSays = enabledSayList(rows);
    var stripText = enabledSays.length
      ? t('keysOralListenStrip', '可说：{list}').replace(
          '{list}',
          enabledSays.slice(0, 12).join('、') + (enabledSays.length > 12 ? '…' : '')
        )
      : t('keysOralListenEmpty', '暂无启用命令');

    var dupHtml = '';
    if (conflicts.length) {
      var c0 = conflicts[0];
      var names = c0.rows
        .map(function (r) {
          return r.name;
        })
        .join('、');
      dupHtml =
        '<div class="keys-oral-dup" role="alert">' +
        '<span>' +
        esc(
          t('keysOralDupBanner', '「{tok}」同时对应 {names}')
            .replace('{tok}', c0.tok)
            .replace('{names}', names)
        ) +
        '</span>' +
        '<button type="button" class="keys-oral-dup__btn" data-oral-fix="rename">' +
        esc(t('keysOralDupRename', '改回命令名')) +
        '</button>' +
        '<button type="button" class="keys-oral-dup__btn" data-oral-fix="disable">' +
        esc(t('keysOralDupRemove', '移除后者')) +
        '</button></div>';
    }

    var catCounts = {};
    rows.forEach(function (r) {
      catCounts[r.source] = (catCounts[r.source] || 0) + 1;
    });
    var catNav = ORAL_CATS.filter(function (c) {
      return c.id !== 'extra' || catCounts.extra;
    })
      .map(function (c) {
        var n = catCounts[c.id] || 0;
        return (
          '<button type="button" class="keys-oral-cat' +
          (c.id === cat ? ' is-on' : '') +
          '" data-oral-cat="' +
          esc(c.id) +
          '">' +
          esc(t(c.titleKey, c.titleFb)) +
          '<em>' +
          n +
          '</em></button>'
        );
      })
      .join('');

    var meta = oralCatMeta(cat);
    var catRows = rows.filter(function (r) {
      return r.source === cat;
    });
    var cards =
      catRows.length > 0
        ? catRows
            .map(function (r, i) {
              return oralCardHtml(r, i, conflicts, catRows.length);
            })
            .join('')
        : '<div class="keys-oral-empty-cat">' +
          esc(t('keysOralCatEmpty', '这个分类还是空的 · 点右上角添加')) +
          '</div>';

    var addDisabled = cat === 'core';

    return (
      '<div class="keys-oral-page ot-enter" data-oral-page="1" data-oral-mode="editor" data-oral-cat="' +
      esc(cat) +
      '">' +
      prerequisiteBanner(m) +
      '<div class="keys-oral-main keys-oral-main--solo">' +
      '<div class="keys-oral-cats keys-oral-cats--row" role="tablist" aria-label="' +
      esc(t('keysOralCatsLbl', '分类')) +
      '">' +
      catNav +
      '</div>' +
      '<section class="keys-oral-block keys-oral-block--flush">' +
      '<div class="keys-oral-block__row">' +
      '<div>' +
      '<h3 class="keys-oral-block__title">' +
      esc(t(meta.titleKey, meta.titleFb)) +
      '</h3>' +
      '<p class="keys-oral-block__line">' +
      esc(t(meta.hintKey, meta.hintFb)) +
      '</p></div>' +
      '<div class="keys-oral-toolbar keys-oral-toolbar--end">' +
      '<button type="button" class="keys-oral-act is-primary" data-oral-add="1"' +
      (addDisabled
        ? ' disabled title="' + esc(t('keysOralCoreNoAdd', '核心固定，不能从池里加')) + '"'
        : '') +
      '>' +
      esc(t('voiceOralAddBtn', '+ 添加')) +
      '</button>' +
      '<button type="button" class="keys-oral-act" data-oral-regen="unedited" title="' +
      esc(t('keysOralRegenUnedited', '重新生成未改项')) +
      '">' +
      esc(t('keysOralRegenUneditedShort', '重置未改')) +
      '</button></div></div>' +
      dupHtml +
      '<div class="keys-oral-cards" data-oral-cards="1">' +
      cards +
      '</div></section>' +
      '<div class="keys-oral-add-panel" data-oral-add-panel hidden></div>' +
      '</div></div>'
    );
  }

  function renderOralLoaderHtml(m) {
    m = m || activeMapping();
    ensureOralScheme(m);
    var triggerLabel = oralTriggerKeyLabel(m);
    var rows = oralCommandRows(m);
    var enabled = rows.filter(function (r) {
      return r.enabled;
    });
    var enabledSays = enabledSayList(rows);
    var stripText = enabledSays.length
      ? t('keysOralListenStrip', '可说：{list}').replace(
          '{list}',
          enabledSays.slice(0, 8).join('、') + (enabledSays.length > 8 ? '…' : '')
        )
      : t('keysOralListenEmpty', '暂无启用命令');

    var dictKeyRaw = String((m && m.triggerKey) || '').trim();
    var sameAsDict =
      !!triggerLabel &&
      !!dictKeyRaw &&
      normalizeChord(oralTriggerKeyRaw(m)) === normalizeChord(dictKeyRaw);
    var sameWarn = sameAsDict
      ? '<div class="keys-oral-dup" role="status">' +
        esc(
          t(
            'keysOralSameAsDictation',
            '口头键与听写键相同（{key}）：按下会优先开口头收听。请改录一把不同的键。'
          ).replace('{key}', triggerLabel)
        ) +
        '</div>'
      : '';

    var armLine = triggerLabel
      ? t('keysOralArmBound', '按 {key} 开口头收听 · 或 Soft Pad 麦键').replace(
          '{key}',
          triggerLabel
        )
      : t(
          'keysOralArmNeedKey',
          '录制口头触发键（与听写键分开）· 或用 Soft Pad 麦键'
        );

    var dictKeyLabel = '';
    if (dictKeyRaw) {
      try {
        var KL = global.OneToneKeyLabels;
        dictKeyLabel =
          (KL && KL.friendlyKeyName && KL.friendlyKeyName(dictKeyRaw, langIsEn() ? 'en' : 'zh')) ||
          dictKeyRaw;
      } catch (_) {
        dictKeyLabel = dictKeyRaw;
      }
    }

    var armActs =
      (!triggerLabel
        ? '<button type="button" class="keys-oral-act is-primary" data-oral-record-trigger="1">' +
          esc(t('keysOralRecordTrigger', '录制口头触发键')) +
          '</button>'
        : '') +
      (!triggerLabel && dictKeyRaw
        ? '<button type="button" class="keys-oral-act" data-oral-bind-trigger="1">' +
          esc(
            t('keysOralCopyDictationKey', '先用听写键「{key}」做口头').replace(
              '{key}',
              dictKeyLabel
            )
          ) +
          '</button>'
        : '') +
      '<button type="button" class="keys-oral-act' +
      (triggerLabel ? ' is-primary' : '') +
      '" data-go-softpad="1">' +
      esc(t('keysVoiceSchemeMicBtn', 'Soft Pad 麦键')) +
      '</button>';

    var meta = t('voiceOralLoaderMeta', '已启用 {n} 条')
      .replace('{n}', String(enabled.length));

    return (
      '<div class="keys-oral-page ot-enter" data-oral-page="1" data-oral-mode="loader" data-oral-loader="1">' +
      '<section class="keys-oral-block">' +
      '<h3 class="keys-oral-block__title">' +
      esc(t('keysOralArmTitle', '怎么开收听')) +
      '</h3>' +
      '<p class="keys-oral-block__line">' +
      esc(armLine) +
      '</p>' +
      '<div class="keys-oral-head__acts">' +
      armActs +
      '</div>' +
      sameWarn +
      '</section>' +
      '<section class="keys-oral-block">' +
      '<div class="keys-oral-block__row">' +
      '<h3 class="keys-oral-block__title">' +
      esc(t('keysOralCommandsTitle', '可喊的命令')) +
      '</h3>' +
      '<span class="keys-oral-head__pill">' +
      esc(habitPill(m)) +
      '</span></div>' +
      '<p class="keys-oral-block__line">' +
      esc(meta + ' · ' + stripText) +
      '</p>' +
      '<div class="keys-oral-head__acts">' +
      '<button type="button" class="keys-oral-act is-primary" data-oral-go-voice="1">' +
      esc(t('voiceOralGoVoiceEdit', '去语音设置 · 口头命令')) +
      '</button></div>' +
      '<p class="keys-oral-head__hint">' +
      esc(t('voiceOralLoaderHint', '说法与添加命令在语音设置编辑；本页只负责触发键与加载方案。')) +
      '</p></section></div>'
    );
  }

  function addCandidates(m, catFilter) {
    m = m || activeMapping();
    var items = oralSchemeState(m).items;
    var out = [];
    var i;
    var want = catFilter ? String(catFilter) : '';
    for (i = 0; i < ORAL_SOFT_SLOTS.length; i++) {
      var d = ORAL_SOFT_SLOTS[i];
      if (d.core) continue;
      if (want && want !== 'soft') continue;
      var ov = items[d.id] || {};
      if (ov.enabled === true) continue;
      out.push({
        id: d.id,
        name: d.name,
        desc: d.desc || '',
        via: t('keysOralViaSoft', 'Soft 槽'),
        say: d.auto,
        kind: 'soft'
      });
    }
    var appId = String((m && m.appTargetId) || '').trim();
    var peers = appId ? listPromptPeersForApp(appId) : [];
    for (i = 0; i < peers.length; i++) {
      if (want && want !== 'prompt') continue;
      var peer = peers[i];
      if (!peer || !peer.id) continue;
      var pid = 'prompt:' + String(peer.id);
      if (items[pid] && items[pid].enabled === true) continue;
      var text = String(promptTextFromMapping(peer) || '').trim();
      if (!text) continue;
      var plabel = String(peer.label || '').trim();
      if (!plabel || plabel.length > 18) plabel = text.length > 18 ? text.slice(0, 18) + '…' : text;
      out.push({
        id: pid,
        name: plabel,
        desc: t('keysOralDescPrompt', '说短词写入一词注入模板'),
        via: t('voiceIntentPrompt', '一词注入'),
        say: oralPeerWakeSay(peer) || plabel,
        kind: 'prompt'
      });
    }
    var binds = (m && m.agentBindings) || [];
    for (i = 0; i < binds.length; i++) {
      if (want && want !== 'bind' && want !== 'extra') continue;
      var b = binds[i];
      if (!b || b.enabled === false) continue;
      if (String(b.triggerType || b.trigger_type || '').trim() !== 'voice') continue;
      var ref = String(b.slotId || b.slot_id || b.bindingRef || b.binding_ref || '').trim();
      if (!ref) continue;
      var bid = 'bind:' + ref;
      if (items[bid] && items[bid].enabled === true) continue;
      if (want === 'extra') continue;
      var aid = canonicalActionId(b.actionId || b.action_id || '');
      var bSay = String(b.triggerBinding || b.trigger_binding || '').trim();
      var name = (aid && actionLabel(aid)) || bSay || ref;
      out.push({
        id: bid,
        name: name,
        desc: t('keysOralDescBind', '执行已配置的语音绑定动作'),
        via: t('keysOralViaVoiceBind', '语音绑定'),
        say: bSay || name,
        kind: 'bind'
      });
    }
    return out;
  }

  function addOralItems(m, ids) {
    if (!m || !ids || !ids.length) return;
    ensureOralScheme(m);
    var items = Object.assign({}, oralSchemeState(m).items);
    ids.forEach(function (id) {
      id = String(id || '').trim();
      if (!id) return;
      var prev = items[id] || {};
      var sort = prev.sort;
      if (sort == null) {
        var cat = 'soft';
        if (id.indexOf('prompt:') === 0) cat = 'prompt';
        else if (id.indexOf('bind:') === 0) cat = 'bind';
        else if (id.indexOf('soft:') === 0) {
          var sl = softSlotById(id);
          cat = sl && sl.core ? 'core' : 'soft';
        }
        var existing = oralCommandRows(m).filter(function (r) {
          return r.source === cat;
        });
        sort = existing.length;
      }
      if (id.indexOf('soft:') === 0) {
        var d = softSlotById(id);
        items[id] = {
          enabled: true,
          say: prev.say || (d && d.auto) || '',
          sort: sort
        };
        return;
      }
      if (id.indexOf('prompt:') === 0 || id.indexOf('bind:') === 0) {
        items[id] = { enabled: true, sort: sort };
      }
    });
    persistOralScheme(m, items);
  }

  function renderAddPanelHtml(m, catFilter) {
    catFilter = catFilter || oralEditorCat;
    if (catFilter === 'core') {
      return (
        '<div class="keys-oral-add-empty">' +
        esc(t('keysOralCoreNoAdd', '核心固定三项，不能从池里加')) +
        '</div>' +
        '<button type="button" class="keys-oral-act" data-oral-add-close="1">' +
        esc(t('voiceOralAddClose', '关闭')) +
        '</button>'
      );
    }
    var cands = addCandidates(m, catFilter);
    if (!cands.length) {
      return (
        '<div class="keys-oral-add-empty">' +
        esc(t('voiceOralAddEmpty', '没有可添加的命令')) +
        '</div>' +
        '<button type="button" class="keys-oral-act" data-oral-add-close="1">' +
        esc(t('voiceOralAddClose', '关闭')) +
        '</button>'
      );
    }
    var list = cands
      .map(function (c) {
        return (
          '<button type="button" class="keys-oral-add-opt" data-oral-add-one="' +
          esc(c.id) +
          '">' +
          '<span class="keys-oral-add-name">' +
          esc(c.name) +
          '</span>' +
          '<span class="keys-oral-add-desc">' +
          esc(c.desc || c.via) +
          '</span>' +
          '<span class="keys-oral-add-via">' +
          esc(c.via) +
          '</span></button>'
        );
      })
      .join('');
    return (
      '<div class="keys-oral-add-title">' +
      esc(t('voiceOralAddTitleCat', '添加到本分类')) +
      '</div>' +
      '<div class="keys-oral-add-list">' +
      list +
      '</div>' +
      '<div class="keys-oral-head__acts">' +
      '<button type="button" class="keys-oral-act" data-oral-add-close="1">' +
      esc(t('voiceOralAddClose', '关闭')) +
      '</button></div>'
    );
  }

  function openVoiceOralSettings() {
    try {
      if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
        global.OneToneSettingsDrawer.open({ panel: 'voiceWake' });
      }
    } catch (_) {}
    setTimeout(function () {
      try {
        if (global.OneToneVoiceIntentRail && global.OneToneVoiceIntentRail.setIntent) {
          global.OneToneVoiceIntentRail.setIntent('oral', { persist: true });
        }
      } catch (_) {}
    }, 80);
  }

  function bindOralTriggerTap(m) {
    if (!m) return false;
    var raw = String(m.triggerKey || '').trim();
    if (!raw) return false;
    var K = global.OneToneKeysChannelCommandPicker;
    if (K && typeof K.setOralTriggerKey === 'function') return !!K.setOralTriggerKey(m, raw);
    ensureOralScheme(m);
    m.oralCommandScheme.triggerKey = raw;
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
        global.OneToneConfigPersist.save({ source: 'oralTriggerKey' });
      }
    } catch (_) {}
    return true;
  }

  function wireOralEditorEvents(root, opts) {
    opts = opts || {};
    if (!root || root.__oralWired) return;
    root.__oralWired = true;
    var mid = opts.mappingId || selectedMappingId();

    function refresh() {
      if (typeof opts.onRefresh === 'function') {
        opts.onRefresh();
        return;
      }
      mountEditor(root.parentElement || root, { mappingId: mid, cat: oralEditorCat });
    }

    function saveVisibleSays() {
      var m = mappingById(mid);
      if (!m) return;
      ensureOralScheme(m);
      var items = Object.assign({}, oralSchemeState(m).items);
      root.querySelectorAll('[data-oral-card][data-oral-id]').forEach(function (card) {
        var id = card.getAttribute('data-oral-id');
        var input = card.querySelector('.keys-oral-say');
        if (!id || !input) return;
        var say = String(input.value || '').trim();
        var prev = items[id] || {};
        var sort =
          card.getAttribute('data-oral-sort') != null
            ? Number(card.getAttribute('data-oral-sort'))
            : prev.sort;
        if (id.indexOf('soft:') === 0) {
          items[id] = {
            enabled: true,
            say: say,
            sort: sort
          };
          return;
        }
        if (id.indexOf('prompt:') === 0) {
          items[id] = Object.assign({}, prev, { enabled: true, sort: sort });
          var peer = mappingById(id.slice(7));
          if (peer && isPromptInjectMapping(peer)) {
            stampPromptPeerWakePhrases(peer, tokenizeOralSay(say));
          }
          return;
        }
        if (id.indexOf('bind:') === 0) {
          items[id] = Object.assign({}, prev, { enabled: true, sort: sort });
          writeOralVoiceBindSay(m, id.slice(5), say);
          return;
        }
        items[id] = Object.assign({}, prev, { enabled: true, say: say, sort: sort });
      });
      persistOralScheme(m, items);
    }

    root.addEventListener('mousedown', function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains('keys-oral-say')) {
        ev.stopPropagation();
      }
    });

    root.addEventListener('click', function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains('keys-oral-say')) {
        ev.stopPropagation();
      }
      var catBtn = ev.target.closest && ev.target.closest('[data-oral-cat]');
      if (catBtn && root.contains(catBtn)) {
        oralEditorCat = catBtn.getAttribute('data-oral-cat') || 'core';
        saveVisibleSays();
        refresh();
        return;
      }
      var addBtn = ev.target.closest && ev.target.closest('[data-oral-add]');
      if (addBtn && root.contains(addBtn) && !addBtn.disabled) {
        var panel = root.querySelector('[data-oral-add-panel]');
        if (panel) {
          panel.hidden = false;
          panel.innerHTML = renderAddPanelHtml(mappingById(mid), oralEditorCat);
        }
        return;
      }
      var addClose = ev.target.closest && ev.target.closest('[data-oral-add-close]');
      if (addClose && root.contains(addClose)) {
        var p0 = root.querySelector('[data-oral-add-panel]');
        if (p0) {
          p0.hidden = true;
          p0.innerHTML = '';
        }
        return;
      }
      var addOne = ev.target.closest && ev.target.closest('[data-oral-add-one]');
      if (addOne && root.contains(addOne)) {
        var oneId = addOne.getAttribute('data-oral-add-one');
        saveVisibleSays();
        addOralItems(mappingById(mid), [oneId]);
        refresh();
        return;
      }
      var addOk = ev.target.closest && ev.target.closest('[data-oral-add-confirm]');
      if (addOk && root.contains(addOk)) {
        var ids = [];
        root.querySelectorAll('[data-oral-add-id]:checked').forEach(function (cb) {
          ids.push(cb.getAttribute('data-oral-add-id'));
        });
        saveVisibleSays();
        addOralItems(mappingById(mid), ids);
        refresh();
        return;
      }
      var up = ev.target.closest && ev.target.closest('[data-oral-up]');
      if (up && root.contains(up) && !up.disabled) {
        var upCard = up.closest('[data-oral-id]');
        if (upCard) {
          saveVisibleSays();
          shiftOralInCat(mappingById(mid), upCard.getAttribute('data-oral-id'), -1);
          refresh();
        }
        return;
      }
      var down = ev.target.closest && ev.target.closest('[data-oral-down]');
      if (down && root.contains(down) && !down.disabled) {
        var downCard = down.closest('[data-oral-id]');
        if (downCard) {
          saveVisibleSays();
          shiftOralInCat(mappingById(mid), downCard.getAttribute('data-oral-id'), 1);
          refresh();
        }
        return;
      }
      var rm = ev.target.closest && ev.target.closest('[data-oral-remove]');
      if (rm && root.contains(rm)) {
        var rmCard = rm.closest('[data-oral-id]');
        if (rmCard) {
          saveVisibleSays();
          removeOralItem(mappingById(mid), rmCard.getAttribute('data-oral-id'));
          refresh();
        }
        return;
      }
      var regen = ev.target.closest && ev.target.closest('[data-oral-regen]');
      if (regen && root.contains(regen)) {
        var mode = regen.getAttribute('data-oral-regen');
        root.querySelectorAll('.keys-oral-say').forEach(function (input) {
          var auto = input.getAttribute('data-oral-auto') || '';
          if (mode === 'all' || String(input.value || '').trim() === auto) {
            input.value = auto;
          }
        });
        saveVisibleSays();
        refresh();
        return;
      }
      var fix = ev.target.closest && ev.target.closest('[data-oral-fix]');
      if (fix && root.contains(fix)) {
        var kind = fix.getAttribute('data-oral-fix');
        var dupCards = root.querySelectorAll('.keys-oral-card.is-dup');
        if (kind === 'rename' && dupCards[1]) {
          var inp = dupCards[1].querySelector('.keys-oral-say');
          if (inp) inp.value = inp.getAttribute('data-oral-auto') || '';
          saveVisibleSays();
        }
        if (kind === 'disable' && dupCards[1]) {
          var rid = dupCards[1].getAttribute('data-oral-id');
          saveVisibleSays();
          removeOralItem(mappingById(mid), rid);
        }
        refresh();
      }
    });

    function paintSayTag(input) {
      var wrap = input.closest('.keys-oral-card__say') || input.parentElement;
      var tag = wrap && wrap.querySelector('.keys-oral-tag');
      var auto = input.getAttribute('data-oral-auto') || '';
      var edited = String(input.value || '').trim() !== auto;
      if (edited && !tag && wrap) {
        tag = document.createElement('span');
        tag.className = 'keys-oral-tag is-edit';
        tag.textContent = t('keysOralTagEdit', '已改');
        wrap.appendChild(tag);
      } else if (edited && tag) {
        tag.textContent = t('keysOralTagEdit', '已改');
        tag.classList.add('is-edit');
      } else if (!edited && tag) {
        tag.remove();
      }
    }

    // Don't persist on every keystroke — avoids remount/focus loss from config save side-effects.
    root.addEventListener('input', function (ev) {
      if (!ev.target.classList || !ev.target.classList.contains('keys-oral-say')) return;
      paintSayTag(ev.target);
    });
    root.addEventListener('change', function (ev) {
      if (!ev.target.classList || !ev.target.classList.contains('keys-oral-say')) return;
      paintSayTag(ev.target);
      saveVisibleSays();
    });
    root.addEventListener('focusout', function (ev) {
      if (!ev.target.classList || !ev.target.classList.contains('keys-oral-say')) return;
      saveVisibleSays();
    });
  }

  function wireOralLoaderEvents(root, opts) {
    opts = opts || {};
    if (!root || root.__oralLoaderWired) return;
    root.__oralLoaderWired = true;
    var mid = opts.mappingId || selectedMappingId();

    function refresh() {
      if (typeof opts.onRefresh === 'function') {
        opts.onRefresh();
        return;
      }
      mountLoader(root.parentElement || root, { mappingId: mid });
    }

    root.addEventListener('click', function (ev) {
      var goVoice = ev.target.closest && ev.target.closest('[data-oral-go-voice]');
      if (goVoice && root.contains(goVoice)) {
        ev.preventDefault();
        openVoiceOralSettings();
        return;
      }
      var recTrig = ev.target.closest && ev.target.closest('[data-oral-record-trigger]');
      if (recTrig && root.contains(recTrig)) {
        ev.preventDefault();
        try {
          var Rec = global.OneToneMappingRecording;
          if (Rec && typeof Rec.startTrigger === 'function') Rec.startTrigger(mid);
        } catch (_) {}
        return;
      }
      var bindTrig = ev.target.closest && ev.target.closest('[data-oral-bind-trigger]');
      if (bindTrig && root.contains(bindTrig)) {
        ev.preventDefault();
        if (bindOralTriggerTap(mappingById(mid))) {
          try {
            if (global.OneToneAppToast && global.OneToneAppToast.show) {
              global.OneToneAppToast.show(
                t(
                  'keysOralBindTriggerDone',
                  '已把听写键复制为口头触发键；听写键仍独立，可在听写页改'
                ),
                'ok'
              );
            }
          } catch (_) {}
          refresh();
        }
        return;
      }
      var goPad = ev.target.closest && ev.target.closest('[data-go-softpad]');
      if (goPad && root.contains(goPad)) {
        ev.preventDefault();
        try {
          if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
            global.OneToneSettingsDrawer.open({ panel: 'softPad' });
          }
        } catch (_) {}
      }
    });
  }

  function mountEditor(host, opts) {
    opts = opts || {};
    if (!host) return null;
    var mid = opts.mappingId || selectedMappingId();
    if (opts.cat) oralEditorCat = String(opts.cat);
    // Keep caret if this remount interrupted an active say edit.
    var active = global.document && global.document.activeElement;
    var keepId = '';
    var keepVal = '';
    var keepSel = null;
    if (active && active.classList && active.classList.contains('keys-oral-say') && host.contains(active)) {
      keepId = String(active.id || '');
      keepVal = String(active.value || '');
      try {
        keepSel = { start: active.selectionStart, end: active.selectionEnd };
      } catch (_) {}
    }
    var m = mappingById(mid);
    host.innerHTML = renderOralEditorHtml(m, { cat: oralEditorCat });
    var page = host.querySelector('[data-oral-page]');
    wireOralEditorEvents(page, {
      mappingId: mid,
      onRefresh: function () {
        mountEditor(host, { mappingId: mid, cat: oralEditorCat });
      }
    });
    if (keepId) {
      var again = null;
      try {
        again = host.querySelector('[id="' + keepId.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]');
      } catch (_) {
        again = host.querySelector('#' + keepId);
      }
      if (again) {
        again.value = keepVal;
        try {
          again.focus();
          if (keepSel) again.setSelectionRange(keepSel.start, keepSel.end);
        } catch (_) {}
      }
    }
    return page;
  }

  function mountLoader(host, opts) {
    opts = opts || {};
    if (!host) return null;
    var mid = opts.mappingId || selectedMappingId();
    var m = mappingById(mid);
    host.innerHTML = renderOralLoaderHtml(m);
    var page = host.querySelector('[data-oral-page]');
    wireOralLoaderEvents(page, {
      mappingId: mid,
      onRefresh: function () {
        mountLoader(host, opts);
      }
    });
    return page;
  }

  global.OneToneOralCommandUi = {
    ORAL_SOFT_SLOTS: ORAL_SOFT_SLOTS,
    ORAL_CATS: ORAL_CATS,
    softDefaultOn: softDefaultOn,
    oralCommandRows: oralCommandRows,
    applyOralWriteback: applyOralWriteback,
    persistOralScheme: persistOralScheme,
    tokenizeOralSay: tokenizeOralSay,
    renderOralEditorHtml: renderOralEditorHtml,
    renderOralLoaderHtml: renderOralLoaderHtml,
    wireOralEditorEvents: wireOralEditorEvents,
    wireOralLoaderEvents: wireOralLoaderEvents,
    mountEditor: mountEditor,
    mountLoader: mountLoader,
    addOralItems: addOralItems,
    removeOralItem: removeOralItem,
    shiftOralInCat: shiftOralInCat,
    addCandidates: addCandidates,
    openVoiceOralSettings: openVoiceOralSettings,
    ensureOralScheme: ensureOralScheme
  };
})(typeof window !== 'undefined' ? window : globalThis);
