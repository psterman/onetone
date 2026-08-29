(function () {
  "use strict";

  var world = document.getElementById("story-world");
  if (!world) return;

  document.documentElement.classList.add("story-gsap-live");

  var moodEls = [];
  var moodRatios = {};

  function setStoryMood(mood) {
    if (!mood || world.getAttribute("data-mood") === mood) return;
    world.setAttribute("data-mood", mood);
  }

  function pickBestMood() {
    var bestEl = null;
    var bestRatio = 0;
    moodEls.forEach(function (el) {
      var r = moodRatios[el._moodKey] || 0;
      if (r > bestRatio) {
        bestRatio = r;
        bestEl = el;
      }
    });
    if (!bestEl || bestRatio <= 0) return;
    var mood = bestEl.getAttribute("data-mood");
    if (mood) setStoryMood(mood);
  }

  function initMood() {
    moodEls = Array.prototype.slice.call(world.querySelectorAll("[data-mood]")).filter(function (el) {
      return el !== world;
    });
    if (!moodEls.length || !("IntersectionObserver" in window)) return;

    moodEls.forEach(function (el, i) {
      el._moodKey = el.id || "mood-" + i;
    });

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          moodRatios[entry.target._moodKey] = entry.isIntersecting ? entry.intersectionRatio : 0;
        });
        pickBestMood();
      },
      { threshold: [0, 0.25, 0.45, 0.6, 0.8, 1], rootMargin: "-10% 0px -10% 0px" }
    );

    moodEls.forEach(function (el) {
      io.observe(el);
    });
  }

  window.addEventListener("qs-hero-mode", function (e) {
    var hero = document.getElementById("qs-hero");
    if (!hero) return;
    hero.setAttribute("data-mood", e.detail && e.detail.mode === "voice" ? "dark" : "light");
    pickBestMood();
  });

  initMood();
  if (window.OneToneScrollReveal) {
    window.OneToneScrollReveal.init(world);
  }
})();
