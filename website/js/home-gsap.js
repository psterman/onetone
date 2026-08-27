(function () {
  "use strict";

  // Scheme B: keep three chapter DOM; no lens scrub.
  // GSAP = hero exit + brands + rail. Copy/bridge = IO reveal. Demo = IO play/pause.

  var CHAPTERS = ["ch-trigger", "ch-voice", "ch-softpad"];
  var CHAPTER_NAMES = ["trigger", "voice", "softpad"];
  var COUNTER_KEYS = ["homeStoryCounter1", "homeStoryCounter2", "homeStoryCounter3"];
  var COUNTER_FALLBACK = ["01 / 03", "02 / 03", "03 / 03"];
  var RAIL_TARGETS = [
    "#sec-hero",
    "#ch-trigger",
    "#ch-voice",
    "#ch-softpad",
    "#sec-brands",
    "#sec-quotes",
    "#site-download-cta",
  ];
  var HEADER = 64;
  var HERO_HARD_PAUSE = 0.35;

  var brandsHandoffFired = false;
  var initScheduled = false;
  var railBound = false;
  var demoIOs = [];
  var revealIOs = [];

  function getDemo(name) {
    return window.OneToneHomeDemo && OneToneHomeDemo.getDemo(name);
  }

  function isHeroIntroDone() {
    return window.OneToneHomeDemo && OneToneHomeDemo.isHeroIntroDone && OneToneHomeDemo.isHeroIntroDone();
  }

  function clearChapterTransforms() {
    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (!section) return;
      var targets = section.querySelectorAll(
        ".camera-rig-lens, .camera-rig, .chapter-copy, .chapter-demo-wrap, .story-bridge__line, .pad-teaser-visual"
      );
      if (targets.length && window.gsap) gsap.set(targets, { clearProps: "transform,opacity" });
    });
  }

  function setCounterHidden(hidden) {
    var counter = document.querySelector(".story-chapter-counter");
    if (counter) counter.classList.toggle("is-hidden", !!hidden);
  }

  function setCounterIndex(i) {
    var counter = document.querySelector(
      ".story-chapter-counter [data-i18n^='homeStoryCounter'], .story-chapter-counter span"
    );
    if (!counter) return;
    var text =
      window.OneToneI18n && OneToneI18n.t
        ? OneToneI18n.t(COUNTER_KEYS[i], COUNTER_FALLBACK[i])
        : COUNTER_FALLBACK[i];
    counter.textContent = text;
    counter.setAttribute("data-i18n", COUNTER_KEYS[i]);
  }

  function killDemoObservers() {
    demoIOs.forEach(function (io) {
      io.disconnect();
    });
    demoIOs = [];
    revealIOs.forEach(function (io) {
      io.disconnect();
    });
    revealIOs = [];
  }

  function bindDemoLifecycleStatic() {
    CHAPTER_NAMES.forEach(function (name) {
      var demo = getDemo(name);
      if (demo && demo.play) demo.play();
    });
  }

  function markRevealed(entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) entry.target.classList.add("is-revealed");
    });
  }

  function initReveals() {
    var copies = document.querySelectorAll(".chapter-copy");
    var bridges = document.querySelectorAll(".story-bridge__line");
    if (!copies.length && !bridges.length) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      copies.forEach(function (el) {
        el.classList.add("is-revealed");
      });
      bridges.forEach(function (el) {
        el.classList.add("is-revealed");
      });
      return;
    }

    if (copies.length) {
      var copyIO = new IntersectionObserver(markRevealed, {
        threshold: 0.2,
        rootMargin: "0px 0px -8% 0px",
      });
      copies.forEach(function (el) {
        copyIO.observe(el);
      });
      revealIOs.push(copyIO);
    }

    if (bridges.length) {
      var bridgeIO = new IntersectionObserver(markRevealed, {
        threshold: 0.2,
        rootMargin: "0px 0px 20% 0px",
      });
      bridges.forEach(function (el) {
        bridgeIO.observe(el);
      });
      revealIOs.push(bridgeIO);
    }
  }

  function initDemoIO() {
    if (!("IntersectionObserver" in window)) {
      bindDemoLifecycleStatic();
      return;
    }

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      bindDemoLifecycleStatic();
      return;
    }

    CHAPTERS.forEach(function (id, i) {
      var section = document.getElementById(id);
      if (!section) return;
      var name = CHAPTER_NAMES[i];
      var demo = getDemo(name);
      if (!demo) return;

      var target = section.querySelector(".chapter-demo") || section;
      var playing = false;

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              section.classList.add("is-demo-visible", "is-story-active");
              setCounterIndex(i);
              if (!playing) {
                playing = true;
                if (name === "voice" && demo.cancel) demo.cancel();
                demo.play();
              }
            } else {
              section.classList.remove("is-demo-visible", "is-story-active");
              if (playing) {
                playing = false;
                demo.pause();
              }
            }
          });
        },
        { threshold: 0.35, rootMargin: "-5% 0px -5% 0px" }
      );

      io.observe(target);
      demoIOs.push(io);
    });
  }

  function runBrandsHandoff() {
    if (brandsHandoffFired) return;
    var brands = document.getElementById("sec-brands");
    if (!brands || !window.gsap) return;
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
    if (!brands || !window.ScrollTrigger) return;
    ScrollTrigger.create({
      trigger: brands,
      start: "top 85%",
      once: true,
      onEnter: runBrandsHandoff,
    });
  }

  function bindStoryCounterVisibility() {
    var world = document.getElementById("story-world");
    if (!world || !window.ScrollTrigger) return;
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
      .to(".hero-inner", { y: -32, opacity: 0, scale: 0.96, duration: 1 }, 0)
      .to(".hero-exit-overlay", { opacity: 0.5, duration: 1 }, 0);
  }

  function bindNarrativeRail() {
    var rail = document.querySelector(".scroll-rail");
    if (!rail || !window.ScrollTrigger) return;

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

  function initHomeStory() {
    if (!document.getElementById("story-world")) return;

    killDemoObservers();
    brandsHandoffFired = false;
    setCounterHidden(true);
    document.documentElement.classList.remove(
      "story-pin-mode",
      "story-nopin-mode",
      "story-reduced-motion",
      "story-mobile-static",
      "story-gsap-live"
    );
    document.documentElement.classList.add("story-decoupled-mode");
    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (section) {
        section.classList.remove(
          "is-story-active",
          "is-chapter-pinned",
          "is-stack-visible",
          "is-demo-visible"
        );
      }
    });

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var mobile = !reduced && window.matchMedia("(max-width: 768px) and (hover: none)").matches;

    if (reduced) {
      document.documentElement.classList.add("story-reduced-motion");
      if (window.gsap) gsap.set(".camera-rig-lens, .camera-rig", { clearProps: "all" });
      clearChapterTransforms();
      initReveals();
      bindDemoLifecycleStatic();
      return;
    }

    if (mobile) {
      document.documentElement.classList.add("story-mobile-static");
      if (window.gsap) gsap.set(".camera-rig-lens, .camera-rig", { clearProps: "all" });
      clearChapterTransforms();
      initReveals();
      initDemoIO();
      return;
    }

    if (!window.gsap || !window.ScrollTrigger) {
      initReveals();
      initDemoIO();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.getAll().forEach(function (st) {
      st.kill();
    });
    clearChapterTransforms();

    document.documentElement.classList.add("story-gsap-live");
    buildHeroExitTimeline();
    initReveals();
    initDemoIO();
    bindNarrativeRail();
    bindStoryCounterVisibility();
    bindBrandsHandoff();
    if (ScrollTrigger.sort) ScrollTrigger.sort();
    ScrollTrigger.refresh();
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
    }
  });

  window.initHomeStory = initHomeStory;

  var resizeTimer;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      initScheduled = false;
      initHomeStory();
    }, 250);
  });
})();
