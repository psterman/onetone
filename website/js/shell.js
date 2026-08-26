(function () {
  var toggle = document.getElementById("mobileNavToggle");
  var panel = document.getElementById("mobileNavPanel");
  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var open = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    panel.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function activeNavKey() {
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (path === "" || path === "/") path = "index.html";
    var hash = (location.hash || "").replace(/^#/, "");

    if (path === "quickstart.html") {
      if (hash === "keys" || hash === "step1") return "keys";
      if (hash === "voice" || hash === "step2" || hash === "step3") return "voice";
      return null;
    }
    if (path === "vision.html") return "camera";
    if (path === "agent.html") return "softpad";
    if (path === "faq.html") return "faq";
    if (path === "download.html") return "download";
    return null;
  }

  function syncNavIcons(el, on) {
    var icon = el.querySelector(".site-nav-icon");
    if (!icon) return;
    icon.classList.toggle("ph-fill", on);
    icon.classList.toggle("ph", !on);
  }

  function syncNavActive() {
    var key = activeNavKey();
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      var on = key != null && el.getAttribute("data-nav") === key;
      el.classList.toggle("is-active", on);
      syncNavIcons(el, on);
    });
  }

  syncNavActive();
  window.addEventListener("hashchange", syncNavActive);
})();
