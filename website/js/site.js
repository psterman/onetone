(function () {
  "use strict";

  function initTheme() {
    const html = document.documentElement;
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;

    if (
      localStorage.theme === "dark" ||
      (!("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }

    toggle.addEventListener("click", () => {
      html.classList.toggle("dark");
      localStorage.theme = html.classList.contains("dark") ? "dark" : "light";
    });
  }

  function initNavActive() {
    const page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll(`[data-nav="${page}"]`).forEach((el) => {
      el.classList.add("nav-active", "font-semibold");
    });
  }

  function initHeroWordCycle() {
    const wordEl = document.querySelector("[data-hero-word]");
    const liveEl = document.querySelector("[data-hero-live]");
    const pillEl = document.querySelector(".hero-word-pill");
    const objectEls = Array.from(document.querySelectorAll("[data-hero-device-object]"));
    if (!wordEl || !pillEl) return;

    const fallbackWords = {
      zh: ["鼠标侧键", "手柄", "蓝牙戒指", "轨迹球", "麦克风", "遥控器"],
      en: ["mouse button", "gamepad", "Bluetooth ring", "trackball", "microphone", "remote"],
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let words = fallbackWords.zh;
    let index = 0;
    let timer = 0;

    function currentLang() {
      if (window.OneToneSite?.getLang) return window.OneToneSite.getLang();
      return document.documentElement.lang === "en" ? "en" : "zh";
    }

    function getWords() {
      const lang = currentLang();
      const siteWords = window.OneToneSite?.strings?.[lang]?.heroWords;
      if (Array.isArray(siteWords) && siteWords.length) return siteWords;
      return fallbackWords[lang] || fallbackWords.zh;
    }

    function setWord(nextIndex, animate) {
      index = nextIndex % words.length;
      if (animate) pillEl.classList.remove("is-changing");
      wordEl.textContent = words[index];
      if (liveEl) liveEl.textContent = words[index];
      objectEls.forEach((el, objectIndex) => {
        el.classList.toggle("is-active", objectIndex === index % objectEls.length);
      });
      if (animate) {
        requestAnimationFrame(() => {
          pillEl.classList.add("is-changing");
        });
      }
    }

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    }

    function start() {
      stop();
      words = getWords();
      setWord(0, false);
      if (reduceMotion.matches || document.visibilityState === "hidden" || words.length < 2) return;
      timer = window.setInterval(() => {
        setWord(index + 1, true);
      }, 1800);
    }

    document.addEventListener("visibilitychange", start);
    document.addEventListener("onetone:langchange", start);
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", start);
    }

    start();
  }

  function createCycle({ items, dots = [], interval = 2200, onChange }) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let index = 0;
    let timer = 0;

    function apply(nextIndex) {
      if (!items.length) return;
      index = nextIndex % items.length;
      items.forEach((item, itemIndex) => {
        item.classList.toggle("is-active", itemIndex === index);
      });
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === index);
      });
      if (onChange) onChange(index);
    }

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    }

    function start() {
      stop();
      apply(index);
      if (reduceMotion.matches || document.visibilityState === "hidden" || items.length < 2) return;
      timer = window.setInterval(() => apply(index + 1), interval);
    }

    items.forEach((item, itemIndex) => {
      item.addEventListener("click", () => {
        apply(itemIndex);
        start();
      });
    });

    document.addEventListener("visibilitychange", start);
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", start);
    }
    start();
  }

  function initFlowDemoCycle() {
    const root = document.querySelector('[data-cycle-group="flow"]');
    if (!root) return;
    const cards = Array.from(root.querySelectorAll(".flow-card"));
    const statuses = Array.from(root.querySelectorAll(".flow-status-panel li"));
    const dots = Array.from(root.querySelectorAll("[data-cycle-dot]"));
    createCycle({
      items: cards,
      dots,
      interval: 2400,
      onChange(index) {
        statuses.forEach((status, statusIndex) => {
          status.classList.toggle("is-active", statusIndex === index);
        });
      },
    });
  }

  function initContextCycle() {
    const root = document.querySelector('[data-cycle-group="context"]');
    if (!root) return;
    const tabs = Array.from(root.querySelectorAll(".context-tabs button"));
    createCycle({
      items: tabs,
      interval: 2200,
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNavActive();
    initHeroWordCycle();
    initFlowDemoCycle();
    initContextCycle();
  });
})();
