(function (global) {
  'use strict';

  var CACHE = { at: 0, hours: 168, byId: {}, lastError: null };
  var TTL_MS = 15000;
  var inflight = null;
  var CHANNELS = ['key', 'voice', 'softPad', 'camera'];

  function t(key, fb) {
    try {
      var v = global.OneToneI18n && global.OneToneI18n.t ? global.OneToneI18n.t(key) : key;
      if (v && v !== key) return v;
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

  function formatRelative(tsMs) {
    if (!(tsMs > 0)) return '—';
    var now = Date.now();
    var d = Math.max(0, now - tsMs);
    if (d < 60000) return t('habitUsageJustNow', '刚刚');
    if (d < 3600000) return t('habitUsageMinsAgo', '{n} 分钟前').replace('{n}', String(Math.floor(d / 60000)));
    if (d < 86400000) return t('habitUsageHoursAgo', '{n} 小时前').replace('{n}', String(Math.floor(d / 3600000)));
    if (d < 86400000 * 7) return t('habitUsageDaysAgo', '{n} 天前').replace('{n}', String(Math.floor(d / 86400000)));
    var dt = new Date(tsMs);
    return dt.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + ' ' +
      dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function channelLabel(channel) {
    var map = {
      key: t('actionHistoryFilterKey', '按键'),
      voice: t('actionHistoryFilterVoice', '语音'),
      softPad: t('actionHistoryFilterSoftPad', 'SoftPad'),
      camera: t('actionHistoryFilterCamera', '摄像头'),
    };
    return map[channel] || channel || '';
  }

  /** Spoken window name from cached hours (7d / 30d / all). */
  function windowSpoken(hours) {
    var h = hours != null ? hours : CACHE.hours || 168;
    if (h <= 168) return t('habitUsageWindowWeek', '近 7 天');
    if (h <= 720) return t('habitUsageWindowMonth', '近 30 天');
    return t('habitUsageWindowAllTime', '一共');
  }

  function exportHint(hours) {
    var h = hours != null ? hours : CACHE.hours || 168;
    if (h <= 168) return t('habitUsageExportHint7d', '导出近 7 天数据');
    if (h <= 720) return t('habitUsageExportHint30d', '导出近 30 天数据');
    return t('habitUsageExportHintAll', '导出全部数据');
  }

  function formatWindowCount(n, hours) {
    if (!(n > 0)) return t('habitUsageNever', '这段时间还没用过');
    return t('habitUsageInWindow', '{window}用了 {n} 次')
      .replace('{window}', windowSpoken(hours))
      .replace('{n}', String(n));
  }

  function formatLastLine(tsMs, channel) {
    if (!(tsMs > 0)) return t('habitUsageLastNever', '还没用过');
    var ch = channelLabel(channel);
    var when = formatRelative(tsMs);
    if (ch) {
      return t('habitUsageLastWithChannel', '上次 · {when} · {channel}')
        .replace('{when}', when)
        .replace('{channel}', ch);
    }
    return t('habitUsageLastOnly', '上次 · {when}').replace('{when}', when);
  }

  function topChannel(byCh) {
    byCh = byCh || {};
    var best = '';
    var bestN = 0;
    CHANNELS.forEach(function (c) {
      var n = byCh[c] || 0;
      if (n > bestN) {
        bestN = n;
        best = c;
      }
    });
    return bestN > 0 ? { id: best, n: bestN } : null;
  }

  function formatMainChannel(byCh) {
    var top = topChannel(byCh);
    if (!top) return '';
    var total = CHANNELS.reduce(function (s, c) { return s + (byCh[c] || 0); }, 0);
    if (total <= 1) return '';
    if (top.n === total) {
      return t('habitUsageOnlyChannel', '都是用{channel}触发的')
        .replace('{channel}', channelLabel(top.id));
    }
    return t('habitUsageMostlyChannel', '多半用{channel}')
      .replace('{channel}', channelLabel(top.id));
  }

  function formatChannelMix(byCh) {
    byCh = byCh || {};
    return CHANNELS
      .filter(function (c) { return (byCh[c] || 0) > 0; })
      .map(function (c) {
        return '<span class="habit-peek-usage-chip is-' + c + '">' +
          esc(channelLabel(c)) + ' ' + (byCh[c] || 0) +
          '</span>';
      })
      .join('');
  }

  // Kept for callers/tests that still expect these names.
  function formatPerDay(perDay) {
    if (!(perDay > 0)) return '—';
    var n = perDay >= 10 ? Math.round(perDay) : Math.round(perDay * 10) / 10;
    return t('habitUsagePerDay', '约 {n} 次/天').replace('{n}', String(n));
  }

  function formatCount(n) {
    if (!(n > 0)) return '—';
    return t('habitUsageCount', '{n} 次').replace('{n}', String(n));
  }

  function rowFor(mappingId) {
    var id = String(mappingId || '').trim();
    if (!id) return null;
    return CACHE.byId[id] || null;
  }

  function applyRows(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.mappingId || r.mappingId === '_unmapped') return;
      map[String(r.mappingId)] = r;
    });
    CACHE.byId = map;
    CACHE.at = Date.now();
  }

  function fetchStats(opts) {
    opts = opts || {};
    var hours = opts.hours != null ? opts.hours : 168;
    var force = !!opts.force;
    if (!force && isFresh(hours)) {
      return Promise.resolve(CACHE.byId);
    }
    if (inflight && !force) return inflight;
    if (!global.OneToneIpc || !global.OneToneIpc.invoke) {
      CACHE.lastError = 'ipc_unavailable';
      return Promise.reject(new Error('ipc_unavailable'));
    }
    inflight = global.OneToneIpc.invoke('cmd_action_history_stats', { hours: hours })
      .then(function (res) {
        if (res && res.error) {
          CACHE.lastError = String(res.error);
          throw new Error(String(res.error));
        }
        CACHE.lastError = null;
        applyRows(res && res.rows);
        CACHE.hours = hours;
        return CACHE.byId;
      })
      .catch(function (err) {
        CACHE.lastError = err && err.message ? String(err.message) : 'failed';
        throw err;
      })
      .finally(function () {
        inflight = null;
      });
    return inflight;
  }

  function isFresh(hours) {
    hours = hours != null ? hours : 168;
    return !!(CACHE.at && Date.now() - CACHE.at < TTL_MS && CACHE.hours === hours);
  }

  /** Table cell: "近 7 天 3 次 · 13 分钟前" */
  function cellHtml(mappingId) {
    var id = String(mappingId || '').trim();
    var row = rowFor(id);
    if (!row || !(row.count > 0)) {
      return '<span class="habit-hub-usage is-empty">' + esc(t('habitUsageNeverShort', '还没用过')) + '</span>';
    }
    var line = t('habitUsageCell', '{window} {n} 次 · {when}')
      .replace('{window}', windowSpoken(CACHE.hours))
      .replace('{n}', String(row.count))
      .replace('{when}', formatRelative(row.lastTsMs));
    return '<button type="button" class="habit-hub-usage-btn" data-habit-usage-peek="' + esc(id) + '" title="' + esc(line) + '">' +
      '<span class="habit-hub-usage-count">' + esc(line) + '</span>' +
      '</button>';
  }

  /** Peek story KPIs — human sentences, not abstract metrics. */
  function kpiHtml(mappingId) {
    var row = rowFor(mappingId);
    var count = row && row.count ? row.count : 0;
    var last = row && row.lastTsMs ? row.lastTsMs : 0;
    var lastCh = row && row.lastChannel ? row.lastChannel : '';
    var byCh = (row && row.byChannel) || {};
    var primary = formatWindowCount(count, CACHE.hours);
    var secondary = formatLastLine(last, lastCh);
    var mostly = formatMainChannel(byCh);
    var chips = formatChannelMix(byCh);
    return '<div class="habit-peek-usage-story">' +
      '<p class="habit-peek-usage-primary">' + esc(primary) + '</p>' +
      (count > 0 ? '<p class="habit-peek-usage-secondary">' + esc(secondary) + '</p>' : '') +
      (mostly ? '<p class="habit-peek-usage-mostly">' + esc(mostly) + '</p>' : '') +
      (chips ? '<div class="habit-peek-usage-chips" aria-hidden="true">' + chips + '</div>' : '') +
      '</div>';
  }

  /** Compact head for novice page. */
  function headKpiHtml(mappingId) {
    var id = String(mappingId || '').trim();
    var row = rowFor(id);
    var count = row && row.count ? row.count : 0;
    var last = row && row.lastTsMs ? row.lastTsMs : 0;
    var lastCh = row && row.lastChannel ? row.lastChannel : '';
    return '<div class="habit-novice-usage">' +
      '<div class="habit-novice-usage-story" aria-label="' + esc(t('habitUsageSection', '最近使用')) + '">' +
      '<p class="habit-novice-usage-primary">' + esc(formatWindowCount(count, CACHE.hours)) + '</p>' +
      (count > 0
        ? '<p class="habit-novice-usage-secondary">' + esc(formatLastLine(last, lastCh)) + '</p>'
        : '') +
      '</div>' +
      (id
        ? '<div class="habit-novice-usage-actions">' +
          '<button type="button" class="habit-novice-usage-link" data-habit-usage-peek="' + esc(id) + '">' +
          esc(t('habitUsageViewLog', '看看记录')) + '</button>' +
          '<button type="button" class="habit-novice-usage-link" data-habit-usage-export="' + esc(id) + '">' +
          esc(t('habitUsageExport', '导出文档')) + '</button>' +
          '</div>'
        : '') +
      '</div>';
  }

  function mappingLabel(mappingId) {
    var id = String(mappingId || '').trim();
    var mappings = (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config &&
      global.OneToneState.state.config.mappings) || [];
    var m = null;
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i] && mappings[i].id === id) { m = mappings[i]; break; }
    }
    if (!m) return id || '—';
    var shared = global.OneToneHabitShared;
    if (shared && shared.appName && shared.sceneName) {
      return shared.appName(m) + ' · ' + shared.sceneName(m);
    }
    return String(m.group || m.label || m.id || '—');
  }

  function overviewHtml(limit) {
    limit = limit > 0 ? limit : 5;
    var rows = Object.keys(CACHE.byId).map(function (id) { return CACHE.byId[id]; })
      .filter(function (r) { return r && r.count > 0; })
      .sort(function (a, b) {
        return (b.count - a.count) || ((b.lastTsMs || 0) - (a.lastTsMs || 0));
      })
      .slice(0, limit);
    var head = '<div class="habit-usage-overview-head">' +
      '<p class="habit-usage-overview-title">' + esc(t('habitUsageOverviewTitle', '近 7 天用过')) + '</p>' +
      '<button type="button" class="habit-usage-export-btn" data-habit-usage-export-all>' +
      esc(t('habitUsageExportAll', '导出全部')) + '</button></div>';
    if (!rows.length) {
      return '<div class="habit-usage-overview is-empty">' + head +
        '<p class="habit-usage-overview-empty">' + esc(t('habitUsageOverviewEmpty', '真正触发按键/语音后会出现在这里')) + '</p>' +
        '</div>';
    }
    var items = rows.map(function (r, i) {
      var meta = t('habitUsageOverviewMeta', '{n} 次 · {when}')
        .replace('{n}', String(r.count))
        .replace('{when}', formatRelative(r.lastTsMs));
      return '<button type="button" class="habit-usage-overview-row" data-habit-usage-rank="' + esc(r.mappingId) + '">' +
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="name" title="' + esc(mappingLabel(r.mappingId)) + '">' + esc(mappingLabel(r.mappingId)) + '</span>' +
        '<span class="meta">' + esc(meta) + '</span>' +
        '</button>';
    }).join('');
    return '<div class="habit-usage-overview">' + head +
      '<div class="habit-usage-overview-list">' + items + '</div>' +
      '</div>';
  }

  function findMapping(mappingId) {
    var id = String(mappingId || '').trim();
    var mappings = (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config &&
      global.OneToneState.state.config.mappings) || [];
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i] && mappings[i].id === id) return mappings[i];
    }
    return null;
  }

  function configLines(m) {
    if (!m) return ['- （未找到场景配置）'];
    var shared = global.OneToneHabitShared;
    var app = shared && shared.appName ? shared.appName(m) : (m.appTargetId || '—');
    var scene = shared && shared.sceneName ? shared.sceneName(m) : (m.group || m.label || m.id);
    return [
      '- 应用：' + app,
      '- 场景：' + scene,
      '- 启用：' + (m.enabled === false ? '否' : '是'),
      '- 按键：' + (m.keyModeEnabled === false ? '关闭' : '开启') +
        (m.triggerKey ? '（触发 ' + m.triggerKey + '）' : ''),
      '- 语音：' + (m.voiceModeEnabled === false ? '关闭' : '开启'),
      '- 摄像头：' + (m.cameraMode === 'off' ? '关闭' : (m.cameraMode || '跟随全局')),
      '- mappingId：`' + m.id + '`',
    ];
  }

  function isoLocal(tsMs) {
    if (!(tsMs > 0)) return '—';
    try { return new Date(tsMs).toLocaleString(); } catch (_) { return String(tsMs); }
  }

  function buildHabitMarkdown(mappingId, entries, hours) {
    var m = findMapping(mappingId);
    var label = mappingLabel(mappingId);
    var row = rowFor(mappingId);
    var count = row && row.count ? row.count : 0;
    var last = row && row.lastTsMs ? row.lastTsMs : 0;
    var lastCh = row && row.lastChannel ? row.lastChannel : '';
    var byCh = (row && row.byChannel) || {};
    var lines = [];
    lines.push('# 习惯使用文档 · ' + label);
    lines.push('');
    lines.push('> 由 OneTone 导出，便于你自行用 ChatGPT / 笔记分析。不含云端 API。');
    lines.push('');
    lines.push('- 导出时间：' + new Date().toLocaleString());
    lines.push('- 统计窗口：' + windowSpoken(hours));
    lines.push('');
    lines.push('## 使用概况');
    lines.push('');
    lines.push('- ' + formatWindowCount(count, hours));
    if (count > 0) {
      lines.push('- ' + formatLastLine(last, lastCh));
      var mostly = formatMainChannel(byCh);
      if (mostly) lines.push('- ' + mostly);
      CHANNELS.forEach(function (c) {
        var n = byCh[c] || 0;
        if (n > 0) lines.push('- ' + channelLabel(c) + '：' + n + ' 次');
      });
    }
    lines.push('');
    lines.push('## 场景配置');
    lines.push('');
    lines = lines.concat(configLines(m));
    lines.push('');
    lines.push('## 最近动作（最多 200 条）');
    lines.push('');
    if (!entries || !entries.length) {
      lines.push('_暂无动作记录_');
    } else {
      lines.push('| 时间 | 通道 | 摘要 |');
      lines.push('| --- | --- | --- |');
      entries.forEach(function (e) {
        var summary = String(e.summary || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
        lines.push(
          '| ' + isoLocal(e.tsMs) +
          ' | ' + channelLabel(e.channel) +
          ' | ' + summary + ' |',
        );
      });
    }
    lines.push('');
    lines.push('## 原始 JSON（可选）');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify({
      mappingId: mappingId,
      hours: hours || CACHE.hours || 168,
      stats: row || null,
      entries: entries || [],
    }, null, 2));
    lines.push('```');
    lines.push('');
    return lines.join('\n');
  }

  function buildAllHabitsMarkdown(hours) {
    var rows = Object.keys(CACHE.byId).map(function (id) { return CACHE.byId[id]; })
      .filter(function (r) { return r && r.count > 0; })
      .sort(function (a, b) {
        return (b.count - a.count) || ((b.lastTsMs || 0) - (a.lastTsMs || 0));
      });
    var lines = [];
    lines.push('# OneTone 习惯使用概览');
    lines.push('');
    lines.push('> 由 OneTone 导出，便于你自行分析。');
    lines.push('');
    lines.push('- 导出时间：' + new Date().toLocaleString());
    lines.push('- 统计窗口：' + windowSpoken(hours));
    lines.push('');
    lines.push('## 排行');
    lines.push('');
    if (!rows.length) {
      lines.push('_这段时间还没有使用记录_');
    } else {
      lines.push('| # | 习惯 | 次数 | 上次 | 主要通道 |');
      lines.push('| --- | --- | --- | --- | --- |');
      rows.forEach(function (r, i) {
        var top = topChannel(r.byChannel || {});
        lines.push(
          '| ' + (i + 1) +
          ' | ' + mappingLabel(r.mappingId).replace(/\|/g, '/') +
          ' | ' + r.count +
          ' | ' + formatRelative(r.lastTsMs) +
          ' | ' + (top ? channelLabel(top.id) : '—') + ' |',
        );
      });
    }
    lines.push('');
    return lines.join('\n');
  }

  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function safeFilename(s) {
    return String(s || 'habit')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '-')
      .slice(0, 48);
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
        return;
      }
    } catch (_) {}
  }

  function exportHabitDoc(mappingId, opts) {
    opts = opts || {};
    var id = String(mappingId || '').trim();
    if (!id) return Promise.reject(new Error('no mappingId'));
    var hours = opts.hours != null ? opts.hours : (CACHE.hours || 168);
    var listP = global.OneToneIpc && global.OneToneIpc.invoke
      ? global.OneToneIpc.invoke('cmd_action_history_list', { limit: 200, mappingId: id, hours: hours })
      : Promise.resolve({ entries: [] });
    return Promise.all([fetchStats({ hours: hours }), listP])
      .then(function (pair) {
        var entries = pair[1] && Array.isArray(pair[1].entries) ? pair[1].entries : [];
        var md = buildHabitMarkdown(id, entries, hours);
        downloadText('onetone-habit-' + safeFilename(mappingLabel(id)) + '.md', md);
        toast(t('habitUsageExportOk', '已导出习惯文档'));
        return true;
      })
      .catch(function (err) {
        toast(t('habitUsageExportFail', '导出失败'));
        throw err;
      });
  }

  function exportAllHabitsDoc(opts) {
    opts = opts || {};
    var hours = opts.hours != null ? opts.hours : (CACHE.hours || 168);
    return fetchStats({ hours: hours, force: !!opts.force })
      .then(function () {
        downloadText('onetone-habits-overview.md', buildAllHabitsMarkdown(hours));
        toast(t('habitUsageExportOk', '已导出习惯文档'));
        return true;
      })
      .catch(function (err) {
        toast(t('habitUsageExportFail', '导出失败'));
        throw err;
      });
  }

  global.OneToneHabitActionStats = {
    fetch: fetchStats,
    isFresh: isFresh,
    rowFor: rowFor,
    cellHtml: cellHtml,
    kpiHtml: kpiHtml,
    headKpiHtml: headKpiHtml,
    overviewHtml: overviewHtml,
    exportHabitDoc: exportHabitDoc,
    exportAllHabitsDoc: exportAllHabitsDoc,
    exportHint: exportHint,
    windowSpoken: windowSpoken,
    lastError: function () { return CACHE.lastError; },
    buildHabitMarkdown: buildHabitMarkdown,
    formatRelative: formatRelative,
    formatPerDay: formatPerDay,
    formatCount: formatCount,
    formatWindowCount: formatWindowCount,
    formatLastLine: formatLastLine,
    channelLabel: channelLabel,
    invalidate: function () { CACHE.at = 0; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
