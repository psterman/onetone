(function (global) {
  var timer = 0;
  var overlayId = 'demoOverlay';
  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {}

  var script = [
    { t: 0, press: true, live: false, wave: false, composer: '', bubble: null, toast: null, caption: '按下 Soft Pad 麦键…' },
    { t: 450, press: false, live: true, wave: true, composer: 'focus', bubble: null, toast: null, caption: '收听中 · 说一个短词' },
    { t: 1400, press: false, live: true, wave: true, composer: 'focus', bubble: { text: '「发送」', done: false }, toast: null, caption: '识别到说法' },
    { t: 2300, press: false, live: false, wave: false, composer: 'focus', bubble: { text: '「发送」→ 提交本轮', done: true }, toast: '已提交本轮', caption: '执行对应动作' },
    { t: 3600, press: false, live: true, wave: true, composer: 'focus', bubble: null, toast: null, caption: '继续收听…' },
    { t: 4500, press: false, live: true, wave: true, composer: 'focus', bubble: { text: '「继续」', done: false }, toast: null, caption: '识别到说法' },
    { t: 5400, press: false, live: false, wave: false, composer: 'focus', bubble: { text: '「继续」→ Agent 继续', done: true }, toast: 'Agent 继续', caption: 'Soft 槽动作' },
    { t: 6600, press: false, live: true, wave: true, composer: '', bubble: null, toast: null, caption: '再说「取消」退出' },
    { t: 7500, press: false, live: true, wave: true, composer: '', bubble: { text: '「取消」', done: false }, toast: null, caption: '识别到说法' },
    { t: 8400, press: false, live: false, wave: false, composer: '', bubble: { text: '「取消」→ 退出收听', done: true }, toast: '已退出收听', caption: '演示结束 · 可重播' }
  ];

  function els() {
    return {
      mic: document.getElementById('simMic'),
      wave: document.getElementById('simWave'),
      composer: document.getElementById('simComposer'),
      bubble: document.getElementById('simBubble'),
      bubbleText: document.getElementById('simBubbleText'),
      toast: document.getElementById('simToast'),
      caption: document.getElementById('simCaption')
    };
  }

  function paint(step) {
    var e = els();
    if (!e.mic) return;
    e.mic.classList.toggle('is-press', !!step.press);
    e.mic.classList.toggle('is-live', !!step.live);
    e.wave.classList.toggle('is-on', !!step.wave);
    e.composer.classList.toggle('is-focus', step.composer === 'focus');
    e.composer.textContent = step.composer === 'focus' ? '▌' : '输入框就绪';
    if (step.bubble) {
      e.bubble.hidden = false;
      e.bubbleText.textContent = step.bubble.text;
      e.bubble.classList.toggle('is-done', !!step.bubble.done);
    } else {
      e.bubble.hidden = true;
      e.bubble.classList.remove('is-done');
    }
    if (step.toast) {
      e.toast.hidden = false;
      e.toast.textContent = step.toast;
    } else {
      e.toast.hidden = true;
    }
    e.caption.textContent = step.caption;
  }

  function clearTimers() {
    clearTimeout(timer);
    script.forEach(function (s) {
      if (s._tid) clearTimeout(s._tid);
    });
  }

  function run() {
    clearTimers();
    paint(script[0]);
    if (reduce) {
      paint(script[3]);
      return;
    }
    script.forEach(function (s, i) {
      s._tid = setTimeout(function () {
        paint(s);
        if (i === script.length - 1) {
          timer = setTimeout(run, 2200);
        }
      }, s.t);
    });
  }

  function open(id) {
    overlayId = id || 'demoOverlay';
    var el = document.getElementById(overlayId);
    if (el) el.hidden = false;
    run();
  }

  function close() {
    clearTimers();
    var el = document.getElementById(overlayId);
    if (el) el.hidden = true;
  }

  function replay() {
    run();
  }

  global.ORAL_SIM = { open: open, close: close, replay: replay };
})(window);
