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

    if (path === "index.html") return "home";
    if (path === "quickstart.html") return "quickstart";
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

  // Site-wide Cursor-style download CTA above footer
  (function injectSiteDownloadCta() {
    if (document.getElementById("site-download-cta")) return;
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (path === "download.html") return; // page already has install CTAs
    var footer = document.querySelector("footer.site-footer");
    if (!footer) return;
    var sec = document.createElement("section");
    sec.id = "site-download-cta";
    sec.className = "site-download-cta";
    sec.setAttribute("aria-label", "Download");
    sec.setAttribute("data-section", "5");
    sec.innerHTML =
      '<div class="site-download-cta-inner">' +
      '<h2 class="site-download-cta-title" data-i18n="ctaBannerTitle">立即试用一声。</h2>' +
      '<a class="site-download-cta-btn" href="download.html">' +
      '<span data-i18n="ctaBannerBtn">下载 Windows 版本</span>' +
      '<i class="ph ph-download-simple" aria-hidden="true"></i>' +
      "</a></div>";
    footer.parentNode.insertBefore(sec, footer);
  })();
})();
