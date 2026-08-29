(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("ch-advanced");
    if (!root) return;
    var tabs = root.querySelectorAll(".ch-advanced-tab");
    var panels = root.querySelectorAll(".ch-advanced-panel");
    if (!tabs.length) return;

    var tabIds = ["camera", "softpad"];
    var activeTab = "camera";
    var rotateTimer = null;
    var userClickedAt = 0;
    var ROTATE_MS = 5000;

    function activate(id) {
      activeTab = id;
      tabs.forEach(function (t) {
        t.classList.toggle("is-active", t.getAttribute("data-tab") === id);
      });
      panels.forEach(function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-panel") === id);
      });
    }

    function scheduleRotate() {
      if (rotateTimer) window.clearTimeout(rotateTimer);
      rotateTimer = window.setTimeout(function () {
        if (Date.now() - userClickedAt < ROTATE_MS) {
          scheduleRotate();
          return;
        }
        var idx = tabIds.indexOf(activeTab);
        activate(tabIds[(idx + 1) % tabIds.length]);
        scheduleRotate();
      }, ROTATE_MS);
    }

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        userClickedAt = Date.now();
        activate(tab.getAttribute("data-tab"));
        scheduleRotate();
      });
    });

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
              scheduleRotate();
            } else if (rotateTimer) {
              window.clearTimeout(rotateTimer);
              rotateTimer = null;
            }
          });
        },
        { threshold: [0, 0.25, 0.5] }
      );
      io.observe(root);
    }

    // SoftPad full/mini sub-tabs
    var padFull = root.querySelector("#pad-teaser-full");
    var padMini = root.querySelector("#pad-teaser-mini");
    var padVisual = root.querySelector("#pad-teaser-visual");
    var padCopyPanels = root.querySelectorAll(".pad-teaser-copy-panel");

    function setPadMode(mini) {
      if (padVisual) padVisual.classList.toggle("is-mini", mini);
      if (padFull) padFull.classList.toggle("is-active", !mini);
      if (padMini) padMini.classList.toggle("is-active", mini);
      padCopyPanels.forEach(function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-pad-copy") === (mini ? "mini" : "full"));
      });
    }

    if (padFull) {
      padFull.addEventListener("click", function () {
        setPadMode(false);
      });
    }
    if (padMini) {
      padMini.addEventListener("click", function () {
        setPadMode(true);
      });
    }
  });
})();
