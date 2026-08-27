(function () {
  "use strict";

  var STEPS = ["trigger", "voice", "softpad"];
  var demos = {};
  var currentStep = -1;

  function initDemos() {
    if (!window.OneToneHomeDemo) return;
    var t = document.getElementById("stage-demo-trigger");
    var v = document.getElementById("stage-demo-voice");
    var p = document.getElementById("stage-demo-softpad");
    if (t) demos.trigger = OneToneHomeDemo.initTriggerDemo(t);
    if (v) demos.voice = OneToneHomeDemo.initVoiceDemo(v);
    if (p) demos.softpad = OneToneHomeDemo.initSoftPadTeaser(p);
  }

  function pauseAll() {
    STEPS.forEach(function (name) {
      if (demos[name] && demos[name].pause) demos[name].pause();
    });
  }

  function setStep(index) {
    index = Math.max(0, Math.min(STEPS.length - 1, index));
    if (index === currentStep) return;
    currentStep = index;

    document.querySelectorAll(".stage-demo-panel").forEach(function (panel, i) {
      panel.classList.toggle("is-active", i === index);
    });
    document.querySelectorAll(".story-step").forEach(function (step, i) {
      step.classList.toggle("is-step-active", i === index);
    });

    var counter = document.querySelector(".stage-counter");
    if (counter) {
      counter.textContent = ("0" + (index + 1)).slice(-2) + " / 03";
    }

    pauseAll();
    var active = demos[STEPS[index]];
    if (active && active.play) active.play();
  }

  function initScrollSteps() {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    document.querySelectorAll(".story-step").forEach(function (step, i) {
      ScrollTrigger.create({
        trigger: step,
        start: "top 55%",
        end: "bottom 45%",
        onEnter: function () {
          setStep(i);
        },
        onEnterBack: function () {
          setStep(i);
        },
      });
    });
  }

  function initStageIO() {
    var stage = document.getElementById("demo-stage");
    if (!stage || !("IntersectionObserver" in window)) return;

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var d = demos[STEPS[currentStep >= 0 ? currentStep : 0]];
            if (d && d.play) d.play();
          } else {
            pauseAll();
          }
        });
      },
      { threshold: 0.15, rootMargin: "-10% 0px -10% 0px" }
    );
    io.observe(stage);
  }

  function initHeroExit() {
    var hero = document.getElementById("sec-hero");
    if (!hero || !window.gsap) return;

    gsap.registerPlugin(ScrollTrigger);
    gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: 0.3,
        onUpdate: function (self) {
          if (self.progress > 0.35 && window.OneToneHomeDemo) {
            OneToneHomeDemo.pauseHero("hard");
          }
          if (self.progress <= 0.35 && window.OneToneHomeDemo) {
            OneToneHomeDemo.resumeHero();
          }
        },
        onLeaveBack: function () {
          if (window.OneToneHomeDemo) OneToneHomeDemo.resumeHero();
        },
      },
    }).to(".hero-inner", { y: -32, opacity: 0, scale: 0.96, duration: 1 }, 0);
  }

  function boot() {
    initDemos();
    initScrollSteps();
    initStageIO();
    initHeroExit();
    setStep(0);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (window.OneToneHomeDemo) {
      boot();
    } else {
      document.addEventListener("onetone:home-demo-ready", boot, { once: true });
    }
  });
})();
