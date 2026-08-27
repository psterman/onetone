# 代码骨架：Activation Hub 接入示例

> 所有代码均为**草案**——不直接落地，落地时按 OneTone 现有 IIFE / global 风格微调。

## 1. 核心：`activation-hub.js`

新文件 `src/js/features/activation/activation-hub.js`：

```js
/**
 * Activation Hub — 统一激活态信号台
 *
 * 单一数据源：订阅 Rust 端 mvp_runtime_event，过滤出 voice-wake / voice-end 事件，
 * 向 FE 广播纯净的 activation:* 事件。
 *
 * 设计要点：
 *  - 同一时刻只有一个激活态
 *  - 高频 tick 不冒泡到 Rust
 *  - 错误隔离：单订阅者 throw 不影响其他
 */
(function (global) {
  'use strict';

  /** @type {'idle'|'listen'|'watch'|'think'|'done'} */
  var phase = 'idle';
  var session = null;          // 当前激活态的 session 对象
  var tickTimer = 0;           // 倒计时定时器
  var listeners = new Map();   // eventName -> Set<callback>

  // ────────── 公共 API ──────────

  /** 订阅事件 */
  function on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return function off() {
      var set = listeners.get(event);
      if (set) set.delete(cb);
    };
  }

  /** 广播事件（内部 + 外部） */
  function emit(event, payload) {
    var set = listeners.get(event);
    if (!set) return;
    set.forEach(function (cb) {
      try { cb(payload); }
      catch (e) {
        // 错误隔离：一个订阅者炸了不影响其他
        console.error('[activation-hub] listener error', event, e);
      }
    });
  }

  /** 进入激活态 */
  function activate(payload) {
    if (session) {
      // 重复触发：合并，刷新窗口
      session.windows = payload.windows;
      session.startedAt = payload.startedAt;
      emit('activation:refresh', session);
      return;
    }
    session = payload;
    phase = 'listen';
    emit('activation:on', session);
    emit('activation:phase', { phase: phase, enteredAt: Date.now() });
    startTickTimer();
  }

  /** 退出激活态 */
  function deactivate(reason) {
    if (!session) return;
    var durationMs = Date.now() - session.startedAt;
    stopTickTimer();
    var offPayload = {
      reason: reason,                       // 'commit' | 'cancel' | 'timeout' | 'error' | 'manual'
      durationMs: durationMs,
      endedAt: Date.now(),
    };
    phase = 'done';
    emit('activation:phase', { phase: 'done', enteredAt: Date.now() });
    emit('activation:off', offPayload);
    // 800ms 后回到 idle（让"完成"动画播完）
    setTimeout(function () {
      session = null;
      phase = 'idle';
      emit('activation:phase', { phase: 'idle', enteredAt: Date.now() });
    }, 800);
  }

  /** 切换阶段（外部可调用，例如 camera 启动后通知 hub 进入 watch） */
  function setPhase(next, payload) {
    if (phase === next) return;
    phase = next;
    emit('activation:phase', Object.assign({ phase: next, enteredAt: Date.now() }, payload || {}));
  }

  /** 上报错误（fatal=true 立即关闭） */
  function reportError(source, code, message, fatal) {
    emit('activation:error', { source: source, code: code, message: message, fatal: !!fatal });
    if (fatal) deactivate('error');
  }

  function getPhase() { return phase; }
  function getSession() { return session; }

  // ────────── 倒计时 ──────────

  function startTickTimer() {
    stopTickTimer();
    if (!session) return;
    tickTimer = setInterval(function () {
      if (!session) return;
      var remaining = session.windows.timeoutMs - (Date.now() - session.startedAt);
      var softClose = remaining <= session.windows.timeoutMs - session.windows.softCloseMs;
      emit('activation:tick', { remainingMs: Math.max(0, remaining), inSoftClose: softClose });
      if (remaining <= 0) {
        deactivate('timeout');
      }
    }, 1000);
  }
  function stopTickTimer() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  // ────────── 订阅 Rust runtime_event ──────────

  function bindIpcEvents() {
    if (!global.__TAURI_INTERNALS__ || !global.__TAURI_INTERNALS__.listen) return;
    global.__TAURI_INTERNALS__.listen('mvp_runtime_event', function (msg) {
      var evt = msg && msg.payload && msg.payload.event;
      if (!evt) return;
      // voice-wake.triggered → activate
      if (evt.source === 'voice' && /wake.*triggered/i.test(evt.kind)) {
        activate({
          source: 'voice-wake',
          trigger: { engine: 'vosk', phrase: evt.message || '', confidence: 1.0 },
          windows: { timeoutMs: 15000, softCloseMs: 5000 },
          startedAt: Date.now(),
        });
      }
      // voice-end.* → deactivate
      if (evt.source === 'voice_end') {
        if (/committed/i.test(evt.kind)) deactivate('commit');
        else if (/cancelled/i.test(evt.kind) || /canceled/i.test(evt.kind)) deactivate('cancel');
        else if (/timeout/i.test(evt.kind)) deactivate('timeout');
      }
    });
  }

  // ────────── 初始化 ──────────

  global.OneToneActivationHub = {
    on: on,
    activate: activate,
    deactivate: deactivate,
    setPhase: setPhase,
    reportError: reportError,
    getPhase: getPhase,
    getSession: getSession,
    _bindIpcEvents: bindIpcEvents,
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

## 2. 入口挂载（不动现有代码逻辑）

在 `src/index.html` 的 `<script>` 链最后面追加：

```html
<script src="js/features/activation/activation-hub.js"></script>
<script>
  // 延迟到 Tauri 准备好后绑定
  document.addEventListener('DOMContentLoaded', function () {
    if (window.OneToneActivationHub && window.OneToneActivationHub._bindIpcEvents) {
      window.OneToneActivationHub._bindIpcEvents();
    }
  });
</script>
```

## 3. 订阅者示例：codex-micro-overlay

在 `codex-micro-overlay.html` 的 `<script>` 末尾追加：

```js
// 渲染 3 个激活态指示位
var hub = window.OneToneActivationHub;
if (hub) {
  hub.on('activation:on', function (sess) {
    document.getElementById('actIndicatorMic').classList.add('is-on');
    document.getElementById('actIndicatorCam').classList.add('is-on');
    document.getElementById('actIndicatorThink').classList.add('is-on');
    document.getElementById('actBar').classList.add('is-activated');
  });
  hub.on('activation:phase', function (p) {
    ['listen', 'watch', 'think', 'done'].forEach(function (k) {
      document.getElementById('actBar').classList.toggle('is-phase-' + k, p.phase === k);
    });
  });
  hub.on('activation:tick', function (t) {
    var el = document.getElementById('actCountdown');
    if (el) el.textContent = Math.ceil(t.remainingMs / 1000) + 's';
  });
  hub.on('activation:off', function (o) {
    document.getElementById('actIndicatorMic').classList.remove('is-on');
    document.getElementById('actIndicatorCam').classList.remove('is-on');
    document.getElementById('actIndicatorThink').classList.remove('is-on');
    document.getElementById('actBar').classList.remove('is-activated');
  });
}
```

## 4. 订阅者示例：camera-presence-actions

在 `camera-presence-actions.js` 初始化时：

```js
(function (global) {
  var hub = global.OneToneActivationHub;
  if (!hub) return;  // hub 还没加载：保持现有手动启动行为

  hub.on('activation:on', function () {
    // 启动 presence / gesture / gaze
    startPresenceDetection();
  });
  hub.on('activation:off', function () {
    stopPresenceDetection();
  });

  // camera 启动成功后，通知 hub 进入 watch 阶段
  function onCameraReady() {
    hub.setPhase('watch', { cameraEvent: 'face-detected' });
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

## 5. 订阅者示例：visual-agent

```js
var hub = window.OneToneActivationHub;
if (hub) {
  hub.on('activation:on', function () {
    visualContextPipe.start();
  });
  hub.on('activation:phase', function (p) {
    if (p.phase === 'think' && p.payload && p.payload.agentAction) {
      visualContextPipe.handleAction(p.payload.agentAction);
    }
  });
  hub.on('activation:off', function () {
    visualContextPipe.stop();
  });
}
```

## 6. 阶段推进规则（建议默认实现）

```js
// 订阅者可以通过 setPhase 推进阶段：
//  listen（默认） → 用户说话
//  watch → camera 启动并检测到人脸
//  think → visual-agent 触发了一个动作
//  done → commit/cancel/timeout
hub.on('activation:on', function () {
  // 默认 phase = 'listen'，由 activate() 自动设置
  // camera 启动后：
  setTimeout(function () {
    if (hub.getPhase() === 'listen') hub.setPhase('watch');
  }, 800);
  // 用户说出"打开 XX"这种命令式短语，visual-agent 接管：
  // hub.setPhase('think', { agentAction: 'open-app' });
});
```

## 7. 风险与回退

- **不接入的模块**：现有行为完全不变（hub 是纯增量）
- **hub 加载失败**：所有 `if (window.OneToneActivationHub)` 判断兜底，fallback 到原行为
- **Rust 端事件名变更**：契约文档里以"正则匹配"留出兼容空间（`/wake.*triggered/i`）
- **重复触发**：activate() 内部合并，不会有多个 session 并存
