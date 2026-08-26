(function () {
  "use strict";

  var CHAPTERS = ["ch-trigger", "ch-voice", "ch-softpad"];
  var RAIL_TARGETS = [
    "#sec-hero",
    "#ch-trigger",
    "#ch-voice",
    "#ch-softpad",
    "#sec-brands",
    "#sec-quotes",
    "#site-download-cta",
  ];
  var COUNTER_KEYS = ["homeStoryCounter1", "homeStoryCounter2", "homeStoryCounter3"];
  var COUNTER_FALLBACK = ["01 / 03", "02 / 03", "03 / 03"];
  var HEADER = 64;
  var ENTER_END = 0.2;
  var HOLD_END = 0.8;
  var EXIT_START = 0.8;
  var EXIT_MOVE_END = 0.92;
  var DEMO_PLAY_START = 0.12;
  var DEMO_PLAY_END = 0.88;
  var HERO_HARD_PAUSE = 0.35;
  var SCRUB_NOPIN = 0.55;
  var chapterPrimed = {};

  var brandsHandoffFired = false;
  var initScheduled = false;
  var railBound = false;
  var lastStoryMode = null;
  var currentUsePin = false;

  var LENS_REST = {
    y: 0,
    x: 0,
    z: 0,
    opacity: 1,
    rotateX: 0,
    rotateY: 0,
    scale: 1,
    transformPerspective: 1200,
  };

  function getDemo(name) {
    return window.OneToneHomeDemo && OneToneHomeDemo.getDemo(name);
  }

  function counterText(i) {
    var key = COUNTER_KEYS[i];
    if (window.OneToneI18n && OneToneI18n.t) return OneToneI18n.t(key, COUNTER_FALLBACK[i]);
    return COUNTER_FALLBACK[i];
  }

  function getLens(section) {
    return section.querySelector(".camera-rig-lens") || section.querySelector(".camera-rig");
  }

  function isHeroIntroDone() {
    return window.OneToneHomeDemo && OneToneHomeDemo.isHeroIntroDone && OneToneHomeDemo.isHeroIntroDone();
  }

  function getStoryMode() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduced";
    if (window.matchMedia("(max-width: 768px) and (hover: none)").matches) return "mobile";
    if (window.matchMedia("(min-width: 768px) and (hover: hover)").matches) return "pin";
    return "nopin";
  }

  function bindDemoLifecycleStatic() {
    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var demo = getDemo(section.dataset.chapter);
      if (demo) demo.play();
    });
  }

  function clearChapterTransforms() {
    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var targets = section.querySelectorAll(
        ".camera-rig-lens, .camera-rig, .chapter-copy, .chapter-demo-wrap, .story-bridge__line, .pad-teaser-visual"
      );
      if (targets.length) gsap.set(targets, { clearProps: "transform,opacity" });
    });
  }

  function guardReducedMotion() {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    document.documentElement.classList.add("story-reduced-motion");
    if (window.gsap) gsap.set(".camera-rig-lens, .camera-rig", { clearProps: "all" });
    return true;
  }

  function guardMobile() {
    if (!window.matchMedia("(max-width: 768px) and (hover: none)").matches) return false;
    document.documentElement.classList.add("story-mobile-static");
    if (window.gsap) gsap.set(".camera-rig-lens, .camera-rig", { clearProps: "all" });
    return true;
  }

  function setRailBridgeDim(on) {
    var rail = document.querySelector(".scroll-rail");
    if (rail) rail.classList.toggle("is-bridge-dim", !!on);
  }

  function setCounterHidden(hidden) {
    var counter = document.querySelector(".story-chapter-counter");
    if (counter) counter.classList.toggle("is-hidden", !!hidden);
  }

  function getChapterST(index) {
    var section = document.getElementById(CHAPTERS[index]);
    if (!section) return null;
    var found = null;
    ScrollTrigger.getAll().forEach(function (st) {
      if (st.trigger === section) found = st;
    });
    return found;
  }

  function shouldStackShow(index) {
    if (!currentUsePin) return true;
    var pinnedIndex = -1;
    CHAPTERS.forEach(function (id, i) {
      var st = getChapterST(i);
      if (st && st.isActive) pinnedIndex = i;
    });
    if (pinnedIndex < 0) return index === 0;
    if (index === pinnedIndex) return true;
    if (index === pinnedIndex + 1) {
      var cur = getChapterST(pinnedIndex);
      return !!(cur && cur.progress >= EXIT_START);
    }
    if (index === pinnedIndex - 1) {
      var next = getChapterST(pinnedIndex);
      return !!(next && next.progress < 0.08);
    }
    return false;
  }

  function updateChapterStack() {
    if (!currentUsePin) return;
    CHAPTERS.forEach(function (id, i) {
      var section = document.getElementById(id);
      if (section) section.classList.toggle("is-stack-visible", shouldStackShow(i));
    });
  }

  function syncChapterState(chapterId, progress, chapterIndex, section, isActive) {
    var active = !!isActive && progress > 0.01 && progress < 0.99;
    if (section) {
      section.classList.toggle("is-story-active", active);
      section.classList.toggle("is-chapter-pinned", !!isActive);
    }

    var demo = getDemo(chapterId);
    if (demo) {
      var shouldPlay = isActive && progress > DEMO_PLAY_START && progress < DEMO_PLAY_END;
      if (shouldPlay) {
        if (chapterId === "voice") {
          if (!chapterPrimed[chapterId]) {
            chapterPrimed[chapterId] = true;
            if (demo.cancel) demo.cancel();
            demo.play();
          } else {
            demo.play();
          }
        } else {
          demo.play();
        }
      } else {
        demo.pause();
        if (progress < 0.04) chapterPrimed[chapterId] = false;
      }
    }

    var counter = document.querySelector(
      ".story-chapter-counter [data-i18n^='homeStoryCounter'], .story-chapter-counter span"
    );
    if (counter && progress > ENTER_END && progress < HOLD_END) {
      counter.textContent = counterText(chapterIndex);
      counter.setAttribute("data-i18n", COUNTER_KEYS[chapterIndex]);
    }

    var bridgeOut = section && section.querySelector(".story-bridge-out .story-bridge__line");
    var bridgeIn = section && section.querySelector(".story-bridge-in .story-bridge__line");
    var bridgeVisible =
      (bridgeOut && progress > 0.92 && progress < 1) ||
      (bridgeIn && progress > 0 && progress < 0.12);
    setRailBridgeDim(bridgeVisible);
    updateChapterStack();

    // Brands handoff: 在 ch-softpad 出口时触发，让 pad 缩回与品牌墙弹入视觉连续
    if (chapterId === "softpad" && progress > 0.88) {
      runBrandsHandoff();
    }
  }

  function runBrandsHandoff() {
    if (brandsHandoffFired) return;
    var brands = document.getElementById("sec-brands");
    if (!brands) return;
    var items = brands.querySelectorAll(".home-brand-item");
    if (!items.length) return;
    brandsHandoffFired = true;
    gsap.fromTo(
      items,
      { scale: 0.85, opacity: 0.3 },
      { scale: 1, opacity: 1, stagger: 0.035, duration: 0.5, ease: "power2.out" }
    );
    brands.classList.add("is-handoff-done");
  }

  function bindBrandsHandoff() {
    var brands = document.getElementById("sec-brands");
    if (!brands) return;
    ScrollTrigger.create({
      trigger: brands,
      start: "top 85%",
      once: true,
      onEnter: runBrandsHandoff,
    });
  }

  function bindStoryCounterVisibility() {
    var world = document.getElementById("story-world");
    if (!world) return;
    ScrollTrigger.create({
      trigger: world,
      start: "top 90%",
      end: "bottom 10%",
      onEnter: function () {
        setCounterHidden(false);
      },
      onLeave: function () {
        setCounterHidden(true);
      },
      onEnterBack: function () {
        setCounterHidden(false);
      },
      onLeaveBack: function () {
        setCounterHidden(true);
      },
    });
  }

  function buildHeroExitTimeline() {
    var hero = document.getElementById("sec-hero");
    if (!hero || !window.gsap) return;

    var heroSoftPaused = false;
    var heroHardPaused = false;

    gsap.set(".hero-exit-overlay", { opacity: 0 });
    gsap.set(".hero-inner", { transformOrigin: "50% 50%" });

    gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: isHeroIntroDone() ? 0.25 : 0.4,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;
          if (!heroSoftPaused && p > 0.04) {
            heroSoftPaused = true;
            if (window.OneToneHomeDemo) OneToneHomeDemo.pauseHero("soft");
          }
          if (heroSoftPaused && p <= 0.04) heroSoftPaused = false;
          if (!heroHardPaused && p > HERO_HARD_PAUSE) {
            heroHardPaused = true;
            if (window.OneToneHomeDemo) OneToneHomeDemo.pauseHero("hard");
          }
          if (heroHardPaused && p <= HERO_HARD_PAUSE) {
            heroHardPaused = false;
            if (window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
          }
        },
        onLeaveBack: function () {
          heroSoftPaused = false;
          heroHardPaused = false;
          if (window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
        },
      },
    })
      // 极简 hero 退场：opacity 1→0 + 轻微向上推 32px，不加 clip-path
      .to(
        ".hero-inner",
        { y: -32, opacity: 0, scale: 0.96, duration: 1 },
        0
      )
      .to(".hero-exit-overlay", { opacity: 0.5, duration: 1 }, 0);
  }

  function strip3D(obj) {
    var out = Object.assign({}, obj);
    delete out.rotateX;
    delete out.rotateY;
    delete out.z;
    return out;
  }

  function chapterPose(cfg, usePin) {
    var pose = Object.assign({}, LENS_REST, cfg.pose || LENS_REST);
    return usePin ? pose : strip3D(pose);
  }

  function resetChapterVisual(section, cfg, usePin) {
    var lens = getLens(section);
    if (!lens) return;

    var pose = chapterPose(cfg, usePin);
    var enterFrom = Object.assign({}, pose, cfg.enterFrom);
    if (!usePin) enterFrom = strip3D(enterFrom);

    gsap.set(lens, Object.assign({ transformOrigin: "50% 42%", transformPerspective: 1200 }, enterFrom));

    var copy = section.querySelector(".chapter-copy");
    var demoWrap = section.querySelector(".chapter-demo-wrap");
    if (copy) gsap.set(copy, { y: 0, opacity: 1 });
    if (demoWrap) gsap.set(demoWrap, { y: 0, opacity: 1 });

    var bridgeIn = section.querySelector(".story-bridge-in .story-bridge__line");
    if (bridgeIn) {
      gsap.set(bridgeIn, cfg.bridgeInFadeIn ? { opacity: 0, y: 10 } : { opacity: 0, y: 8 });
    }
    var bridgeOut = section.querySelector(".story-bridge-out .story-bridge__line");
    if (bridgeOut) gsap.set(bridgeOut, { opacity: 0, y: 8 });
  }

  function buildChapterTimeline(section, cfg, usePin) {
    var lens = getLens(section);
    if (!lens) return null;

    var copy = section.querySelector(".chapter-copy");
    var demoWrap = section.querySelector(".chapter-demo-wrap");
    var bridgeIn = section.querySelector(".story-bridge-in .story-bridge__line");
    var bridgeOut = section.querySelector(".story-bridge-out .story-bridge__line");

    // === 三段式 enter / breathe / exit ===
    // enter  0.00 - 0.30: 镜头入场（opacity 0→1, y 32→0, scale 0.95→1）
    // breathe 0.30 - 0.70: 镜头持续微动（scale 1→1.04→1, y 0→-3→0）— 避免 hold 期间静图感
    // exit   0.70 - 1.00: 镜头出场（opacity 1→0, y 0→-32, scale 1→0.95）
    // bridge-in 在 enter 末段 (0.20-0.30) 淡入
    // bridge-out 在 exit 起段 (0.70-0.80) 淡入

    var ENTER_END = 0.30;
    var BREATHE_PEAK = 0.50;
    var EXIT_START = 0.70;

    gsap.set(lens, { transformOrigin: "50% 50%" });

    var tl = gsap.timeline({ defaults: { ease: "none", immediateRender: false } });

    // === lens ENTER (0-0.30): opacity 0→1, y 32→0, scale 0.95→1 ===
    tl.fromTo(lens,
      { y: 32, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: ENTER_END },
      0
    );

    // copy：enter 末段从左侧 18px 滑入
    if (copy) {
      tl.fromTo(copy,
        { x: -18, opacity: 0 },
        { x: 0, opacity: 1, duration: ENTER_END * 0.7 },
        ENTER_END * 0.3
      );
    }

    // demo：enter 末段从下方 14px 推入
    if (demoWrap) {
      tl.fromTo(demoWrap,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: ENTER_END * 0.7 },
        ENTER_END * 0.4
      );
    }

    // bridge-in：enter 后段 (0.18-0.30) 淡入
    if (bridgeIn) {
      tl.fromTo(bridgeIn,
        { opacity: 0, y: 12 },
        { opacity: 0.85, y: 0, duration: 0.10 },
        0.20
      );
    }

    // === lens BREATHE (0.30-0.70): scale 1→1.04→1, y 0→-3→0 ===
    // 持续微动，避免 hold 期间静图感
    tl.to(lens,
      { scale: 1.04, y: -3, duration: BREATHE_PEAK - ENTER_END },
      ENTER_END
    );
    tl.to(lens,
      { scale: 1, y: 0, duration: EXIT_START - BREATHE_PEAK },
      BREATHE_PEAK
    );

    // === EXIT (0.70-1.0): opacity 1→0, y 0→-32, scale 1→0.95 ===
    var exitDur = 1 - EXIT_START;

    if (bridgeOut) {
      tl.fromTo(bridgeOut,
        { opacity: 0, y: 12 },
        { opacity: 0.85, y: 0, duration: 0.10 },
        EXIT_START + 0.01
      );
    }

    tl.to(lens,
      { y: -32, opacity: 0, scale: 0.95, duration: exitDur },
      EXIT_START
    );

    // copy / demo 跟着 lens exit 一起滑出
    if (copy) {
      tl.to(copy, { x: 0, opacity: 0, duration: exitDur }, EXIT_START);
    }
    if (demoWrap) {
      tl.to(demoWrap, { y: 0, opacity: 0, duration: exitDur }, EXIT_START);
    }

    return tl;
  }

  function buildChapterDirector(usePin) {
    var configs = {
      "ch-trigger": {
        chapter: "trigger",
        // 简单 enter/exit 区间，scrub: true 100% 跟手
        enterEnd: 0.20,
        exitStart: 0.80,
        bridgeInFadeIn: true,
      },
      "ch-voice": {
        chapter: "voice",
        enterEnd: 0.20,
        exitStart: 0.80,
      },
      "ch-softpad": {
        chapter: "softpad",
        enterEnd: 0.20,
        exitStart: 0.80,
        handoff: true,
      },
    };

    // 永远走非 pin 路径：chapter 在 document flow 自然滚动，scroll 100% 跟手
    document.documentElement.classList.add("story-nopin-mode");
    buildNopinDirector(configs);
  }

  // 非 pin 模式：每个 chapter 独立 ST，scrub: true 即时跟手
  // 关键调整：start 改成 "top 80%"，让 enter 在 chapter 顶部刚到视口 80%（距离底部 20%）时就开始
  // user 滚到 chapter 顶部刚进入视口时，enter 已经进行到一半（0.20/0.30 ≈ 67%）
  // 这样"标题动画"在 chapter 进入视口的第一刻就能看到，不会"仿佛查看静图"
  // end 仍是 "bottom 20%"，exit 完成于 chapter 底部到视口 20%
  function buildNopinDirector(configs) {
    CHAPTERS.forEach(function (id, i) {
      var section = document.getElementById(id);
      if (!section) return;
      var cfg = configs[id];
      var tl = buildChapterTimeline(section, cfg, false);
      if (!tl) return;

      // demo play/pause 状态控制
      var demo = getDemo(id);
      var wasInHold = false;

      ScrollTrigger.create({
        trigger: section,
        animation: tl,
        scrub: true,
        invalidateOnRefresh: true,
        anticipatePin: 0,
        onUpdate: function (self) {
          syncChapterState(cfg.chapter, self.progress, i, section, self.isActive);
          // demo 在 progress 0.30-0.70 期间 play（breathe 区间）
          if (demo) {
            var inHold = self.progress > 0.30 && self.progress < 0.70;
            if (inHold && !wasInHold) {
              wasInHold = true;
              demo.play();
            } else if (!inHold && wasInHold) {
              wasInHold = false;
              demo.pause();
            }
          }
        },
        start: "top 80%",
        end: "bottom 20%",
      });
    });
  }

  function bindDemoOnBeat() {
    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var demoEl = section.querySelector(".chapter-demo");
      var demo = getDemo(section.dataset.chapter);
      if (!demoEl || !demo) return;
      demo.onBeat(function () {
        gsap.fromTo(
          demoEl,
          { boxShadow: "0 0 0 rgba(42, 156, 196, 0)" },
          { boxShadow: "0 0 20px rgba(42, 156, 196, 0.35)", duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }
        );
      });
    });
  }

  function bindNarrativeRail() {
    var rail = document.querySelector(".scroll-rail");
    if (!rail) return;

    RAIL_TARGETS.forEach(function (sel) {
      var target = document.querySelector(sel);
      if (!target) return;
      ScrollTrigger.create({
        trigger: target,
        start: "top 50%",
        end: "bottom 50%",
        onToggle: function (self) {
          if (!self.isActive) return;
          var dot = rail.querySelector('[data-target="' + sel + '"]');
          if (!dot) return;
          rail.querySelectorAll(".rail-dot").forEach(function (d) {
            d.classList.remove("is-active");
          });
          dot.classList.add("is-active");
        },
      });
    });

    if (railBound) return;
    railBound = true;
    rail.querySelectorAll(".rail-dot").forEach(function (dot) {
      dot.addEventListener("click", function () {
        var target = document.querySelector(dot.getAttribute("data-target"));
        if (!target || !window.ScrollTrigger) return;
        ScrollTrigger.scrollTo(target, { offsetY: HEADER });
      });
    });
  }

  function syncAllChapterStates() {
    CHAPTERS.forEach(function (id, i) {
      var section = document.getElementById(id);
      if (!section) return;
      ScrollTrigger.getAll().forEach(function (st) {
        if (st.trigger === section) {
          syncChapterState(section.dataset.chapter, st.progress, i, section, st.isActive);
        }
      });
    });
  }

  function initHomeStory() {
    if (!window.gsap || !window.ScrollTrigger) return;
    if (!document.getElementById("story-world")) return;

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.getAll().forEach(function (st) {
      st.kill();
    });
    clearChapterTransforms();
    brandsHandoffFired = false;
    chapterPrimed = {};
    setRailBridgeDim(false);
    document.documentElement.classList.remove(
      "story-pin-mode",
      "story-nopin-mode",
      "story-reduced-motion",
      "story-mobile-static",
      "story-gsap-live"
    );
    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (section) {
        section.classList.remove("is-story-active", "is-chapter-pinned", "is-stack-visible");
      }
    });

    var reduced = guardReducedMotion();
    var mobile = !reduced && guardMobile();
    bindNarrativeRail();
    bindStoryCounterVisibility();

    if (reduced) {
      lastStoryMode = "reduced";
      setCounterHidden(true);
      bindDemoLifecycleStatic();
      return;
    }
    if (mobile) {
      lastStoryMode = "mobile";
      setCounterHidden(true);
      bindDemoLifecycleStatic();
      return;
    }

    var usePin = getStoryMode() === "pin";
    currentUsePin = usePin;
    lastStoryMode = usePin ? "pin" : "nopin";
    document.documentElement.classList.add("story-gsap-live");
    setCounterHidden(true);
    buildHeroExitTimeline();
    buildChapterDirector(usePin);
    bindDemoOnBeat();
    bindBrandsHandoff();
    if (ScrollTrigger.sort) ScrollTrigger.sort();
    ScrollTrigger.refresh();
    syncAllChapterStates();
    if (window.scrollY < 80 && window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
  }

  function scheduleInit() {
    if (initScheduled) return;
    if (!window.OneToneHomeDemo) {
      document.addEventListener("onetone:home-demo-ready", scheduleInit, { once: true });
      return;
    }
    initScheduled = true;
    var run = function () {
      requestAnimationFrame(initHomeStory);
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(run);
    } else {
      run();
    }
  }

  document.addEventListener("onetone:home-demo-ready", scheduleInit);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleInit);
  } else {
    scheduleInit();
  }

  window.addEventListener("load", function () {
    if (!document.documentElement.classList.contains("story-gsap-live")) {
      initScheduled = false;
      scheduleInit();
    } else if (window.ScrollTrigger) {
      ScrollTrigger.refresh();
      syncAllChapterStates();
    }
  });

  window.initHomeStory = initHomeStory;

  var resizeTimer;
  window.addEventListener("resize", function () {
    if (!window.ScrollTrigger) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      var currentMode = getStoryMode();
      if (lastStoryMode !== null && currentMode === lastStoryMode) {
        ScrollTrigger.refresh();
        syncAllChapterStates();
        return;
      }
      initScheduled = false;
      initHomeStory();
    }, 250);
  });
})();
