(function () {
  if (!document.querySelector('link[href*="ot-components.css"]')) {
    var otCss = document.createElement("link");
    otCss.rel = "stylesheet";
    otCss.href = (document.querySelector('link[href*="shell.css"]') || {}).href
      ? document.querySelector('link[href*="shell.css"]').href.replace(/shell\.css.*/, "ot-components.css")
      : "css/ot-components.css";
    document.head.appendChild(otCss);
  }

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
    if (path === "keys.html" || path === "vision.html" || path === "agent.html") return "scenes";
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
      var navKey = el.getAttribute("data-nav");
      var on = key != null && navKey === key;
      el.classList.toggle("is-active", on);
      syncNavIcons(el, on);
    });
  }

  syncNavActive();
  window.addEventListener("hashchange", syncNavActive);

  // Safety: drop legacy header download pill if static HTML still has it
  (function removeLegacyHeaderCta() {
    var headerCta = document.querySelector(".site-header-actions .nav-cta");
    if (headerCta) headerCta.remove();
  })();

  // Bind scenes dropdown (markup is static in HTML)
  (function bindScenesNav() {
    document.querySelectorAll(".site-nav-scenes").forEach(function (wrap) {
      if (wrap.dataset.bound) return;
      wrap.dataset.bound = "1";
      var btn = wrap.querySelector("button");
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var open = wrap.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
    document.addEventListener("click", function () {
      document.querySelectorAll(".site-nav-scenes.is-open").forEach(function (wrap) {
        wrap.classList.remove("is-open");
        var btn = wrap.querySelector("button");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
    });
  })();

  // Upgrade legacy single CTA or inject multi-exit final CTA
  (function upgradeOrInjectFinalCta() {
    var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (path === "download.html" || path === "index.html" || path === "") return;

    var gridHtml =
      '<div class="ot-final-cta-inner">' +
      '<h2 class="ot-final-cta-title" data-i18n="otFinalCtaTitle">准备好试试了吗？</h2>' +
      '<div class="ot-final-cta-grid">' +
      '<a class="ot-btn ot-btn--primary" href="download.html"><span data-i18n="otFinalCtaDownload">免费下载</span></a>' +
      '<a class="ot-btn ot-btn--ghost" href="quickstart.html"><span data-i18n="otFinalCtaDocs">查看文档</span></a>' +
      '<a class="ot-btn ot-btn--ghost" href="https://github.com/psterman/onetone/discussions" target="_blank" rel="noopener"><span data-i18n="otFinalCtaCommunity">加入讨论</span></a>' +
      '<a class="ot-btn ot-btn--ghost" href="https://github.com/psterman/onetone/issues/new?template=bug_report.yml" target="_blank" rel="noopener"><span data-i18n="otFinalCtaFeedback">提交反馈</span></a>' +
      "</div></div>";

    var legacy = document.getElementById("site-download-cta");
    var finalCta = document.getElementById("ot-final-cta");
    if (legacy) {
      legacy.id = "ot-final-cta";
      legacy.className = "ot-final-cta";
      legacy.setAttribute("aria-label", "Download");
      legacy.innerHTML = gridHtml;
      return;
    }
    if (finalCta) return;

    var footer = document.querySelector("footer.site-footer");
    if (!footer) return;
    var sec = document.createElement("section");
    sec.id = "ot-final-cta";
    sec.className = "ot-final-cta";
    sec.setAttribute("aria-label", "Download");
    sec.innerHTML = gridHtml;
    footer.parentNode.insertBefore(sec, footer);
  })();

  // Quickstart sidebar active section
  (function qsSideTocActive() {
    if (document.body.getAttribute("data-page") !== "quickstart") return;
    var links = document.querySelectorAll(".qs-side-toc a[href^='#']");
    if (!links.length) return;
    var ids = Array.from(links).map(function (a) {
      return a.getAttribute("href").slice(1);
    });
    function sync() {
      var y = window.scrollY + 120;
      var current = ids[0];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.offsetTop <= y) current = id;
      });
      links.forEach(function (a) {
        a.classList.toggle("is-active", a.getAttribute("href") === "#" + current);
      });
    }
    window.addEventListener("scroll", sync, { passive: true });
    sync();
  })();

  // Footer 4-column layout
  (function enhanceFooter() {
    var footer = document.querySelector("footer.site-footer");
    if (!footer || footer.querySelector(".site-footer-cols")) return;
    var inner = footer.querySelector(".site-footer-inner");
    if (!inner) return;

    var cols = document.createElement("div");
    cols.className = "site-footer-cols";
    cols.innerHTML =
      '<div class="site-footer-col"><h4 data-i18n="footerColProduct">产品</h4>' +
      '<a href="quickstart.html#voice" data-i18n="navVoice">语音</a>' +
      '<a href="keys.html" data-i18n="navKeys">按键</a>' +
      '<a href="vision.html" data-i18n="navCamera">摄像头</a>' +
      '<a href="agent.html" data-i18n="navSoftPad">SoftPad</a></div>' +
      '<div class="site-footer-col"><h4 data-i18n="footerColStart">上手</h4>' +
      '<a href="quickstart.html" data-i18n="navQuickstart">上手</a>' +
      '<a href="faq.html" data-i18n="navFaq">帮助</a>' +
      '<a href="changelog.html" data-i18n="footerChangelog">更新日志</a></div>' +
      '<div class="site-footer-col"><h4 data-i18n="footerColOpen">开源</h4>' +
      '<a href="https://github.com/psterman/onetone" target="_blank" rel="noopener" data-i18n="footerGithub">GitHub</a>' +
      '<a href="https://github.com/psterman/onetone/issues/new?template=bug_report.yml" data-i18n="footerReport">反馈问题</a>' +
      '<a href="support.html" data-i18n="footerSupport">支持项目</a></div>' +
      '<div class="site-footer-col"><h4 data-i18n="footerColLegal">法律</h4>' +
      '<a href="privacy.html" data-i18n="footerPrivacy">隐私政策</a>' +
      '<a href="terms.html" data-i18n="footerTerms">服务条款</a></div>';

    var features = inner.querySelector(".site-footer-features");
    if (features) features.remove();
    inner.insertBefore(cols, inner.firstChild);

    var ver = document.createElement("p");
    ver.className = "site-footer-version";
    ver.id = "siteFooterVersion";
    ver.textContent = "v1.0.0";
    inner.appendChild(ver);

    fetch("https://api.github.com/repos/psterman/onetone/releases/latest")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.tag_name) ver.textContent = data.tag_name.replace(/^v/, "v");
      })
      .catch(function () {});
  })();
})();
