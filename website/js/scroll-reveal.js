(function () {
  "use strict";

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function revealEl(el) {
    if (!el || el.classList.contains("is-revealed")) return;
    if (prefersReducedMotion() || !window.gsap) {
      el.classList.add("is-revealed");
      return;
    }
    window.gsap.fromTo(
      el,
      { y: 24, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.3,
        ease: "power2.out",
        overwrite: true,
        onComplete: function () {
          el.classList.add("is-revealed");
        },
      }
    );
  }

  function init(root, options) {
    var els =
      root && root.querySelectorAll
        ? root.querySelectorAll("[data-scroll-reveal]")
        : document.querySelectorAll("[data-scroll-reveal]");
    if (!els.length) return;

    var threshold = (options && options.threshold) || 0.2;
    var rootMargin = (options && options.rootMargin) || "0px 0px -8% 0px";

    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("is-revealed");
      });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          revealEl(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: threshold, rootMargin: rootMargin }
    );

    els.forEach(function (el) {
      io.observe(el);
    });

    return io;
  }

  window.OneToneScrollReveal = {
    init: init,
    revealEl: revealEl,
    prefersReducedMotion: prefersReducedMotion,
  };
})();
