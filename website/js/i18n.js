(function () {
  "use strict";

  const STORAGE_KEY = "vp_site_lang";
  const REPO = "psterman/onetone";

  const strings = { zh: {}, en: {} };

  function mergeI18nBundles() {
    const b = window.OneToneI18nBundles;
    if (!b) return;
    if (b.zh) Object.assign(strings.zh, b.zh);
    if (b.en) Object.assign(strings.en, b.en);
  }
  mergeI18nBundles();

  function getLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
    return "zh";
  }

  function applyLangContent(lang) {
    const htmlLang = lang === "zh" ? "zh-CN" : "en";
    document.documentElement.lang = htmlLang;
    document.querySelectorAll("[data-lang-content]").forEach((el) => {
      const match = el.getAttribute("data-lang-content") === lang;
      el.hidden = !match;
    });
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLangContent(lang);
    applyStrings(lang);
    loadReleaseInfo();
    document.dispatchEvent(new CustomEvent("onetone:langchange", { detail: { lang } }));
  }

  function t(lang, key) {
    if (Object.prototype.hasOwnProperty.call(strings[lang] || {}, key)) {
      return strings[lang][key];
    }
    if (Object.prototype.hasOwnProperty.call(strings.zh, key)) {
      return strings.zh[key];
    }
    return key;
  }

  function applyStrings(lang) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(lang, key);
      // Keep HTML fallback if the key is missing (avoid showing "navVoice").
      if (val == null || val === key) return;
      el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const val = t(lang, key);
      if (!val || val === key) return;
      el.innerHTML = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(lang, key);
      if (!val || val === key) return;
      el.setAttribute("placeholder", val);
    });
  }

  function initLangToggle() {
    const btn = document.getElementById("langToggle");
    if (!btn) return;
    const lang = getLang();
    setLang(lang);
    btn.addEventListener("click", () => {
      const next = getLang() === "zh" ? "en" : "zh";
      setLang(next);
    });
  }

  function initNavActive() {
    // Active state is hash-aware in shell.js (voice/keys share quickstart.html).
  }

  function initFromDownload() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "download") return;
    const banner = document.getElementById("flowBanner");
    if (banner) {
      banner.classList.remove("hidden");
      document.body.classList.add("has-flow-banner");
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return "—";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(getLang() === "zh" ? "zh-CN" : "en-US");
    } catch {
      return iso.slice(0, 10);
    }
  }

  let releaseCache = null;

  function applyReleaseMeta(data, asset) {
    const ver = document.getElementById("metaVersion");
    const date = document.getElementById("metaDate");
    const size = document.getElementById("metaSize");
    const fileName = document.getElementById("dlFileName");
    const downloadUrl =
      asset?.browser_download_url || data?.html_url || `https://github.com/${REPO}/releases/latest`;

    document.querySelectorAll(".dl-download-link").forEach((link) => {
      link.href = downloadUrl;
    });

    if (ver) ver.textContent = data?.tag_name || "—";
    if (date) date.textContent = formatDate(data?.published_at);
    if (size) size.textContent = asset ? formatBytes(asset.size) : "—";
    if (fileName && asset?.name) fileName.textContent = asset.name;
  }

  function showReleaseLoading(show, fallbackText) {
    const loading = document.getElementById("metaLoading");
    if (!loading) return;
    if (show) {
      loading.hidden = false;
      loading.textContent = t(getLang(), "dlLoading");
      return;
    }
    if (fallbackText) {
      loading.hidden = false;
      loading.textContent = fallbackText;
      return;
    }
    loading.hidden = true;
  }

  async function loadReleaseInfo() {
    const card = document.getElementById("downloadMeta");
    const btn = document.getElementById("downloadBtn");
    if (!card && !btn) return;

    const lang = getLang();
    const fallbackHref = `https://github.com/${REPO}/releases/latest`;
    const fallbackFile = t(lang, "dlFileNameFallback");

    document.querySelectorAll(".dl-download-link").forEach((link) => {
      link.href = fallbackHref;
    });
    const fileName = document.getElementById("dlFileName");
    if (fileName && !releaseCache?.asset?.name) fileName.textContent = fallbackFile;

    if (releaseCache) {
      applyReleaseMeta(releaseCache.data, releaseCache.asset);
      showReleaseLoading(false);
      return;
    }

    showReleaseLoading(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (!res.ok) throw new Error("release fetch failed");
      const data = await res.json();
      const asset =
        data.assets?.find((a) => a.name.endsWith("-setup.exe")) ||
        data.assets?.find((a) => a.name.endsWith(".exe"));

      releaseCache = { data, asset };
      applyReleaseMeta(data, asset);
      showReleaseLoading(false);
    } catch {
      document.querySelectorAll(".dl-download-link").forEach((link) => {
        link.href = fallbackHref;
      });
      showReleaseLoading(false, t(lang, "dlLoadingFallback"));
    }
  }

  function scrollToHash() {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openFaqHash() {
    scrollToHash();
  }

  window.OneToneSite = { getLang, setLang, t, strings };

  document.addEventListener("DOMContentLoaded", () => {
    initLangToggle();
    initFromDownload();
    loadReleaseInfo();
    openFaqHash();
  });
})();
