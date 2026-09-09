/**
 * Camera teach — full-screen overlay like Quick Start (no iframe / CDN).
 * Top nav: 入席 / 离席 / 摇头 + 下一步. Bottom extras: OK / 握拳 / 挥手 / 靠近 (click to demo).
 */
(function (global) {
  'use strict';

  var TEACH_KEY = 'ot.camera.teach.v1';
  var STEPS = [
    { id: 'back', label: '入席', ctx: 'desktop' },
    { id: 'away', label: '离席', ctx: 'desktop' },
    { id: 'shake', label: '摇头', ctx: 'ide' }
  ];
  var EXTRAS = {
    ok: { ctx: 'pr', emoji: '👌', hand: 'OK MATCH', hud: 'FACE LOCKED' },
    fist: { ctx: 'media', emoji: '✊', hand: 'FIST MATCH', hud: 'FACE LOCKED' },
    wave: { ctx: 'wave', emoji: '👋', hand: 'WAVE MATCH', hud: 'SWIPE TRACKED' },
    close: { ctx: 'meeting', emoji: '👤', hand: '', hud: 'PROXIMITY LOCK' }
  };
  var NARRATIVES = {
    back: '<span class="phys">物理：</span>重新入座，锁定面部。<br><span class="act">响应：</span>解锁并恢复工作状态。',
    away: '<span class="phys">物理：</span>身体离开视野。<br><span class="act">响应：</span>隐私屏保护敏感内容。',
    shake: '<span class="phys">物理：</span>明确左右摇头。<br><span class="act">响应：</span>映射 Esc，拒绝当前弹窗。',
    ok: '<span class="phys">物理：</span>识别到 OK 手势骨骼拓扑。<br><span class="act">响应：</span>映射回车，确认当前操作。',
    fist: '<span class="phys">物理：</span>五指收拢握拳。<br><span class="act">响应：</span>映射空格，暂停正在播放的媒体。',
    wave: '<span class="phys">物理：</span>手部在面部前方横向扫动。<br><span class="act">响应：</span>划走当前通知或干扰弹窗。',
    close: '<span class="phys">物理：</span>人脸包围盒放大，身体前倾靠近。<br><span class="act">响应：</span>自动开麦；退回坐姿即恢复静音。'
  };

  var openFlag = false;
  var stepIndex = 0;
  var bound = false;
  var autoTimer = 0;
  var activeExtra = '';

  function $(id) {
    return global.OneToneDom && global.OneToneDom.$
      ? global.OneToneDom.$(id)
      : document.getElementById(id);
  }
  function t(key, fallback) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function overlayEl() { return $('cameraTeachOverlay'); }

  function openShell() {
    var overlay = overlayEl();
    if (overlay) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('camera-teach-open');
    }
  }

  function closeShell() {
    var overlay = overlayEl();
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('camera-teach-open');
    }
  }

  function markSeen() {
    try { localStorage.setItem(TEACH_KEY, '1'); } catch (_) {}
  }

  function stopAuto() {
    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = 0;
    }
  }

  function renderNav() {
    var host = $('cameraTeachStepNav');
    if (!host) return;
    host.innerHTML = STEPS.map(function (step, idx) {
      var active = !activeExtra && idx === stepIndex;
      var done = !activeExtra && idx < stepIndex;
      var cls = 'habit-setup-step-tab';
      if (active) cls += ' is-active';
      if (done && !active) cls += ' is-done';
      return (
        '<button type="button" class="' + cls + '" data-camera-teach-step="' + idx + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '">' +
        '<span class="habit-setup-step-num">' + (idx + 1) + '</span>' +
        '<span class="habit-setup-step-label">' + esc(step.label) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function setHud(text, lost) {
    var label = $('cameraTeachHudLabel');
    if (!label) return;
    label.textContent = text;
    label.style.background = lost ? '#ef4444' : '#10b981';
  }

  function showCtx(name) {
    document.querySelectorAll('#cameraTeachApp .camera-teach-ctx').forEach(function (el) {
      el.classList.toggle('is-on', el.getAttribute('data-ctx') === name);
    });
  }

  function syncExtrasUi() {
    document.querySelectorAll('[data-camera-teach-extra]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-camera-teach-extra') === activeExtra);
    });
  }

  function setHand(emoji, label) {
    var emojiEl = $('cameraTeachHandEmoji');
    var labelEl = $('cameraTeachHandLabel');
    if (emojiEl && emoji) emojiEl.textContent = emoji;
    if (labelEl) labelEl.textContent = label || '';
  }

  function resetStageBase() {
    var stage = $('cameraTeachStage');
    var ideDialog = $('cameraTeachIdeDialog');
    var waveCard = $('cameraTeachWaveCard');
    if (stage) stage.className = 'camera-teach-stage';
    if (ideDialog) ideDialog.classList.remove('is-show');
    if (waveCard) {
      waveCard.style.opacity = '';
      waveCard.style.transform = '';
    }
  }

  function playStep(idx) {
    if (idx < 0) idx = 0;
    if (idx >= STEPS.length) idx = STEPS.length - 1;
    stepIndex = idx;
    activeExtra = '';
    var step = STEPS[stepIndex];
    var stage = $('cameraTeachStage');
    var ideDialog = $('cameraTeachIdeDialog');
    if (!stage || !step) return;

    renderNav();
    syncExtrasUi();

    var narrative = $('cameraTeachNarrative');
    if (narrative) narrative.innerHTML = NARRATIVES[step.id] || '';

    var nextBtn = $('cameraTeachNext');
    if (nextBtn) {
      nextBtn.textContent =
        stepIndex >= STEPS.length - 1
          ? t('cameraTeachDone', '完成')
          : t('cameraTeachNext', '下一步');
    }

    showCtx(step.ctx);
    resetStageBase();
    if (ideDialog) ideDialog.classList.toggle('is-show', step.id === 'shake');
    setHud('FACE LOCKED', false);

    if (step.id === 'back') {
      stage.classList.add('is-snap', 'is-away');
      setHud('TARGET LOST', true);
      void stage.offsetWidth;
      stage.classList.remove('is-snap', 'is-away');
      setHud('FACE LOCKED', false);
      stage.classList.add('is-back');
    } else if (step.id === 'away') {
      setHud('TARGET LOST', true);
      stage.classList.add('is-away');
    } else if (step.id === 'shake') {
      stage.classList.add('is-shake');
    }
  }

  function playExtra(id) {
    var meta = EXTRAS[id];
    if (!meta) return;
    var stage = $('cameraTeachStage');
    if (!stage) return;

    activeExtra = id;
    renderNav();
    syncExtrasUi();

    var narrative = $('cameraTeachNarrative');
    if (narrative) narrative.innerHTML = NARRATIVES[id] || '';

    var nextBtn = $('cameraTeachNext');
    if (nextBtn) nextBtn.textContent = t('cameraTeachNext', '下一步');

    showCtx(meta.ctx);
    resetStageBase();
    setHand(meta.emoji, meta.hand);
    setHud(meta.hud, false);

    if (id === 'wave') {
      var waveCard = $('cameraTeachWaveCard');
      if (waveCard) {
        waveCard.style.opacity = '1';
        waveCard.style.transform = 'translateX(0) rotate(0)';
      }
    }

    void stage.offsetWidth;
    stage.classList.add('is-' + id, 'is-' + id + '-active');
  }

  function next() {
    if (activeExtra) {
      // after an extra demo, resume main flow at current step's next
      if (stepIndex >= STEPS.length - 1) {
        close({ mark: true });
        return;
      }
      playStep(stepIndex + 1);
      return;
    }
    if (stepIndex >= STEPS.length - 1) {
      close({ mark: true });
      return;
    }
    playStep(stepIndex + 1);
  }

  function skip() {
    close({ mark: true });
  }

  function open(opts) {
    opts = opts || {};
    bindOnce();
    openFlag = true;
    openShell();
    if (opts.mark !== false) markSeen();
    playStep(typeof opts.step === 'number' ? opts.step : 0);
  }

  function close(opts) {
    opts = opts || {};
    stopAuto();
    openFlag = false;
    activeExtra = '';
    closeShell();
    if (opts.mark) markSeen();
    resetStageBase();
  }

  function isOpen() {
    return !!openFlag;
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var overlay = overlayEl();
    if (!overlay) return;

    overlay.addEventListener('click', function (e) {
      var extra = e.target.closest && e.target.closest('[data-camera-teach-extra]');
      if (extra) {
        playExtra(extra.getAttribute('data-camera-teach-extra'));
        return;
      }
      var tab = e.target.closest && e.target.closest('[data-camera-teach-step]');
      if (tab) {
        var idx = Number(tab.getAttribute('data-camera-teach-step'));
        if (!isNaN(idx)) playStep(idx);
        return;
      }
      if (e.target.closest('#cameraTeachClose') || e.target.closest('#cameraTeachSkip')) {
        skip();
        return;
      }
      if (e.target.closest('#cameraTeachNext')) {
        next();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!openFlag) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        skip();
      }
    });
  }

  global.OneToneCameraTeach = {
    open: open,
    close: close,
    isOpen: isOpen,
    playStep: playStep,
    playExtra: playExtra,
    TEACH_KEY: TEACH_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
