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
    return {
      apply,
      getIndex() {
        return index;
      },
    };
  }

  function initFlowDemoCycle() {
    const root = document.querySelector('[data-cycle-group="flow"]');
    if (!root) return;
    const items = Array.from(root.querySelectorAll(".command-item"));
    const currentEl = root.querySelector("[data-flow-current]");
    const statusEl = root.querySelector("[data-flow-status]");
    const resultEl = root.querySelector("[data-flow-result]");
    if (!items.length) return;

    const fallbacks = {
      zh: {
        statuses: ["鼠标侧键已记录", "手柄按键已记录", "蓝牙戒指已记录", "麦克风口令已记录"],
        results: [
          "按下鼠标侧键后，说的话会进入当前输入框。",
          "按下手柄按钮后，可以远距离口述文字。",
          "轻点蓝牙戒指后，不离开当前动作也能输入。",
          "说出口令后，麦克风也可以激活语音输入。",
        ],
      },
      en: {
        statuses: ["Mouse button recorded", "Gamepad button recorded", "Bluetooth ring recorded", "Voice command recorded"],
        results: [
          "Press the mouse button and your speech lands in the focused field.",
          "Press the gamepad button to dictate from farther away.",
          "Tap the Bluetooth ring to type without leaving the current action.",
          "Say the command and the microphone can wake voice input too.",
        ],
      },
    };

    function currentLang() {
      if (window.OneToneSite?.getLang) return window.OneToneSite.getLang();
      return document.documentElement.lang === "en" ? "en" : "zh";
    }

    function readList(key, fallbackKey) {
      const lang = currentLang();
      const list = window.OneToneSite?.strings?.[lang]?.[key];
      if (Array.isArray(list) && list.length) return list;
      return fallbacks[lang]?.[fallbackKey] || fallbacks.zh[fallbackKey];
    }

    function syncFlow(index) {
      const activeItem = items[index % items.length];
      const triggerName = activeItem?.querySelector("strong")?.textContent?.trim();
      const statuses = readList("flowStatusLabels", "statuses");
      const results = readList("flowResultTexts", "results");
      if (currentEl && triggerName) currentEl.textContent = triggerName;
      if (statusEl) statusEl.textContent = statuses[index % statuses.length];
      if (resultEl) resultEl.textContent = results[index % results.length];
    }

    const cycle = createCycle({
      items,
      interval: 2400,
      onChange: syncFlow,
    });

    document.addEventListener("onetone:langchange", () => {
      window.requestAnimationFrame(() => syncFlow(cycle.getIndex()));
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

  function initQuickstartSceneCycle() {
    const root = document.querySelector('[data-cycle-group="quickstart-scene"]');
    if (!root) return;
    const items = Array.from(root.querySelectorAll("[data-scene-item]"));
    const panels = Array.from(root.querySelectorAll("[data-scene-panel]"));
    if (!items.length) return;
    createCycle({
      items,
      interval: 2600,
      onChange(index) {
        panels.forEach((panel, panelIndex) => {
          panel.classList.toggle("is-active", panelIndex === index);
        });
      },
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNavActive();
    initHeroWordCycle();
    initFlowDemoCycle();
    initQuickstartSceneCycle();
    initContextCycle();
  });
})();
