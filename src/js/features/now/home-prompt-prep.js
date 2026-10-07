/**
 * Home Prompt prep desk — materials + draft + staged handoff.
 * Deterministic assembly only (no LLM). Honest handoff receipts.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'onetone.homePromptPrep';
  var STATES = ['EMPTY', 'COLLECTING', 'ASSEMBLED', 'CHANNEL_SELECTED', 'HANDING_OFF', 'HANDED_OFF'];

  var hostEl = null;
  /** @type {HTMLElement|null} Actual host node we bound; identity check for idempotent mount. */
  var mountedHost = null;
  var drawerKeysBound = false;
  var drawerReturnFocus = null;
  /** @type {'channel'|'handoff'|null} */
  var openDrawerKind = null;
  var model = loadModel();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function nowIso() {
    try {
      return new Date().toISOString();
    } catch (_) {
      return String(Date.now());
    }
  }

  function loadModel() {
    var empty = {
      phase: 'EMPTY',
      materials: [],
      draft: { title: '', body: '' },
      channel: null,
      receipt: null,
      assembledMd: '',
      assembledAt: null
    };
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return empty;
      if (STATES.indexOf(parsed.phase) < 0) parsed.phase = 'EMPTY';
      if (!Array.isArray(parsed.materials)) parsed.materials = [];
      parsed.draft = parsed.draft || { title: '', body: '' };
      return parsed;
    } catch (_) {
      return empty;
    }
  }

  function saveModel() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
      }
    } catch (_) {}
  }

  function derivePhase() {
    if (model.phase === 'HANDING_OFF' || model.phase === 'HANDED_OFF') return model.phase;
    if (model.phase === 'CHANNEL_SELECTED' && model.channel) return 'CHANNEL_SELECTED';
    if (model.phase === 'ASSEMBLED' && model.assembledMd) return 'ASSEMBLED';
    if (model.materials.length) return 'COLLECTING';
    return 'EMPTY';
  }

  function setPhase(p) {
    model.phase = p;
    saveModel();
  }

  function uid() {
    return 'm_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4);
  }

  function addMaterial(item) {
    item = item || {};
    var row = {
      id: uid(),
      kind: item.kind || 'text',
      name: item.name || '未命名素材',
      description: item.description || '',
      source: item.source || 'local',
      path: item.path || '',
      content: item.content || '',
      capturedAt: item.capturedAt || nowIso(),
      citeMode: item.citeMode || 'full', // full | summary | excerpt | pathOnly | skip
      included: item.included !== false,
      note: item.note || '',
      protect: Array.isArray(item.protect) ? item.protect : [],
      needsManualUpload: !!item.needsManualUpload
    };
    model.materials.push(row);
    if (model.phase === 'EMPTY' || model.phase === 'COLLECTING') setPhase('COLLECTING');
    else if (model.phase === 'ASSEMBLED' || model.phase === 'CHANNEL_SELECTED') {
      // New material after assemble → back to collecting until re-assemble
      model.assembledMd = '';
      model.channel = null;
      model.receipt = null;
      setPhase('COLLECTING');
    }
    saveModel();
    paint();
  }

  function truncateSummary(text, max) {
    max = max || 240;
    var s = String(text || '').trim();
    if (!s) return '';
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
  }

  function citeBlock(m) {
    var mode = m.citeMode || 'full';
    if (mode === 'skip') return null;
    var lines = [];
    lines.push('### ' + (m.name || '素材'));
    lines.push('- 来源: ' + (m.source || 'local'));
    lines.push('- 采集时间: ' + (m.capturedAt || '未知'));
    if (m.path) lines.push('- 路径: `' + m.path + '`');
    if (m.protect && m.protect.length) {
      lines.push('- 保护边界: ' + m.protect.join(', '));
    }
    if (m.note) lines.push('- 用户说明: ' + m.note);
    lines.push('- 引用方式: ' + mode);
    if (mode === 'pathOnly') {
      lines.push('');
      lines.push('（只引用路径，不附正文）');
    } else if (mode === 'summary') {
      var sum = m.userSummary || truncateSummary(m.content || m.description, 240);
      lines.push('');
      lines.push(sum ? sum : '尚无摘要');
    } else if (mode === 'excerpt') {
      lines.push('');
      lines.push(truncateSummary(m.content || m.description, 400) || '（无片段）');
    } else {
      lines.push('');
      if (m.content) lines.push(m.content);
      else if (m.path) lines.push('（本地文件，正文未内联；路径见上）');
      else lines.push(m.description || '（无正文）');
    }
    return lines.join('\n');
  }

  /** Deterministic mechanical assembly — no LLM. */
  function assembleMarkdown() {
    var included = model.materials.filter(function (m) {
      return m.included !== false && m.citeMode !== 'skip';
    });
    var excluded = model.materials.filter(function (m) {
      return m.included === false || m.citeMode === 'skip';
    });
    var title =
      (model.draft && model.draft.title) ||
      (model.materials[0] && model.materials[0].name) ||
      '首次沟通简报';
    var body = (model.draft && model.draft.body) || '';
    var parts = [];
    parts.push('# ' + title);
    parts.push('');
    parts.push('> 按当前设置机械装订，没有使用 LLM 改写或总结。');
    parts.push('');
    if (body) {
      parts.push(body);
      parts.push('');
    }
    parts.push('## 已带入的材料');
    parts.push('');
    included.forEach(function (m) {
      var block = citeBlock(m);
      if (block) {
        parts.push(block);
        parts.push('');
      }
    });
    if (excluded.length) {
      parts.push('## 未带入');
      parts.push('');
      excluded.forEach(function (m) {
        parts.push('- ' + (m.name || '素材') + '（' + (m.citeMode === 'skip' ? '不发送' : '未引用') + '）');
      });
      parts.push('');
    }
    var md = parts.join('\n').trim() + '\n';
    var chars = md.length;
    var tokensApprox = Math.max(1, Math.round(chars / 4));
    model.assembledMd = md;
    model.assembledAt = nowIso();
    model.assemblyMeta = {
      collected: model.materials.length,
      included: included.length,
      excluded: excluded.length,
      chars: chars,
      tokensApprox: tokensApprox
    };
    if (!model.draft.title) model.draft.title = title;
    setPhase('ASSEMBLED');
    return md;
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return ipc.invoke(cmd, args || {});
  }

  function pickPath(kind) {
    return invoke('cmd_pick_path', { kind: kind || 'file' }).then(function (res) {
      var path = (res && (res.path || res.value || res)) || '';
      return String(path || '').trim();
    });
  }

  function readClipboard() {
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.readText === 'function') {
      return clip.readText().then(function (t) {
        return String(t || '');
      });
    }
    return Promise.resolve('');
  }

  function writeClipboard(text) {
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      return clip.writeText(String(text || ''));
    }
    return Promise.reject(new Error('no_clipboard'));
  }

  function toast(msg) {
    if (global.OneToneAppToast && global.OneToneAppToast.show) {
      try {
        global.OneToneAppToast.show(msg, 'scheme');
        return;
      } catch (_) {}
    }
    try {
      console.info('[HomePromptPrep]', msg);
    } catch (_) {}
  }

  function openAddMenu(btn) {
    var menu = hostEl && hostEl.querySelector('[data-hpp-add-menu]');
    if (!menu) return;
    menu.hidden = !menu.hidden;
    if (btn) btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  }

  function closeAddMenu() {
    var menu = hostEl && hostEl.querySelector('[data-hpp-add-menu]');
    if (menu) menu.hidden = true;
  }

  function onAdd(kind) {
    closeAddMenu();
    if (kind === 'file' || kind === 'folder') {
      pickPath(kind)
        .then(function (path) {
          if (!path) {
            toast('未选择路径');
            return;
          }
          var leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
          addMaterial({
            kind: kind,
            name: leaf,
            path: path,
            source: '本机' + (kind === 'folder' ? '文件夹' : '文件'),
            description: path,
            citeMode: kind === 'folder' ? 'pathOnly' : 'full'
          });
          toast('材料已加入');
        })
        .catch(function () {
          toast('无法打开路径选择器（需桌面版）');
        });
      return;
    }
    if (kind === 'paste') {
      readClipboard().then(function (text) {
        if (!String(text || '').trim()) {
          toast('剪贴板为空');
          return;
        }
        addMaterial({
          kind: 'text',
          name: '粘贴的文本',
          content: text,
          source: '剪贴板',
          description: truncateSummary(text, 80),
          citeMode: 'full'
        });
        toast('材料已加入');
      });
      return;
    }
    if (kind === 'url') {
      var url = global.prompt ? global.prompt('输入网址', 'https://') : '';
      if (!url || !String(url).trim()) return;
      addMaterial({
        kind: 'url',
        name: String(url).trim(),
        path: String(url).trim(),
        source: '网址',
        citeMode: 'pathOnly'
      });
      toast('材料已加入');
      return;
    }
    if (kind === 'dictate') {
      // Trigger existing home voice listen — material lands when user confirms paste later.
      var dock = document.querySelector('[data-now-voice], .hn-cta--dictate[data-now-voice]');
      if (dock) {
        try {
          dock.click();
        } catch (_) {}
      } else if (global.OneToneVoiceWake && global.OneToneVoiceWake.ensureHomeVoiceListening) {
        try {
          global.OneToneVoiceWake.ensureHomeVoiceListening({ force: true });
        } catch (_) {}
      }
      addMaterial({
        kind: 'voice',
        name: '口述一段话',
        source: '口述',
        description: '听写完成后请把内容粘贴进草稿或再添加「粘贴」素材',
        citeMode: 'skip',
        included: false
      });
      toast('已开始口述；内容需你确认后再带入');
      return;
    }
    if (kind === 'image') {
      pickPath('file')
        .then(function (path) {
          if (!path) return;
          var leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
          addMaterial({
            kind: 'image',
            name: leaf,
            path: path,
            source: '本机图片',
            citeMode: 'pathOnly',
            needsManualUpload: true,
            description: '图片需在目标 Agent 中手动上传'
          });
          toast('图片路径已加入（需手动上传）');
        })
        .catch(function () {
          toast('无法选择图片（需桌面版）');
        });
    }
  }

  function fetchProviders() {
    return invoke('cmd_agent_center_snapshot', {})
      .then(function (snap) {
        var agents = (snap && snap.agents) || [];
        return agents
          .filter(function (a) {
            return a && a.agentId;
          })
          .map(function (a) {
            var sid =
              a.sessionId ||
              a.externalSessionId ||
              (a.session && (a.session.id || a.session.sessionId));
            var sessionOk = !!(sid && String(sid) !== 'unknown' && String(sid) !== 'ambiguous');
            return {
              agentId: a.agentId,
              name: a.displayName || a.agentId,
              runtimeKind: a.runtimeKind || '',
              sessionId: sessionOk ? String(sid) : null,
              sessionOk: sessionOk,
              project: (a.currentWork && (a.currentWork.projectName || a.currentWork.project)) || ''
            };
          });
      })
      .catch(function () {
        return [];
      });
  }

  function channelListRowsHtml() {
    var list = model._providerChoices || [];
    return (
      list
        .map(function (p) {
          var on = model.channel && model.channel.agentId === p.agentId;
          return (
            '<button type="button" class="hpp-choice' +
            (on ? ' is-active' : '') +
            '" data-hpp-pick-channel="' +
            esc(p.agentId) +
            '"><span class="hpp-logo">A</span><div><b>' +
            esc(p.name) +
            '</b><small>' +
            (p.sessionOk ? '项目一致 · 可准确定位' : '可打开 · 会话定位未知') +
            '</small></div></button>'
          );
        })
        .join('') || '<p class="hpp-muted">暂无已发现 Agent · 可复制到剪贴板</p>'
    );
  }

  function patchChannelList() {
    if (!hostEl) return;
    var listEl = hostEl.querySelector('[data-hpp-channel-list]');
    if (!listEl) return;
    listEl.innerHTML =
      channelListRowsHtml() +
      '<button type="button" class="hpp-choice" data-hpp-pick-channel="clipboard"><span class="hpp-logo">↗</span><div><b>其他方式</b><small>复制到剪贴板或保存 Markdown</small></div></button>';
  }

  function isFocusableEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled) return false;
    if (el.getAttribute && el.getAttribute('tabindex') === '-1') return false;
    if (el.hidden || (el.getAttribute && el.getAttribute('aria-hidden') === 'true')) return false;
    if (el.closest && el.closest('[inert]')) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'a' && el.href) return true;
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
    if (el.isContentEditable) return true;
    var ti = el.getAttribute && el.getAttribute('tabindex');
    return ti != null && ti !== '' && Number(ti) >= 0;
  }

  function getDrawerFocusables(drawer) {
    if (!drawer || !drawer.querySelectorAll) return [];
    var nodes = drawer.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]'
    );
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      if (isFocusableEl(nodes[i])) out.push(nodes[i]);
    }
    return out;
  }

  function ensureHppDrawerKeysBound() {
    if (drawerKeysBound || typeof document === 'undefined' || !document.addEventListener) return;
    drawerKeysBound = true;
    document.addEventListener('keydown', handleHppDrawerKeydown);
  }

  function handleHppDrawerKeydown(ev) {
    if (!openDrawerKind) return;
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      ev.preventDefault();
      closeHppDrawers();
      return;
    }
    if (ev.key !== 'Tab' || !hostEl) return;
    var sel =
      openDrawerKind === 'channel' ? '[data-hpp-channel-drawer]' : '[data-hpp-handoff-drawer]';
    var drawer = hostEl.querySelector(sel);
    if (!drawer) return;
    var focusables = getDrawerFocusables(drawer);
    if (!focusables.length) {
      ev.preventDefault();
      return;
    }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    var active = document.activeElement;
    if (ev.shiftKey) {
      if (active === first || !drawer.contains(active)) {
        ev.preventDefault();
        last.focus();
      }
    } else if (active === last || !drawer.contains(active)) {
      ev.preventDefault();
      first.focus();
    }
  }

  function setDrawerClosedAttrs(d) {
    if (!d) return;
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
    if (d.removeAttribute) d.removeAttribute('aria-modal');
    if (d.setAttribute) d.setAttribute('inert', '');
    else d.inert = true;
  }

  function setDrawerOpenAttrs(d) {
    if (!d) return;
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    d.setAttribute('aria-modal', 'true');
    if (d.removeAttribute) d.removeAttribute('inert');
    else d.inert = false;
  }

  function openHppDrawer(kind) {
    ensureHppDrawerKeysBound();
    if (!hostEl) return;
    var active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && active.nodeType === 1 && active.isConnected) {
      drawerReturnFocus = active;
    } else {
      drawerReturnFocus = null;
    }
    var channel = hostEl.querySelector('[data-hpp-channel-drawer]');
    var handoff = hostEl.querySelector('[data-hpp-handoff-drawer]');
    var scrim = hostEl.querySelector('[data-hpp-scrim]');
    if (kind === 'channel') {
      setDrawerClosedAttrs(handoff);
      setDrawerOpenAttrs(channel);
      openDrawerKind = 'channel';
    } else {
      setDrawerClosedAttrs(channel);
      setDrawerOpenAttrs(handoff);
      openDrawerKind = 'handoff';
    }
    if (scrim) scrim.classList.add('is-open');
    var d = kind === 'channel' ? channel : handoff;
    var focusTarget = d ? getDrawerFocusables(d)[0] : null;
    if (focusTarget && focusTarget.focus) {
      try {
        focusTarget.focus();
      } catch (_) {}
    }
  }

  function closeHppDrawers() {
    if (!hostEl) {
      openDrawerKind = null;
      return;
    }
    var wasOpen = !!openDrawerKind;
    var channel = hostEl.querySelector('[data-hpp-channel-drawer]');
    var handoff = hostEl.querySelector('[data-hpp-handoff-drawer]');
    setDrawerClosedAttrs(channel);
    setDrawerClosedAttrs(handoff);
    var scrim = hostEl.querySelector('[data-hpp-scrim]');
    if (scrim) scrim.classList.remove('is-open');
    openDrawerKind = null;
    var restore = drawerReturnFocus;
    drawerReturnFocus = null;
    if (!wasOpen) return;
    var target = null;
    if (restore && restore.isConnected && isFocusableEl(restore)) {
      target = restore;
    } else {
      var fallback =
        hostEl.querySelector('[data-hpp-change-channel]') ||
        hostEl.querySelector('[data-hpp-main]') ||
        hostEl.querySelector('button');
      if (fallback && isFocusableEl(fallback)) target = fallback;
    }
    if (target && target.focus) {
      try {
        target.focus();
      } catch (_) {}
    }
  }

  /** @deprecated use closeHppDrawers */
  function closeDrawers() {
    closeHppDrawers();
  }

  function openChannelDrawer() {
    fetchProviders().then(function (list) {
      model._providerChoices = list;
      patchChannelList();
      openHppDrawer('channel');
    });
  }

  function selectChannel(agentId) {
    var list = model._providerChoices || [];
    var pick = list.find(function (p) {
      return p.agentId === agentId;
    });
    if (!pick) {
      model.channel = { agentId: 'clipboard', name: '剪贴板 / Markdown', sessionOk: false, clipboardOnly: true };
    } else {
      model.channel = pick;
    }
    setPhase('CHANNEL_SELECTED');
    closeHppDrawers();
    paint();
    toast('已选择 ' + (model.channel.name || '通道'));
  }

  function openHandoffDrawer() {
    openHppDrawer('handoff');
  }

  function runHandoff() {
    var ch = model.channel;
    if (!ch) return;
    setPhase('HANDING_OFF');
    paint();
    var receipt = {
      opened: false,
      focused: false,
      sessionLocated: false,
      filled: false,
      imagesPending: model.materials.some(function (m) {
        return m.needsManualUpload && m.included !== false;
      }),
      sendUnknown: true
    };

    var md = model.assembledMd || assembleMarkdown();
    var chain = Promise.resolve();

    if (ch.clipboardOnly) {
      chain = writeClipboard(md)
        .then(function () {
          receipt.filled = true;
          toast('已复制到剪贴板');
        })
        .catch(function () {
          toast('无法写入剪贴板');
        });
    } else {
      var agentId = ch.agentId;
      chain = invoke('cmd_agent_center_action', {
        actionId: 'agent.focus',
        agentId: agentId
      })
        .then(function (res) {
          receipt.opened = !!(res && (res.ok || res.outcome === 'verified' || res.outcome === 'attemptedUnverified'));
          receipt.focused = receipt.opened;
          if (ch.sessionOk && ch.sessionId) {
            return invoke('cmd_agent_center_action', {
              actionId: 'session.resume',
              agentId: agentId,
              sessionId: ch.sessionId
            }).then(function (r2) {
              receipt.sessionLocated = !!(r2 && (r2.ok || r2.outcome === 'verified'));
            }).catch(function () {
              receipt.sessionLocated = false;
            });
          }
          receipt.sessionLocated = false;
        })
        .catch(function () {
          receipt.opened = false;
          receipt.focused = false;
        })
        .then(function () {
          return writeClipboard(md).then(function () {
            receipt.filled = true;
            // Best-effort: paste into composer is not verified as send.
            return invoke('cmd_agent_center_action', {
              actionId: 'agent.focus',
              agentId: agentId
            }).catch(function () {});
          });
        })
        .catch(function () {
          receipt.filled = false;
        });
    }

    chain.finally(function () {
      model.receipt = receipt;
      setPhase('HANDED_OFF');
      closeDrawers();
      paint();
      openHandoffDrawer();
      var el = hostEl && hostEl.querySelector('[data-hpp-receipt]');
      if (el) el.hidden = false;
    });
  }

  function mainActionLabel(phase) {
    if (phase === 'EMPTY') return '完成排版';
    if (phase === 'COLLECTING') return '完成排版';
    if (phase === 'ASSEMBLED') return '准备交给 Agent';
    if (phase === 'CHANNEL_SELECTED') {
      return '准备到 ' + ((model.channel && model.channel.name) || 'Agent');
    }
    if (phase === 'HANDING_OFF') return '正在准备…';
    if (phase === 'HANDED_OFF') {
      return '回到 ' + ((model.channel && model.channel.name) || 'Agent');
    }
    return '完成排版';
  }

  function statusCopy(phase) {
    var meta = model.assemblyMeta || {};
    if (phase === 'EMPTY') {
      return { title: '还没有材料', text: '添加至少一项素材后才能完成排版' };
    }
    if (phase === 'COLLECTING') {
      return {
        title: '已收集 ' + model.materials.length + ' 项材料',
        text: '确认后会机械装订，不会改写内容'
      };
    }
    if (phase === 'ASSEMBLED') {
      return {
        title: '已装订 ' + (meta.included || 0) + ' 项材料',
        text:
          (meta.excluded ? '还有 ' + meta.excluded + ' 项没有带上 · ' : '') +
          (meta.chars || 0) +
          ' 字符 · 约 ' +
          (meta.tokensApprox || 0) +
          ' token（粗略）'
      };
    }
    if (phase === 'CHANNEL_SELECTED') {
      var ch = model.channel || {};
      return {
        title: '目标：' + (ch.name || 'Agent'),
        text: ch.sessionOk
          ? '可定位会话并填入正文'
          : '会话定位未知 · 将尽量聚焦并复制正文'
      };
    }
    if (phase === 'HANDING_OFF') {
      return { title: '正在准备交接', text: '请稍候…' };
    }
    if (phase === 'HANDED_OFF') {
      return {
        title: '正文已准备',
        text: '无法确认是否发送 · 请自行检查'
      };
    }
    return { title: '', text: '' };
  }

  function materialsHtml() {
    if (!model.materials.length) return '';
    return model.materials
      .map(function (m) {
        return (
          '<article class="hpp-item' +
          (m.included === false ? ' is-excluded' : '') +
          '" data-hpp-mat="' +
          esc(m.id) +
          '">' +
          '<span class="hpp-ico" aria-hidden="true">' +
          (m.kind === 'folder' ? '⌁' : m.kind === 'image' ? '▨' : m.kind === 'url' ? '↗' : m.kind === 'voice' ? '◉' : 'T') +
          '</span>' +
          '<div><strong>' +
          esc(m.name) +
          '</strong><small>' +
          esc(m.source || '') +
          (m.capturedAt ? ' · ' + esc(String(m.capturedAt).slice(0, 19).replace('T', ' ')) : '') +
          '</small></div></article>'
        );
      })
      .join('');
  }

  function sheetHtml(phase) {
    if (phase === 'EMPTY') {
      return (
        '<section class="hpp-empty"><div class="hpp-empty-icon" aria-hidden="true">＋</div>' +
        '<h1>先把材料放进来</h1><p>图片、文件、文字和项目目录都可以。</p></section>'
      );
    }
    if (phase === 'COLLECTING') {
      return (
        '<section class="hpp-collecting"><h1>材料已经放在桌面上</h1>' +
        '<p>确认后，OneTone 会把它们机械装订成一张纸。</p>' +
        '<div class="hpp-queue">' +
        model.materials
          .map(function (m) {
            return (
              '<div class="hpp-queue-row"><span class="hpp-ico">' +
              (m.kind === 'folder' ? '⌁' : 'T') +
              '</span><div><b>' +
              esc(m.name) +
              '</b><small>原始内容保持只读</small></div>' +
              '<span class="hpp-ready">已就绪</span></div>'
            );
          })
          .join('') +
        '</div></section>'
      );
    }
    // ASSEMBLED+
    var meta = model.assemblyMeta || {};
    var refs = model.materials
      .filter(function (m) {
        return m.included !== false && m.citeMode !== 'skip';
      })
      .map(function (m) {
        return (
          '<article class="hpp-ref"><div class="hpp-thumb">' +
          esc((m.kind || 'T').slice(0, 4).toUpperCase()) +
          '</div><div><h3>' +
          esc(m.name) +
          '</h3><p>' +
          esc(m.source || '') +
          (m.note ? ' · ' + esc(m.note) : '') +
          '</p></div><span class="hpp-pill">' +
          esc(
            m.citeMode === 'pathOnly'
              ? '只引用'
              : m.citeMode === 'summary'
                ? '摘要'
                : m.citeMode === 'excerpt'
                  ? '片段'
                  : '全文'
          ) +
          '</span></article>'
        );
      })
      .join('');
    var excludedN = meta.excluded || 0;
    return (
      '<section class="hpp-assembled">' +
      '<div class="hpp-assembly-note">按当前设置机械装订，没有使用 LLM 改写或总结。</div>' +
      '<h1 contenteditable="true" data-hpp-title>' +
      esc((model.draft && model.draft.title) || '首次沟通简报') +
      '</h1>' +
      '<div class="hpp-origin">第一句话作为标题，用户原话保持可编辑</div>' +
      '<div class="hpp-writing" contenteditable="true" data-hpp-body>' +
      esc((model.draft && model.draft.body) || '') +
      '</div>' +
      '<div class="hpp-ref-title">已经带上的材料</div>' +
      refs +
      (excludedN
        ? '<div class="hpp-excluded">还有 ' + excludedN + ' 项没有带上，在左边等你决定。</div>'
        : '') +
      '</section>'
    );
  }

  function channelStripHtml(phase) {
    if (phase !== 'CHANNEL_SELECTED' && phase !== 'HANDING_OFF' && phase !== 'HANDED_OFF') {
      return '';
    }
    var ch = model.channel || {};
    var imgs = model.materials.filter(function (m) {
      return m.needsManualUpload && m.included !== false;
    }).length;
    return (
      '<div class="hpp-channel-strip"><div class="hpp-channel-main"><span class="hpp-logo">A</span><div><b>' +
      esc(ch.name || 'Agent') +
      (ch.project ? ' · ' + esc(ch.project) : '') +
      '</b><span>' +
      (ch.sessionOk ? '当前会话 · 可以准确定位并填入文字' : '会话定位未知 · 将尽力聚焦') +
      '</span></div></div>' +
      (imgs ? '<span class="hpp-channel-gap">' + imgs + ' 张图片需要你上传</span>' : '') +
      '<button type="button" data-hpp-change-channel>换一个</button></div>'
    );
  }

  function channelDrawerHtml() {
    return (
      '<aside class="hpp-drawer" data-hpp-channel-drawer role="dialog" aria-hidden="true" inert aria-labelledby="hppChannelDrawerTitle">' +
      '<header class="hpp-drawer-head"><div><h2 id="hppChannelDrawerTitle">选择交接通道</h2><p>现在才需要决定交给谁。</p></div>' +
      '<button type="button" class="hpp-close" data-hpp-close aria-label="关闭">×</button></header>' +
      '<div class="hpp-drawer-body" data-hpp-channel-list>' +
      channelListRowsHtml() +
      '<button type="button" class="hpp-choice" data-hpp-pick-channel="clipboard"><span class="hpp-logo">↗</span><div><b>其他方式</b><small>复制到剪贴板或保存 Markdown</small></div></button>' +
      '</div></aside>'
    );
  }

  function handoffDrawerHtml() {
    var ch = model.channel || {};
    var r = model.receipt || {};
    var imgNames = model.materials
      .filter(function (m) {
        return m.needsManualUpload && m.included !== false;
      })
      .map(function (m) {
        return m.name;
      });
    var receiptLines = [
      (r.opened || r.focused ? '✓' : '○') + ' ' + (r.focused ? '已聚焦窗口' : '未确认是否打开'),
      (r.sessionLocated ? '✓' : '○') + ' ' + (r.sessionLocated ? '已定位会话' : '未定位会话'),
      (r.filled ? '✓' : '○') + ' ' + (r.filled ? '已填入 / 已复制正文' : '正文未写入'),
      (r.imagesPending ? '○ 图片尚未上传' : '✓ 无待上传图片'),
      '? 无法确认是否发送'
    ];
    return (
      '<aside class="hpp-drawer" data-hpp-handoff-drawer role="dialog" aria-hidden="true" inert aria-labelledby="hppHandoffDrawerTitle">' +
      '<header class="hpp-drawer-head"><div><h2 id="hppHandoffDrawerTitle">准备到 ' +
      esc(ch.name || 'Agent') +
      '</h2><p>执行前确认每一步的责任。</p></div>' +
      '<button type="button" class="hpp-close" data-hpp-close aria-label="关闭">×</button></header>' +
      '<div class="hpp-drawer-body">' +
      '<div class="hpp-group"><h4>OneTone 将会</h4>' +
      '<div class="hpp-ability"><i class="yes">✓</i><div>打开目标 Agent 并聚焦<small>' +
      esc(ch.sessionId || '尽力定位') +
      '</small></div></div>' +
      '<div class="hpp-ability"><i class="yes">✓</i><div>填入装订后的正文<small>含材料路径与引用说明</small></div></div></div>' +
      '<div class="hpp-group"><h4>还需要你</h4>' +
      (imgNames.length
        ? imgNames
            .map(function (n) {
              return (
                '<div class="hpp-ability"><i class="manual">○</i><div>上传 ' + esc(n) + '</div></div>'
              );
            })
            .join('')
        : '') +
      '<div class="hpp-ability"><i class="manual">○</i><div>检查内容并点击发送</div></div></div>' +
      '<div class="hpp-receipt" data-hpp-receipt ' +
      (model.phase === 'HANDED_OFF' ? '' : 'hidden') +
      '>' +
      receiptLines.join('<br>') +
      '</div></div>' +
      '<footer class="hpp-drawer-foot"><button type="button" class="hpp-main" data-hpp-handoff-go>' +
      (model.phase === 'HANDED_OFF' ? '回到 ' + esc(ch.name || 'Agent') : '聚焦会话并填入') +
      '</button></footer></aside>'
    );
  }

  function paint() {
    if (!hostEl || !hostEl.isConnected) {
      hostEl = document.getElementById('homePromptPrepHost');
    }
    if (!hostEl) return;
    openDrawerKind = null;
    drawerReturnFocus = null;
    var phase = derivePhase();
    model.phase = phase;
    var st = statusCopy(phase);
    var mainDisabled = phase === 'EMPTY' || phase === 'HANDING_OFF';
    hostEl.innerHTML =
      '<div class="hpp-root" data-hpp-phase="' +
      esc(phase) +
      '">' +
      '<div class="hpp-app">' +
      '<aside class="hpp-materials"><h2>材料</h2><p class="hpp-sub">先把手边的东西放进来。</p>' +
      '<div class="hpp-add-wrap"><button type="button" class="hpp-add" data-hpp-add aria-haspopup="true" aria-expanded="false">＋ 添加素材</button>' +
      '<div class="hpp-add-menu" data-hpp-add-menu hidden>' +
      '<button type="button" data-hpp-add-kind="image">▨ 图片</button>' +
      '<button type="button" data-hpp-add-kind="file">T 文件</button>' +
      '<button type="button" data-hpp-add-kind="folder">⌁ 文件夹</button>' +
      '<button type="button" data-hpp-add-kind="paste">⌘ 粘贴</button>' +
      '<button type="button" data-hpp-add-kind="url">↗ 网址</button>' +
      '<button type="button" data-hpp-add-kind="dictate">◉ 口述一段话</button>' +
      '</div></div>' +
      '<div class="hpp-list-head" data-hpp-list-head' +
      (model.materials.length ? '' : ' hidden') +
      '><span data-hpp-list-count>已收集 · ' +
      model.materials.length +
      '</span></div>' +
      '<div class="hpp-item-list" data-hpp-item-list>' +
      materialsHtml() +
      '</div></aside>' +
      '<section class="hpp-workspace" data-hpp-workspace>' +
      '<div data-hpp-channel-strip-slot>' +
      channelStripHtml(phase) +
      '</div>' +
      '<article class="hpp-sheet" data-hpp-sheet>' +
      sheetHtml(phase) +
      '</article></section></div>' +
      '<footer class="hpp-actionbar"><div class="hpp-status" data-hpp-status><b data-hpp-status-title>' +
      esc(st.title) +
      '</b><span data-hpp-status-text>' +
      esc(st.text) +
      '</span></div><div data-hpp-action-btns>' +
      (phase === 'ASSEMBLED' || phase === 'CHANNEL_SELECTED' || phase === 'HANDED_OFF'
        ? '<button type="button" class="hpp-more" data-hpp-copy>复制草稿</button>'
        : '') +
      '<button type="button" class="hpp-main" data-hpp-main' +
      (mainDisabled ? ' disabled' : '') +
      '>' +
      esc(mainActionLabel(phase)) +
      '</button></div></footer>' +
      '<div class="hpp-scrim" data-hpp-scrim></div>' +
      channelDrawerHtml() +
      handoffDrawerHtml() +
      '</div>';
    bindOnce();
  }

  function isEditingEditors() {
    if (typeof document === 'undefined') return false;
    var active = document.activeElement;
    if (!active || !hostEl) return false;
    if (active.closest && (active.closest('[data-hpp-body]') || active.closest('[data-hpp-title]'))) {
      return true;
    }
    return false;
  }

  /**
   * Non-destructive sync for home refresh. Must not replace:
   * [data-hpp-title], [data-hpp-body], open drawer roots, activeElement ancestor subtree.
   */
  function refresh() {
    if (!hostEl || !hostEl.isConnected) return;
    var phase = derivePhase();
    model.phase = phase;
    var root = hostEl.querySelector('.hpp-root');
    if (root) root.setAttribute('data-hpp-phase', phase);
    var st = statusCopy(phase);
    var titleEl = hostEl.querySelector('[data-hpp-status-title]');
    var textEl = hostEl.querySelector('[data-hpp-status-text]');
    if (titleEl) titleEl.textContent = st.title;
    if (textEl) textEl.textContent = st.text;
    var mainBtn = hostEl.querySelector('[data-hpp-main]');
    if (mainBtn) {
      var mainDisabled = phase === 'EMPTY' || phase === 'HANDING_OFF';
      mainBtn.disabled = mainDisabled;
      if (mainDisabled) mainBtn.setAttribute('disabled', '');
      else mainBtn.removeAttribute('disabled');
      mainBtn.textContent = mainActionLabel(phase);
    }
    var listHead = hostEl.querySelector('[data-hpp-list-head]');
    var listCount = hostEl.querySelector('[data-hpp-list-count]');
    if (listHead) {
      if (model.materials.length) listHead.removeAttribute('hidden');
      else listHead.setAttribute('hidden', '');
    }
    if (listCount) listCount.textContent = '已收集 · ' + model.materials.length;
    var itemList = hostEl.querySelector('[data-hpp-item-list]');
    if (itemList) itemList.innerHTML = materialsHtml();

    var stripSlot = hostEl.querySelector('[data-hpp-channel-strip-slot]');
    if (stripSlot && !isEditingEditors()) {
      stripSlot.innerHTML = channelStripHtml(phase);
    }

    // Sync editors only when not editing / not composing and values differ.
    if (!isEditingEditors() && !hostEl._hppComposing) {
      var title = hostEl.querySelector('[data-hpp-title]');
      var body = hostEl.querySelector('[data-hpp-body]');
      var wantTitle = (model.draft && model.draft.title) || '';
      var wantBody = (model.draft && model.draft.body) || '';
      if (title && title.textContent !== wantTitle) title.textContent = wantTitle;
      if (body) {
        var cur = body.innerText != null ? body.innerText : body.textContent || '';
        if (cur !== wantBody) {
          // Prefer textContent to avoid XSS; newlines rely on CSS pre-wrap.
          body.textContent = wantBody;
        }
      }
    }
  }

  function bindOnce() {
    if (!hostEl) return;
    if (hostEl.getAttribute('data-hpp-bound') === '1') return;
    hostEl.setAttribute('data-hpp-bound', '1');
    hostEl.addEventListener('click', onHostClick);
    hostEl.addEventListener('input', onHostInput);
    hostEl.addEventListener('blur', onHostInput, true);
    hostEl.addEventListener('compositionstart', function () {
      hostEl._hppComposing = true;
    });
    hostEl.addEventListener('compositionend', function () {
      hostEl._hppComposing = false;
    });
  }

  function onHostInput(ev) {
    var t = ev.target;
    if (!t) return;
    if (t.getAttribute && t.getAttribute('data-hpp-title') != null) {
      model.draft.title = t.textContent || '';
      saveModel();
    }
    if (t.getAttribute && t.getAttribute('data-hpp-body') != null) {
      model.draft.body = t.innerText || t.textContent || '';
      saveModel();
    }
  }

  function onHostClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-hpp-add]')) {
      openAddMenu(t.closest('[data-hpp-add]'));
      ev.stopPropagation();
      return;
    }
    var kindBtn = t.closest('[data-hpp-add-kind]');
    if (kindBtn) {
      onAdd(kindBtn.getAttribute('data-hpp-add-kind'));
      return;
    }
    if (t.closest('[data-hpp-close]') || t.closest('[data-hpp-scrim]')) {
      closeDrawers();
      return;
    }
    var pick = t.closest('[data-hpp-pick-channel]');
    if (pick) {
      selectChannel(pick.getAttribute('data-hpp-pick-channel'));
      return;
    }
    if (t.closest('[data-hpp-change-channel]')) {
      openChannelDrawer();
      return;
    }
    if (t.closest('[data-hpp-copy]')) {
      writeClipboard(model.assembledMd || assembleMarkdown())
        .then(function () {
          toast('已复制装订草稿');
        })
        .catch(function () {
          toast('复制失败');
        });
      return;
    }
    if (t.closest('[data-hpp-handoff-go]')) {
      if (model.phase === 'HANDED_OFF') {
        var Nav = global.OneToneAgentNavTarget;
        if (Nav && Nav.open && model.channel && !model.channel.clipboardOnly) {
          Nav.open({
            view: 'overview',
            provider: model.channel.runtimeKind || model.channel.agentId,
            sessionId: model.channel.sessionId
          });
        }
        closeDrawers();
        return;
      }
      runHandoff();
      return;
    }
    if (t.closest('[data-hpp-main]')) {
      var phase = derivePhase();
      if (phase === 'COLLECTING') {
        assembleMarkdown();
        paint();
        toast('排版完成');
      } else if (phase === 'ASSEMBLED') {
        openChannelDrawer();
      } else if (phase === 'CHANNEL_SELECTED') {
        openHandoffDrawer();
      } else if (phase === 'HANDED_OFF') {
        var N2 = global.OneToneAgentNavTarget;
        if (N2 && N2.open && model.channel && !model.channel.clipboardOnly) {
          N2.open({
            view: 'overview',
            provider: model.channel.runtimeKind || model.channel.agentId,
            sessionId: model.channel.sessionId
          });
        } else {
          toast('正文已在剪贴板');
        }
      }
    }
  }

  function ensureMounted() {
    var host = document.getElementById('homePromptPrepHost');
    if (!host) return;
    // Idempotent: same connected host → refresh only (never full innerHTML).
    if (
      mountedHost === host &&
      host.isConnected &&
      host.getAttribute('data-hpp-bound') === '1'
    ) {
      hostEl = host;
      refresh();
      return;
    }
    hostEl = host;
    mountedHost = host;
    paint();
    ensureHppDrawerKeysBound();
  }

  // Close add menu on outside click; Escape handled by ensureHppDrawerKeysBound (single keydown).
  if (typeof document !== 'undefined' && !global.__otHppDocBound) {
    global.__otHppDocBound = true;
    document.addEventListener('click', function () {
      closeAddMenu();
    });
  }

  global.OneToneHomePromptPrep = {
    ensureMounted: ensureMounted,
    refresh: refresh,
    paint: paint,
    assembleMarkdown: assembleMarkdown,
    addMaterial: addMaterial,
    openHppDrawer: openHppDrawer,
    closeHppDrawers: closeHppDrawers,
    handleHppDrawerKeydown: handleHppDrawerKeydown,
    __testOnly: {
      getMountedHost: function () {
        return mountedHost;
      },
      getMountedBodyEl: function () {
        return hostEl && hostEl.querySelector('[data-hpp-body]');
      },
      getOpenDrawerKind: function () {
        return openDrawerKind;
      },
      isDrawerKeysBound: function () {
        return drawerKeysBound;
      },
      getModel: function () {
        return model;
      },
      setDraftBody: function (text) {
        model.draft = model.draft || { title: '', body: '' };
        model.draft.body = text;
        saveModel();
      }
    },
    derivePhase: derivePhase,
    _model: function () {
      return model;
    },
    _setModel: function (m) {
      model = m;
      saveModel();
    },
    _loadModel: loadModel,
    STATES: STATES
  };
})(typeof window !== 'undefined' ? window : globalThis);
