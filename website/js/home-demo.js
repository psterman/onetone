(function () {
  "use strict";

  function createHandleMap() {
    const intervals = new Set();
    const timeouts = new Set();
    return {
      setInterval(fn, ms) {
        const id = window.setInterval(function () {
          if (intervals.has(id)) fn();
        }, ms);
        intervals.add(id);
        return id;
      },
      setTimeout(fn, ms) {
        const id = window.setTimeout(function () {
          if (timeouts.has(id)) {
            timeouts.delete(id);
            fn();
          }
        }, ms);
        timeouts.add(id);
        return id;
      },
      clearAll() {
        intervals.forEach(function (id) { window.clearInterval(id); });
        timeouts.forEach(function (id) { window.clearTimeout(id); });
        intervals.clear();
        timeouts.clear();
      },
      clearInterval(id) {
        window.clearInterval(id);
        intervals.delete(id);
      },
      clearTimeout(id) {
        window.clearTimeout(id);
        timeouts.delete(id);
      },
    };
  }

  function createDemoHandle(runLoop, opts) {
    opts = opts || {};
    const handles = createHandleMap();
    let running = false;
    let paused = false;
    let cancelled = false;
    let iterationController = null;
    let pendingSleepAbort = null;
    const beatListeners = [];

    function cancellableSleep(ms) {
      return new Promise(function (resolve, reject) {
        if (cancelled) return reject(new Error("cancelled"));
        const id = handles.setTimeout(function () {
          if (pendingSleepAbort && pendingSleepAbort.id === id) pendingSleepAbort = null;
          resolve();
        }, ms);
        const entry = {
          id: id,
          cancel: function () {
            handles.clearTimeout(id);
            if (pendingSleepAbort && pendingSleepAbort.id === id) pendingSleepAbort = null;
            reject(new Error("cancelled"));
          },
        };
        pendingSleepAbort = entry;
      });
    }

    async function loop() {
      while (!cancelled) {
        if (paused || !running) {
          try {
            await cancellableSleep(200);
          } catch (e) {
            if (cancelled) return; // loop 退出
            // paused 引起的 abort：静默回到 while 顶部重新检查状态
          }
          continue;
        }
        iterationController = new AbortController();
        try {
          await runLoop({
            sleep: cancellableSleep,
            beat: function () {
              beatListeners.forEach(function (fn) { fn(); });
            },
            isActive: function () { return running && !paused && !cancelled; },
          });
        } catch (e) {
          if (cancelled || paused) {
            // 正常 cancel 或 pause 引起的 abort：静默
          } else {
            console.warn("[OneToneHomeDemo]", e);
          }
        } finally {
          iterationController = null;
        }
      }
    }

    return {
      play() {
        if (running && !paused) return;
        if (!running) {
          cancelled = false;
          loop();
        }
        running = true;
        paused = false;
        if (pendingSleepAbort) pendingSleepAbort.cancel();
      },
      pause() {
        paused = true;
        if (pendingSleepAbort) pendingSleepAbort.cancel();
      },
      cancel() {
        cancelled = true;
        running = false;
        paused = false;
        if (pendingSleepAbort) {
          pendingSleepAbort.cancel();
          pendingSleepAbort = null;
        }
        if (iterationController) {
          iterationController.abort();
          iterationController = null;
        }
        handles.clearAll();
      },
      get isRunning() {
        return running && !paused && !cancelled;
      },
      onBeat(fn) {
        if (typeof fn === "function") beatListeners.push(fn);
      },
    };
  }

  let heroController = null;

  function initHero() {
    const demoWrap = document.getElementById("demoWrap");
    const opDemo = document.getElementById("opDemo");
    const spatialWrap = document.getElementById("spatialWrap");
    const secHero = document.getElementById("sec-hero");
    const handles = createHandleMap();
    let paused = false;
    let parallaxOff = false;
    let introDone = false;
    let currentIndex = 0;
    let onMouseMove = null;
    let onMouseLeave = null;

    if (demoWrap && secHero && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onMouseMove = function (e) {
        if (paused || parallaxOff) return;
        const rect = demoWrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const deltaX = (x - centerX) / centerX;
        const deltaY = (y - centerY) / centerY;
        opDemo.style.transform =
          "rotateY(" + deltaX * 8 + "deg) rotateX(" + -deltaY * 8 + "deg) translateY(-6px) scale(1.02)";
        opDemo.style.boxShadow =
          -deltaX * 15 + "px " + (deltaY * 15 + 40) + "px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.2)";
        if (spatialWrap) {
          spatialWrap.style.transform =
            "translateX(" + -deltaX * 20 + "px) translateY(" + -deltaY * 20 + "px)";
        }
      };
      onMouseLeave = function () {
        if (paused || parallaxOff) return;
        opDemo.style.transform = "rotateY(0deg) rotateX(0deg) translateY(0) scale(1)";
        opDemo.style.boxShadow = "";
        if (spatialWrap) spatialWrap.style.transform = "translateX(0) translateY(0)";
      };
      secHero.addEventListener("mousemove", onMouseMove);
      secHero.addEventListener("mouseleave", onMouseLeave);
    }

    const opScenes = [
      {
        label: "Cursor",
        app: "Cursor",
        icon: "assets/brands/cursor.png",
        typed: "把这个按钮改成圆角，跟主色一致",
        gesture: false,
        deviceSVG:
          '<svg viewBox="0 0 100 140" width="80" height="112"><rect x="20" y="10" width="60" height="120" rx="30" fill="rgba(30,30,32,0.9)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/><circle cx="15" cy="55" r="4" fill="currentColor" class="device-led"/></svg>',
        pose: { r: "-15deg", tx: "10px", ty: "10px", hsX: "15%", hsY: "40%" },
        render() {
          return (
            '<div class="ui-cursor"><div class="ui-cursor-sidebar"><img class="op-brand-icon" src="assets/brands/cursor.png" alt="" width="24" height="24"></div>' +
            '<div class="ui-cursor-main"><div class="ui-cursor-msgs"><div class="ui-cursor-msg is-user">这个按钮样式有点乱</div>' +
            '<div class="ui-cursor-msg is-ai">我可以帮你改。想要圆角还是方角？</div></div>' +
            '<div class="ui-composer-inner"><span class="ui-composer-placeholder">Plan, @ for context</span>' +
            '<span class="op-input-text"></span><span class="op-caret"></span></div></div></div>'
          );
        },
      },
      {
        label: "Claude Code",
        app: "Terminal",
        icon: "assets/brands/claude.png",
        typed: "帮我把这个页面改窄一点",
        gesture: true,
        deviceSVG:
          '<svg viewBox="0 0 100 100" width="70" height="70"><circle cx="50" cy="50" r="40" fill="rgba(30,30,32,0.6)" stroke="rgba(255,255,255,0.2)" stroke-width="12"/><circle cx="50" cy="16" r="3" fill="currentColor" class="device-led"/></svg>',
        pose: { r: "5deg", tx: "0px", ty: "15px", hsX: "50%", hsY: "16%" },
        render() {
          return (
            '<div class="ui-claude"><div class="ui-claude-head"><img class="op-brand-icon" src="assets/brands/claude.png" alt="" width="24" height="24"><span>Claude Code</span></div>' +
            '<div class="ui-claude-prompt"><span class="ui-claude-chevron">›</span><span class="ui-composer-placeholder">说一句指令…</span>' +
            '<span class="op-input-text"></span><span class="op-caret"></span></div></div>'
          );
        },
      },
      {
        label: "Trae",
        app: "Trae",
        icon: "assets/brands/trae.png",
        typed: "写一段产品介绍，语气轻松点",
        gesture: false,
        deviceSVG:
          '<svg viewBox="0 0 140 100" width="112" height="80"><path d="M20 40 C20 10,50 10,70 20 C90 10,120 10,120 40 C120 70,140 90,120 90 C100 90,80 70,70 70 C60 70,40 90,20 90 C0 90,20 70,20 40 Z" fill="rgba(30,30,32,0.9)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/><circle cx="105" cy="20" r="4" fill="currentColor" class="device-led"/></svg>',
        pose: { r: "-8deg", tx: "-5px", ty: "5px", hsX: "75%", hsY: "25%" },
        render() {
          return (
            '<div class="ui-doubao"><div class="ui-doubao-head"><img class="op-brand-icon is-lg" src="assets/brands/trae.png" alt="" width="28" height="28"><span>Trae</span></div>' +
            '<div class="ui-composer-inner"><span class="ui-composer-placeholder">发消息...</span><span class="op-input-text"></span><span class="op-caret"></span></div></div>'
          );
        },
      },
    ];

    const opStage = document.getElementById("opStage");
    const opAppBody = document.getElementById("opAppBody");
    const opAction = document.getElementById("opAction");
    const opDeviceSvgWrap = document.getElementById("opDeviceSvgWrap");
    const dsCode = document.getElementById("dsCode");
    const dsDesc = document.getElementById("dsDesc");
    const dsDot = document.getElementById("dsDot");
    const dsPanel = document.getElementById("demoStatusPanel");

    if (!opStage || !opAppBody) {
      return {
        pauseHero: function () {},
        resumeHero: function () {},
        destroyHero: function () {},
        isIntroDone: function () { return false; },
      };
    }

    function updateStatusPanel(phase, text) {
      if (!dsPanel) return;
      if (phase === "idle") {
        if (dsCode) dsCode.textContent = "待机中";
        if (dsCode) dsCode.classList.remove("is-active");
        if (dsDot) dsDot.classList.remove("is-active");
        if (dsDesc) dsDesc.textContent = "等你按一下外设…";
      } else if (phase === "trigger") {
        if (dsCode) { dsCode.textContent = "收到按键"; dsCode.classList.add("is-active"); }
        if (dsDot) dsDot.classList.add("is-active");
        if (dsDesc) dsDesc.textContent = "正在帮你开麦。";
      } else if (phase === "listen") {
        if (dsCode) dsCode.textContent = "正在听";
        if (dsDesc) dsDesc.textContent = "说吧，字马上跟上…";
      } else if (phase === "typing") {
        if (dsCode) dsCode.textContent = "正在上屏";
        if (dsDesc) dsDesc.textContent = "正在打出：「" + text + "」";
      }
    }

    function renderScene(index) {
      const scene = opScenes[index % opScenes.length];
      const opAppName = document.getElementById("opAppName");
      const opSceneLabelText = document.getElementById("opSceneLabelText");
      const sceneIcon = document.getElementById("opSceneIcon");
      if (opAppName) opAppName.textContent = scene.app;
      if (opSceneLabelText) opSceneLabelText.textContent = scene.label;
      if (sceneIcon) { sceneIcon.src = scene.icon; sceneIcon.alt = scene.label; }
      opAppBody.innerHTML = scene.render();
      if (opDeviceSvgWrap) opDeviceSvgWrap.innerHTML = scene.deviceSVG;
      if (opAction) {
        opAction.style.setProperty("--pose-r", scene.pose.r);
        opAction.style.setProperty("--pose-tx", scene.pose.tx);
        opAction.style.setProperty("--pose-ty", scene.pose.ty);
        opAction.style.setProperty("--hs-x", scene.pose.hsX);
        opAction.style.setProperty("--hs-y", scene.pose.hsY);
        opAction.classList.toggle("has-gesture", scene.gesture);
      }
      const dotsContainer = document.getElementById("opSceneDots");
      if (dotsContainer) {
        dotsContainer.innerHTML = opScenes
          .map(function (_, i) {
            return '<div class="w-2 h-2 rounded-full transition-colors ' +
              (i === index % opScenes.length ? "bg-mac-accent" : "bg-white/20") + '"></div>';
          })
          .join("");
      }
      return scene;
    }

    function hideComposerPlaceholder() {
      opAppBody.querySelectorAll(".ui-composer-placeholder").forEach(function (el) {
        el.classList.add("is-hidden");
      });
    }

    function startTimeline(index) {
      if (paused) return;
      currentIndex = index;
      const scene = renderScene(index);
      const typedText = scene.typed;
      opStage.className = "op-demo-stage phase-idle";
      updateStatusPanel("idle");

      handles.setTimeout(function () {
        if (paused) return;
        opStage.className = "op-demo-stage phase-trigger";
        updateStatusPanel("trigger");
      }, 1500);

      handles.setTimeout(function () {
        if (paused) return;
        opStage.className = "op-demo-stage phase-listen";
        updateStatusPanel("listen");
        hideComposerPlaceholder();
      }, 2500);

      handles.setTimeout(function () {
        if (paused) return;
        opStage.className = "op-demo-stage phase-typing";
        updateStatusPanel("typing", typedText);
        hideComposerPlaceholder();
        const typedEl = opAppBody.querySelector(".op-input-text");
        if (!typedEl) return;
        let i = 0;
        typedEl.textContent = "";
        const typeInterval = handles.setInterval(function () {
          if (paused) return;
          if (i < typedText.length) {
            typedEl.textContent += typedText[i];
            i++;
          } else {
            handles.clearInterval(typeInterval);
            opStage.className = "op-demo-stage phase-done";
            if (index === 0) introDone = true;
            handles.setTimeout(function () { startTimeline(index + 1); }, 3000);
          }
        }, 80);
      }, 4000);
    }

    startTimeline(0);

    const heroRotate = document.getElementById("heroRotate");
    if (heroRotate) {
      const lines = ["Cursor 里直接说", "Claude Code 里直接说", "Trae 里直接说", "任何输入框里直接说"];
      let hi = 0;
      handles.setInterval(function () {
        if (paused) return;
        hi = (hi + 1) % lines.length;
        heroRotate.textContent = lines[hi];
      }, 2800);
    }

    heroController = {
      pauseHero(mode) {
        parallaxOff = true;
        paused = true;
        if (onMouseLeave) onMouseLeave();
        // 软停顿和硬停顿都真正停止内部动画 + 取消 pending 计时器
        // resumeHero() 会从 currentIndex 重启，避免链死锁
        handles.clearAll();
        // 立即把 phase 重置为 idle，避免 hero 重新可见时显示中间态
        if (opStage) opStage.className = "op-demo-stage phase-idle";
        // mode 字段保留为 hook，便于将来 soft/hard 行为分化
        void mode;
      },
      resumeHero() {
        const wasPaused = paused;
        paused = false;
        parallaxOff = false;
        if (wasPaused) {
          startTimeline(currentIndex);
        }
      },
      destroyHero() {
        paused = true;
        parallaxOff = true;
        handles.clearAll();
        if (secHero && onMouseMove) secHero.removeEventListener("mousemove", onMouseMove);
        if (secHero && onMouseLeave) secHero.removeEventListener("mouseleave", onMouseLeave);
      },
      isIntroDone: function () { return introDone; },
    };
    return heroController;
  }

  function initTriggerDemo(root) {
    root = root || document;
    const flowItems = root.querySelectorAll(".command-item");
    if (!flowItems.length) return { play: function () {}, pause: function () {}, cancel: function () {}, isRunning: false, onBeat: function () {} };

    const flowStatus = root.querySelector("[data-flow-status]");
    const flowCurrent = root.querySelector("[data-flow-current]");
    const flowResult = root.querySelector("[data-flow-result]");
    const statuses = ["鼠标侧键已记录", "手柄按键已记录", "蓝牙戒指已记录", "麦克风口令已记录"];
    const results = [
      "按下鼠标侧键后，说的话会蹦进当前输入框。",
      "按下手柄，沙发上也能口述周报。",
      "轻点戒指，假装还在认真打字。",
      "说出口令，麦克风也会帮你开麦。",
    ];
    let flowIndex = 0;

    return createDemoHandle(async function (ctx) {
      while (ctx.isActive()) {
        flowItems.forEach(function (item, i) {
          item.classList.toggle("is-active", i === flowIndex);
        });
        if (flowCurrent) flowCurrent.textContent = flowItems[flowIndex].querySelector("strong").textContent;
        if (flowStatus) flowStatus.textContent = statuses[flowIndex];
        if (flowResult) flowResult.textContent = results[flowIndex];
        ctx.beat();
        flowIndex = (flowIndex + 1) % flowItems.length;
        await ctx.sleep(1800);
      }
    }, { restartOnPlay: false });
  }

  function initVoiceDemo(root) {
    root = root || document;
    const typed1 = root.querySelector("#ime-typed-1") || document.getElementById("ime-typed-1");
    const caret1 = root.querySelector("#ime-caret-1") || document.getElementById("ime-caret-1");
    const status1 = root.querySelector("#ime-status-1") || document.getElementById("ime-status-1");
    const waves1 = root.querySelector("#ime-waves-1") || document.getElementById("ime-waves-1");
    const bar1 = root.querySelector("#ime-bar-1") || document.getElementById("ime-bar-1");
    const cancelChip = root.querySelector("#ime-cancel-chip") || document.getElementById("ime-cancel-chip");
    const text1 = "今天就把这句想法说出来。";
    const textRetry = "重来一遍，这次更顺。";

    if (!typed1) return { play: function () {}, pause: function () {}, cancel: function () {}, isRunning: false, onBeat: function () {} };

    return createDemoHandle(async function (ctx) {
      while (ctx.isActive()) {
        typed1.textContent = "";
        if (caret1) caret1.style.display = "none";
        if (status1) status1.textContent = "等待口令唤醒...";
        if (waves1) waves1.style.opacity = "0";
        if (bar1) bar1.classList.remove("is-active");
        await ctx.sleep(450);
        if (!ctx.isActive()) break;

        if (status1) status1.textContent = "正在聆听...";
        if (waves1) waves1.style.opacity = "1";
        if (bar1) bar1.classList.add("is-active");
        if (caret1) caret1.style.display = "inline-block";
        ctx.beat();
        await ctx.sleep(700);

        for (let i = 0; i < text1.length && ctx.isActive(); i++) {
          typed1.textContent += text1[i];
          await ctx.sleep(70);
        }
        if (!ctx.isActive()) break;

        if (cancelChip) cancelChip.classList.add("is-visible");
        if (status1) status1.textContent = "按 Esc 取消…";
        ctx.beat();
        await ctx.sleep(900);
        if (cancelChip) cancelChip.classList.remove("is-visible");
        typed1.textContent = "";
        if (status1) status1.textContent = "正在聆听...";
        if (waves1) waves1.style.opacity = "1";
        await ctx.sleep(400);

        for (let j = 0; j < textRetry.length && ctx.isActive(); j++) {
          typed1.textContent += textRetry[j];
          await ctx.sleep(70);
        }
        if (status1) status1.textContent = "已自动上屏并发送";
        if (waves1) waves1.style.opacity = "0";
        if (bar1) bar1.classList.remove("is-active");
        if (caret1) caret1.style.display = "none";
        await ctx.sleep(1800);
      }
    }, { restartOnPlay: false });
  }

  function initSoftPadTeaser(root) {
    root = root || document;
    const visual = root.querySelector("#pad-teaser-visual") || root.querySelector(".pad-teaser-visual");
    const pillFull = root.querySelector("#pad-teaser-full");
    const pillMini = root.querySelector("#pad-teaser-mini");
    if (!visual) return { play: function () {}, pause: function () {}, cancel: function () {}, isRunning: false, onBeat: function () {} };

    let mini = false;
    return createDemoHandle(async function (ctx) {
      while (ctx.isActive()) {
        mini = !mini;
        visual.classList.toggle("is-mini", mini);
        if (pillFull) pillFull.classList.toggle("is-active", !mini);
        if (pillMini) pillMini.classList.toggle("is-active", mini);
        ctx.beat();
        await ctx.sleep(mini ? 1800 : 2000);
      }
    }, { restartOnPlay: false });
  }

  function initTailReveal() {
    const revealSections = document.querySelectorAll("#sec-brands, #sec-quotes");
    if (!revealSections.length) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const showSection = function (section) {
      section.classList.add("is-shown");
      section.querySelectorAll(".apple-reveal").forEach(function (el) { el.classList.add("is-in"); });
    };
    if (reduceMotion) {
      revealSections.forEach(showSection);
      return;
    }
    const revealObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          showSection(e.target);
          revealObs.unobserve(e.target);
        });
      },
      { threshold: 0.22, rootMargin: "0px 0px -12% 0px" }
    );
    revealSections.forEach(function (s) { revealObs.observe(s); });
  }

  const demos = { trigger: null, voice: null, softpad: null };

  function boot() {
    heroController = initHero();
    const triggerRoot = document.getElementById("ch-trigger") || document.getElementById("sec-chain");
    const voiceRoot = document.getElementById("ch-voice") || document.getElementById("sec-caps");
    const padRoot = document.getElementById("ch-softpad");
    if (triggerRoot) demos.trigger = initTriggerDemo(triggerRoot);
    if (voiceRoot) demos.voice = initVoiceDemo(voiceRoot);
    if (padRoot) demos.softpad = initSoftPadTeaser(padRoot);
    initTailReveal();
    document.dispatchEvent(new CustomEvent("onetone:home-demo-ready"));
  }

  window.OneToneHomeDemo = {
    initHero: initHero,
    pauseHero: function (mode) {
      if (heroController) heroController.pauseHero(mode || "hard");
    },
    resumeHero: function () {
      if (heroController) heroController.resumeHero();
    },
    isHeroIntroDone: function () {
      return heroController && heroController.isIntroDone ? heroController.isIntroDone() : false;
    },
    destroyHero: function () {
      if (heroController) heroController.destroyHero();
    },
    initTriggerDemo: initTriggerDemo,
    initVoiceDemo: initVoiceDemo,
    initSoftPadTeaser: initSoftPadTeaser,
    getDemo: function (name) { return demos[name] || null; },
    cancel: function () {
      Object.keys(demos).forEach(function (k) {
        if (demos[k]) demos[k].cancel();
      });
    },
    destroy: function () {
      Object.keys(demos).forEach(function (k) {
        if (demos[k]) demos[k].cancel();
      });
      if (heroController) heroController.destroyHero();
    },
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
