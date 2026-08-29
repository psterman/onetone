(function () {
  "use strict";

  // Scheme B: no lens scrub. GSAP = hero + brands + rail + bridge words + voice chars.
  // Copy/bridge/demo = IO. Mood = shared #story-world data-mood.

  var CHAPTERS = ["ch-trigger", "ch-voice", "ch-advanced"];
  var CHAPTER_NAMES = ["trigger", "voice", "advanced"];
  var COUNTER_KEYS = ["homeStoryCounter1", "homeStoryCounter2", "homeStoryCounter3"];
  var COUNTER_FALLBACK = ["01 / 03", "02 / 03", "03 / 03"];
  var RAIL_TARGETS = [
    "#sec-hero",
    "#sec-positioning",
    "#ch-trigger",
    "#ch-voice",
    "#ch-advanced",
    "#sec-brands",
    "#sec-quotes",
    "#ot-final-cta",
  ];
  var HEADER = 64;
  var HERO_HARD_PAUSE = 0.35;
  var BRIDGE_STAGGER_TOTAL = 0.3;

  var brandsHandoffFired = false;
  var initScheduled = false;
  var railBound = false;
  var demoIOs = [];
  var revealIOs = [];
  var moodIO = null;
  var moodRatios = {};

  function getDemo(name) {
    return window.OneToneHomeDemo && OneToneHomeDemo.getDemo(name);
  }

  function isHeroIntroDone() {
    return window.OneToneHomeDemo && OneToneHomeDemo.isHeroIntroDone && OneToneHomeDemo.isHeroIntroDone();
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

  function setStoryMood(mood) {
    var world = document.getElementById("story-world");
    if (!world || !mood) return;
    if (world.getAttribute("data-mood") === mood) return;
    world.setAttribute("data-mood", mood);
  }

  function pickBestMood() {
    var bestId = null;
    var bestRatio = 0;
    CHAPTERS.forEach(function (id) {
      var r = moodRatios[id] || 0;
      if (r > bestRatio) {
        bestRatio = r;
        bestId = id;
      }
    });
    if (!bestId || bestRatio <= 0) return;
    var section = document.getElementById(bestId);
    if (section && section.dataset.mood) setStoryMood(section.dataset.mood);
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
    if (moodIO) {
      moodIO.disconnect();
      moodIO = null;
    }
    moodRatios = {};
  }

  function bindDemoLifecycleStatic() {
    CHAPTER_NAMES.forEach(function (name) {
      var demo = getDemo(name);
      if (demo && demo.play) demo.play();
    });
  }

  function splitBridgeWords(el) {
    if (!el || el.querySelector(".bridge-words")) return;
    var text = (el.textContent || "").trim();
    if (!text) return;

    var parts;
    if (/\s/.test(text)) {
      parts = text.split(/(\s+)/).filter(function (p) {
        return p.length > 0;
      });
    } else {
      parts = Array.from(text);
    }

    var wrap = document.createElement("span");
    wrap.className = "bridge-words";
    parts.forEach(function (part) {
      if (/^\s+$/.test(part)) {
        wrap.appendChild(document.createTextNode(part));
        return;
      }
      var word = document.createElement("span");
      word.className = "bridge-word";
      word.textContent = part;
      wrap.appendChild(word);
    });
    el.textContent = "";
    el.appendChild(wrap);
  }

  function animateBridgeWords(el) {
    var words = el.querySelectorAll(".bridge-word");
    if (!words.length) return;
    if (prefersReducedMotion() || !window.gsap) {
      words.forEach(function (w) {
        w.style.opacity = "1";
      });
      return;
    }
    var n = words.length;
    var stagger = n > 1 ? BRIDGE_STAGGER_TOTAL / (n - 1) : 0;
    gsap.fromTo(
      words,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.12, stagger: stagger, ease: "power2.out", overwrite: true }
    );
  }

  function onBridgeReveal(entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      if (el.classList.contains("is-revealed")) return;
      el.classList.add("is-revealed");
      animateBridgeWords(el);
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

    var reduced = prefersReducedMotion();
    bridges.forEach(function (el) {
      splitBridgeWords(el);
    });

    if (reduced || !("IntersectionObserver" in window)) {
      copies.forEach(function (el) {
        el.classList.add("is-revealed");
      });
      bridges.forEach(function (el) {
        el.classList.add("is-revealed");
        animateBridgeWords(el);
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
      var bridgeIO = new IntersectionObserver(onBridgeReveal, {
        threshold: 0.2,
        rootMargin: "0px 0px 20% 0px",
      });
      bridges.forEach(function (el) {
        if (el.classList.contains("is-revealed")) {
          animateBridgeWords(el);
        } else {
          bridgeIO.observe(el);
        }
      });
      revealIOs.push(bridgeIO);
    }
  }

  function initMoodIO() {
    var world = document.getElementById("story-world");
    if (!world || !("IntersectionObserver" in window)) return;

    moodRatios = {};
    moodIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          moodRatios[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
        });
        pickBestMood();
      },
      { threshold: [0, 0.25, 0.45, 0.6, 0.8, 1], rootMargin: "-10% 0px -10% 0px" }
    );

    CHAPTERS.forEach(function (id) {
      var section = document.getElementById(id);
      if (section) moodIO.observe(section);
    });
  }

  function initDemoIO() {
    if (!("IntersectionObserver" in window)) {
      bindDemoLifecycleStatic();
      return;
    }

    if (prefersReducedMotion()) {
      bindDemoLifecycleStatic();
      return;
    }

    CHAPTERS.forEach(function (id, i) {
      var section = document.getElementById(id);
      if (!section) return;
      var name = CHAPTER_NAMES[i];
      var demo = getDemo(name);
      // Observe the lens (copy+demo), not the opacity-0 wrap — otherwise the card
      // never hits threshold and stays invisible forever.
      var target = section.querySelector(".camera-rig-lens") || section;
      var playing = false;
      var leaveTimer = null;

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            // Hysteresis: enter easily, leave only when fully gone — prevents
            // pause/play thrash that restarts demos at idle forever.
            if (entry.isIntersecting && entry.intersectionRatio >= 0.12) {
              if (leaveTimer) {
                window.clearTimeout(leaveTimer);
                leaveTimer = null;
              }
              section.classList.add("is-demo-visible", "is-story-active");
              setCounterIndex(i);
              if (section.dataset.mood) setStoryMood(section.dataset.mood);
              if (demo && !playing) {
                playing = true;
                if (name === "voice" && demo.cancel) demo.cancel();
                demo.play();
              }
            } else if (!entry.isIntersecting || entry.intersectionRatio === 0) {
              if (leaveTimer) window.clearTimeout(leaveTimer);
              leaveTimer = window.setTimeout(function () {
                leaveTimer = null;
                section.classList.remove("is-demo-visible", "is-story-active");
                if (demo && playing) {
                  playing = false;
                  demo.pause();
                }
              }, 280);
            }
          });
        },
        { threshold: [0, 0.12, 0.25, 0.5], rootMargin: "0px 0px -8% 0px" }
      );

      io.observe(target);
      demoIOs.push(io);
    });
  }

  function splitVoiceChars(el) {
    if (!el || el.querySelector(".voice-char")) return;
    var text = el.textContent || "";
    if (!text) return;
    el.textContent = "";
    Array.from(text).forEach(function (ch) {
      var span = document.createElement("span");
      span.className = "voice-char";
      span.textContent = ch === " " ? "\u00a0" : ch;
      el.appendChild(span);
    });
  }

  function initVoiceCharScrub() {
    var answer = document.querySelector("#ch-voice .chapter-answer");
    if (!answer) return;

    splitVoiceChars(answer);
    var chars = answer.querySelectorAll(".voice-char");
    if (!chars.length) return;

    if (prefersReducedMotion() || !window.gsap || !window.ScrollTrigger) {
      chars.forEach(function (c) {
        c.style.opacity = "1";
      });
      return;
    }

    gsap.set(chars, { opacity: 0 });
    gsap.to(chars, {
      opacity: 1,
      ease: "none",
      stagger: 0.02,
      scrollTrigger: {
        trigger: "#ch-voice",
        start: "top 70%",
        end: "center center",
        scrub: true,
      },
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

  function initPositioningReveal() {
    var section = document.getElementById("sec-positioning");
    if (!section || !window.OneToneScrollReveal) return;
    window.OneToneScrollReveal.init(section);
  }

  function initHomeStory() {
    if (!document.getElementById("story-world")) return;

    killDemoObservers();
    brandsHandoffFired = false;
    setCounterHidden(true);
    setStoryMood("light");
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

    var reduced = prefersReducedMotion();
    var mobile = !reduced && window.matchMedia("(max-width: 768px) and (hover: none)").matches;

    if (reduced) {
      document.documentElement.classList.add("story-reduced-motion");
      if (window.gsap) gsap.set(".camera-rig-lens, .camera-rig", { clearProps: "all" });
      clearChapterTransforms();
      initMoodIO();
      initReveals();
      initVoiceCharScrub();
      bindDemoLifecycleStatic();
      initPositioningReveal();
      return;
    }

    if (mobile) {
      document.documentElement.classList.add("story-mobile-static");
      if (window.gsap) gsap.set(".camera-rig-lens, .camera-rig", { clearProps: "all" });
      clearChapterTransforms();
      initMoodIO();
      initReveals();
      initDemoIO();
      initVoiceCharScrub();
      initPositioningReveal();
      return;
    }

    if (!window.gsap || !window.ScrollTrigger) {
      initMoodIO();
      initReveals();
      initDemoIO();
      initVoiceCharScrub();
      initPositioningReveal();
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.getAll().forEach(function (st) {
      st.kill();
    });
    clearChapterTransforms();

    document.documentElement.classList.add("story-gsap-live");
    buildHeroExitTimeline();
    initMoodIO();
    initReveals();
    initDemoIO();
    initVoiceCharScrub();
    bindNarrativeRail();
    bindStoryCounterVisibility();
    bindBrandsHandoff();
    if (ScrollTrigger.sort) ScrollTrigger.sort();
    ScrollTrigger.refresh();
    if (window.scrollY < 80 && window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
    initPositioningReveal();
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
