(function () {
  "use strict";

  var CHAPTERS = ["ch-trigger", "ch-voice", "ch-softpad"];
  var CHAPTER_NAMES = ["trigger", "voice", "softpad"];
  var HEADER = 64;

  function getDemo(name) {
    return window.OneToneHomeDemo && OneToneHomeDemo.getDemo(name);
  }

  function initHeroExit() {
    var hero = document.getElementById("sec-hero");
    if (!hero || !window.gsap) return;

    gsap.registerPlugin(ScrollTrigger);
    gsap.set(".hero-exit-overlay", { opacity: 0 });

    var heroHardPaused = false;
    gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: 0.3,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          if (!heroHardPaused && self.progress > 0.35) {
            heroHardPaused = true;
            if (window.OneToneHomeDemo) OneToneHomeDemo.pauseHero("hard");
          }
          if (heroHardPaused && self.progress <= 0.35) {
            heroHardPaused = false;
            if (window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
          }
        },
        onLeaveBack: function () {
          heroHardPaused = false;
          if (window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
        },
      },
    })
      .to(".hero-inner", { y: -32, opacity: 0, scale: 0.96, duration: 1 }, 0)
      .to(".hero-exit-overlay", { opacity: 0.45, duration: 1 }, 0);
  }

  function initReveals() {
    var targets = document.querySelectorAll(".chapter-copy, .story-bridge__line");
    if (!targets.length) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-revealed");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );

    targets.forEach(function (el) {
      io.observe(el);
    });
  }

  function initDemoIO() {
    if (!("IntersectionObserver" in window)) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      CHAPTER_NAMES.forEach(function (name) {
        var demo = getDemo(name);
        if (demo && demo.play) demo.play();
      });
      return;
    }

    CHAPTERS.forEach(function (id, i) {
      var section = document.getElementById(id);
      if (!section) return;
      var demo = getDemo(CHAPTER_NAMES[i]);
      if (!demo) return;

      var target = section.querySelector(".chapter-demo") || section;
      var playing = false;

      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              section.classList.add("is-demo-visible");
              if (!playing) {
                playing = true;
                if (CHAPTER_NAMES[i] === "voice" && demo.cancel) demo.cancel();
                demo.play();
              }
            } else {
              section.classList.remove("is-demo-visible");
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
    });
  }

  function initBrandsHandoff() {
    var brands = document.getElementById("sec-brands");
    if (!brands || !window.gsap) return;

    var fired = false;
    ScrollTrigger.create({
      trigger: brands,
      start: "top 85%",
      once: true,
      onEnter: function () {
        if (fired) return;
        fired = true;
        var items = brands.querySelectorAll(".home-brand-item");
        if (!items.length) return;
        gsap.fromTo(
          items,
          { scale: 0.85, opacity: 0.3 },
          { scale: 1, opacity: 1, stagger: 0.035, duration: 0.5, ease: "power2.out" }
        );
      },
    });
  }

  function initRail() {
    var rail = document.querySelector(".scroll-rail");
    if (!rail) return;

    ["#sec-hero", "#ch-trigger", "#ch-voice", "#ch-softpad", "#sec-brands"].forEach(function (sel) {
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

    rail.querySelectorAll(".rail-dot").forEach(function (dot) {
      dot.addEventListener("click", function () {
        var target = document.querySelector(dot.getAttribute("data-target"));
        if (!target || !window.ScrollTrigger) return;
        ScrollTrigger.scrollTo(target, { offsetY: HEADER });
      });
    });
  }

  function boot() {
    document.documentElement.classList.add("proto-decoupled-mode");
    initHeroExit();
    initReveals();
    initDemoIO();
    initBrandsHandoff();
    initRail();
    if (window.scrollY < 80 && window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.OneToneHomeDemo) {
      document.addEventListener("onetone:home-demo-ready", boot, { once: true });
      return;
    }
    boot();
  });
})();
