(function () {
  'use strict';

  const runtime = window.OneToneHomePrototype;
  const allowedStates = ['idle', 'resume', 'running', 'waiting', 'dictating', 'degraded'];
  const initialState = new URLSearchParams(location.search).get('state');
  let currentState = allowedStates.includes(initialState) ? initialState : 'resume';
  let lastOverlayTrigger = null;

  function setBackgroundInert(inert) {
    document.getElementById('stage').toggleAttribute('inert', inert);
    document.querySelector('.proto-picker').toggleAttribute('inert', inert);
  }

  function releaseBackgroundIfClear() {
    const drawerClosed = document.getElementById('appDrawer').hidden;
    const confirmationClosed = document.querySelector('[data-confirmation]').hidden;
    if (drawerClosed && confirmationClosed) setBackgroundInert(false);
  }

  function trapFocus(container, event) {
    const focusable = [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function currentModel() {
    return runtime.modelFor(currentState);
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 2100);
  }

  function setState(state) {
    if (!allowedStates.includes(state)) return;
    currentState = state;
    const url = new URL(location);
    url.searchParams.set('state', state);
    history.replaceState(null, '', url);
    mount(current);
  }

  function sourceCard(model) {
    const unavailable = model.source.quality === 'unavailable';
    return `
      <div class="drawer-source ${unavailable ? 'is-warning' : ''}">
        <span class="source-orb" aria-hidden="true"></span>
        <div><strong>${runtime.esc(model.source.label)}</strong><small>${runtime.esc(model.source.freshness)}</small></div>
        <span class="quality-label">${runtime.qualityLabel(model.source.quality)}</span>
      </div>`;
  }

  function drawerView(id) {
    const model = currentModel();
    const icon = runtime.icon;
    const views = {
      activity: {
        eyebrow: '最近活动',
        title: 'OneTone 动作历史',
        body: `
          <p class="drawer-intro">这里只记录 OneTone 实际触发过的动作，不把 Agent 的推测当成历史。</p>
          <ol class="drawer-timeline">
            <li><span>${icon('arrow')}</span><div><b>回到 Cursor</b><small>按键 · Ctrl + Alt + J · 14:38</small></div></li>
            <li><span>${icon('mic')}</span><div><b>完成并发送</b><small>语音 · “发送” · 14:35</small></div></li>
            <li><span>${icon('pad')}</span><div><b>继续 Agent</b><small>Soft Pad · 14:32</small></div></li>
          </ol>`
      },
      context: {
        eyebrow: '当前项目',
        title: model.project.known ? 'OneTone · 可用上下文' : '项目尚未确认',
        body: model.project.known ? `
          <p class="drawer-intro">上下文跟随当前项目展示，不作为首页一级页面。</p>
          <div class="detail-grid">
            <div><small>项目路径</small><b>E:\\voice-pilot</b></div>
            <div><small>当前窗口</small><b>home-focus-view.js</b></div>
            <div><small>恢复点</small><b>今天 14:32</b></div>
            <div><small>项目记忆</small><b>3 条可用</b></div>
          </div>
          <div class="memory-note"><b>已确认的产品方向</b><p>首页优先处理当前工作与等待用户介入的事项；四通道是动作入口，不是四张状态卡。</p></div>` : `
          <div class="empty-honest">${icon('warning')}<h3>没有足够依据</h3><p>请先恢复本地读取，或手动选择当前项目。</p></div>`
      },
      sources: {
        eyebrow: '依据与连接',
        title: '这页数据从哪里来',
        body: `
          <p class="drawer-intro">每块信息都标明来源、质量和更新时间；缺失时直接说明，不补造内容。</p>
          ${sourceCard(model)}
          <div class="source-list">
            <div><span>${icon('activity')}</span><div><b>Agent 状态</b><small>${model.provider.name} · ${model.provider.status === 'unavailable' ? '不可用' : '已连接'}</small></div></div>
            <div><span>${icon('folder')}</span><div><b>前台项目</b><small>${model.project.known ? '工作区证据 · 本地读取' : '没有可靠证据'}</small></div></div>
            <div><span>${icon('clock')}</span><div><b>动作历史</b><small>OneTone 本地日志 · 可用</small></div></div>
          </div>`
      },
      habits: {
        eyebrow: '我的习惯',
        title: 'Vibe Coding 基础',
        body: `
          <p class="drawer-intro">习惯把同一个语义动作绑定到你顺手的入口。</p>
          <div class="habit-summary"><div class="habit-mark">VC</div><div><b>Vibe Coding 基础</b><small>4 个通道 · 9 个动作 · 0 个冲突</small></div></div>
          <div class="mini-list"><button data-toast="已选择：开始听写">开始听写 <span>按键 · 语音 · Soft Pad</span></button><button data-toast="已选择：继续 Agent">继续 Agent <span>四通道</span></button><button data-toast="已选择：批准请求">批准请求 <span>按键 · Soft Pad；摄像头需复核</span></button></div>`
      },
      actions: {
        eyebrow: '动作与入口',
        title: '一个动作，多个触发入口',
        body: `
          <p class="drawer-intro">先定义“要做什么”，再决定用按键、语音、Soft Pad 或摄像头触发。</p>
          <div class="action-map-row"><b>继续 Agent</b><span>${runtime.channelPill('keys', 'Ctrl+Enter')}${runtime.channelPill('voice', '说“继续”')}${runtime.channelPill('softpad', '继续键')}${runtime.channelPill('camera', '点头')}</span></div>
          <div class="action-map-row"><b>批准请求</b><span>${runtime.channelPill('keys', 'Enter')}${runtime.channelPill('voice', '说“批准”')}${runtime.channelPill('softpad', '批准键')}${runtime.channelPill('camera', '发起确认')}</span></div>`
      },
      agent: {
        eyebrow: 'Agent',
        title: `${model.provider.name} · ${runtime.statusCopy(model).short}`,
        body: `
          ${sourceCard(model)}
          <div class="detail-grid"><div><small>当前任务</small><b>${runtime.esc(model.work.title)}</b></div><div><small>数据能力</small><b>${model.provider.id === 'claude-code' ? '状态与批准' : '状态、文件与恢复点'}</b></div></div>
          <p class="capability-note">界面只显示当前 Provider 已验证的能力。未验证的暂停、恢复或批准不会伪装成可用按钮。</p>`
      },
      settings: {
        eyebrow: '设置',
        title: '通用设置与数据权限',
        body: `
          <div class="settings-list">
            <button data-toast="已打开：启动与窗口"><span>${icon('window')}</span><div><b>启动与窗口</b><small>置顶、开机启动、窗口行为</small></div><i>›</i></button>
            <button data-toast="已打开：连接与数据"><span>${icon('link')}</span><div><b>连接与数据</b><small>本地读取、Agent Hook、数据保留</small></div><i>›</i></button>
            <button data-toast="已打开：声音反馈"><span>${icon('volume')}</span><div><b>声音反馈</b><small>听写、完成与错误提示音</small></div><i>›</i></button>
          </div>`
      },
      allActions: {
        eyebrow: '当前可用',
        title: '更多动作',
        body: `
          <div class="mini-list"><button data-toast="动作：回到 Agent">回到 Agent <span>安全</span></button><button data-toast="动作：开始听写">开始听写 <span>安全</span></button><button data-toast="动作：新建任务">新建任务 <span>安全</span></button><button data-toast="动作：中断 Agent">中断 Agent <span>需确认上下文</span></button></div>`
      }
    };
    return views[id] || views.context;
  }

  function openDrawer(id, trigger) {
    const drawer = document.getElementById('appDrawer');
    const view = drawerView(id);
    lastOverlayTrigger = trigger || document.activeElement;
    document.getElementById('drawerEyebrow').textContent = view.eyebrow;
    document.getElementById('drawerTitle').textContent = view.title;
    document.getElementById('drawerBody').innerHTML = view.body;
    drawer.hidden = false;
    setBackgroundInert(true);
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    drawer.querySelector('[data-close="drawer"]').focus();
  }

  function closeDrawer() {
    const drawer = document.getElementById('appDrawer');
    drawer.classList.remove('is-open');
    setTimeout(() => {
      drawer.hidden = true;
      releaseBackgroundIfClear();
      lastOverlayTrigger?.focus?.();
    }, 180);
  }

  function openConfirmation(message, trigger) {
    const dialog = document.querySelector('[data-confirmation="cross-channel"]');
    lastOverlayTrigger = trigger || document.activeElement;
    document.getElementById('confirmMessage').textContent = message;
    dialog.hidden = false;
    setBackgroundInert(true);
    requestAnimationFrame(() => dialog.classList.add('is-open'));
    dialog.querySelector('[data-cross-confirm]').focus();
  }

  function closeConfirmation() {
    const dialog = document.querySelector('[data-confirmation="cross-channel"]');
    dialog.classList.remove('is-open');
    setTimeout(() => {
      dialog.hidden = true;
      releaseBackgroundIfClear();
      lastOverlayTrigger?.focus?.();
    }, 180);
  }

  function applyPrimary() {
    const result = runtime.reduceIntent({ state: currentState, variant: current + 1 }, { type: 'primary' });
    const effects = {
      'resume-session': '已从恢复点继续，Cursor 正在工作。',
      'start-dictation': 'OneTone 已开始听写。',
      'approve-request': '已批准，Claude Code 继续执行。',
      'send-dictation': '听写内容已发送给当前 Agent。',
      'repair-source': '已恢复本地读取，并重新确认当前项目。',
      'focus-agent': '已切回当前 Agent 窗口。'
    };
    setState(result.state);
    showToast(effects[result.effect] || '动作已执行。');
  }

  document.addEventListener('click', (event) => {
    const close = event.target.closest('[data-close]');
    if (close) {
      if (close.dataset.close === 'drawer') closeDrawer();
      if (close.dataset.close === 'confirmation') closeConfirmation();
      return;
    }

    const crossConfirm = event.target.closest('[data-cross-confirm]');
    if (crossConfirm) {
      closeConfirmation();
      setState('running');
      showToast('已通过按键通道确认，Agent 继续执行。');
      return;
    }

    const stateButton = event.target.closest('[data-set-state]');
    if (stateButton) {
      setState(stateButton.dataset.setState);
      return;
    }

    const stateMenu = event.target.closest('[data-toggle-state-menu]');
    if (stateMenu) {
      const popover = document.querySelector('[data-state-popover]');
      const open = popover.hasAttribute('hidden');
      popover.toggleAttribute('hidden', !open);
      stateMenu.setAttribute('aria-expanded', String(open));
      return;
    }

    const channel = event.target.closest('[data-channel]');
    if (channel) {
      const action = channel.closest('[data-action-id]');
      const result = runtime.channelIntent({
        state: currentState,
        actionId: action?.dataset.actionId || '',
        channel: channel.dataset.channel
      });
      if (!result.allowed) openConfirmation(result.message, channel);
      else showToast(`${runtime.channelName(channel.dataset.channel)}入口已准备：${action?.dataset.actionLabel || '当前动作'}`);
      return;
    }

    const primary = event.target.closest('[data-primary-action]');
    if (primary) {
      applyPrimary();
      return;
    }

    const nav = event.target.closest('[data-nav]');
    if (nav) {
      if (nav.dataset.nav === 'home') showToast('你已经在首页。');
      else openDrawer(nav.dataset.nav, nav);
      return;
    }

    const opener = event.target.closest('[data-open]');
    if (opener) {
      openDrawer(opener.dataset.open, opener);
      return;
    }

    const suggestion = event.target.closest('[data-suggestion]');
    if (suggestion) {
      const field = document.querySelector('[data-command-input]');
      if (field) {
        field.value = suggestion.dataset.suggestion;
        field.focus();
      }
      return;
    }

    const dataToast = event.target.closest('[data-toast]');
    if (dataToast) showToast(dataToast.dataset.toast);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-command-form]');
    if (!form) return;
    event.preventDefault();
    const field = form.querySelector('[data-command-input]');
    const value = field?.value.trim();
    if (!value) {
      showToast('先说一句或写下你想做的事。');
      field?.focus();
      return;
    }
    setState('running');
    showToast('已把你的意图交给当前 Agent。');
  });

  document.addEventListener('keydown', (event) => {
    const drawer = document.getElementById('appDrawer');
    const confirmation = document.querySelector('[data-confirmation]');
    if (event.key === 'Tab') {
      if (!confirmation.hidden) trapFocus(confirmation, event);
      else if (!drawer.hidden) trapFocus(drawer, event);
      return;
    }
    if (event.key !== 'Escape') return;
    const statePopover = document.querySelector('[data-state-popover]');
    if (!statePopover?.hidden) {
      statePopover.hidden = true;
      const trigger = document.querySelector('[data-toggle-state-menu]');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus();
    }
    if (!drawer.hidden) closeDrawer();
    if (!confirmation.hidden) closeConfirmation();
  });

  // `variants` is an array of render functions, one per variant, in picker order.
  const stage = document.getElementById('stage');
  const picker = document.querySelector('.proto-picker');
  const highlight = picker.querySelector('.proto-picker-highlight');
  const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
  const replay = picker.querySelector('.proto-picker-replay');
  const variants = runtime.variants.map((variant) => () => variant.render(currentModel()));
  let current = 0;

  function moveHighlight() {
    const el = items[current];
    highlight.style.width = el.offsetWidth + 'px';
    highlight.style.transform = `translateX(${el.offsetLeft}px)`;
  }

  function mount(i) {
    stage.innerHTML = '';
    // Clear first, render next frame, so entrance animations re-run.
    requestAnimationFrame(() => { stage.innerHTML = variants[i](); });
  }

  function setActive(i) {
    if (i < 0 || i >= variants.length) return;
    current = i;
    items.forEach((el, j) => {
      el.toggleAttribute('data-active', j === i);
      if (j === i) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    });
    moveHighlight();
    const url = new URL(location);
    url.searchParams.set('v', i + 1);
    history.replaceState(null, '', url);
    mount(i);
  }

  items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
  replay?.addEventListener('click', () => mount(current));
  window.addEventListener('resize', moveHighlight);

  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= variants.length) setActive(num - 1);
    else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
    else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
    else if (e.key === 'r' || e.key === 'R') mount(current);
  });

  setActive((parseInt(new URLSearchParams(location.search).get('v'), 10) || 1) - 1);
  // Enable the slide only after first paint, so load doesn't animate.
  requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
})();
