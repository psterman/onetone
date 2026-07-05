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
    if (!wordEl || !pillEl) return;

    const fallbackWords = {
      zh: ["脑子里的吐槽", "还没写的周报", "凌晨三点灵感", "摸鱼时的金句", "心流上头瞬间", "今天的小目标"],
      en: ["inner roast", "late report", "3am spark", "slack gold", "flow state", "tiny win"],
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let words = fallbackWords.zh;
    let index = 0;
    let timer = 0;
    const themeCount = 6;

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

    function applyTheme(nextIndex) {
      const themeIndex = nextIndex % themeCount;
      for (let i = 0; i < themeCount; i += 1) {
        pillEl.classList.toggle(`hero-pill-theme-${i}`, i === themeIndex);
      }
    }

    function setWord(nextIndex, animate) {
      index = nextIndex % words.length;
      if (animate) pillEl.classList.remove("is-changing");
      wordEl.textContent = words[index];
      if (liveEl) liveEl.textContent = words[index];
      applyTheme(index);
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

  function initHeroDeviceCycle() {
    const objectEls = Array.from(document.querySelectorAll("[data-hero-device-object]"));
    const listeningCard = document.querySelector(".hero-object-demo .hero-listening-card");
    const textDemo = document.querySelector(".hero-object-demo .hero-text-demo");
    if (!objectEls.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let index = 0;
    let timer = 0;

    function setDevice(nextIndex, animate) {
      index = nextIndex % objectEls.length;
      objectEls.forEach((el, objectIndex) => {
        el.classList.toggle("is-active", objectIndex === index);
      });
      if (listeningCard) {
        listeningCard.classList.remove("is-pulsing");
        if (animate) {
          requestAnimationFrame(() => listeningCard.classList.add("is-pulsing"));
        }
      }
      if (textDemo && animate) {
        textDemo.classList.remove("is-typing-reset");
        requestAnimationFrame(() => textDemo.classList.add("is-typing-reset"));
      }
    }

    function stop() {
      if (!timer) return;
      window.clearInterval(timer);
      timer = 0;
    }

    function start() {
      stop();
      setDevice(0, false);
      if (reduceMotion.matches || document.visibilityState === "hidden" || objectEls.length < 2) return;
      timer = window.setInterval(() => {
        setDevice(index + 1, true);
      }, 2200);
    }

    document.addEventListener("visibilitychange", start);
    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", start);
    }

    start();
  }

  function createCycle({ items, dots = [], interval = 2200, onChange, autoplay = true }) {
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
      if (!autoplay || reduceMotion.matches || document.visibilityState === "hidden" || items.length < 2) return;
      timer = window.setInterval(() => apply(index + 1), interval);
    }

    items.forEach((item, itemIndex) => {
      item.addEventListener("click", () => {
        apply(itemIndex);
        if (autoplay) start();
      });
    });

    if (autoplay) {
      document.addEventListener("visibilitychange", start);
      if (reduceMotion.addEventListener) {
        reduceMotion.addEventListener("change", start);
      }
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

    function flowTargetLabel() {
      const lang = currentLang();
      return window.OneToneSite?.strings?.[lang]?.flowTargetLabel
        || (lang === "en" ? "voice wake key" : "语音唤醒键");
    }

    function syncFlow(index) {
      const activeItem = items[index % items.length];
      const triggerName = activeItem?.querySelector("strong")?.textContent?.trim();
      const statuses = readList("flowStatusLabels", "statuses");
      const results = readList("flowResultTexts", "results");
      if (currentEl && triggerName) currentEl.textContent = triggerName;
      const targetEl = root.querySelector("[data-flow-target]");
      if (targetEl) targetEl.textContent = flowTargetLabel();
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
    const autoplay = !root.hasAttribute("data-no-autoplay");
    createCycle({
      items,
      interval: 2600,
      autoplay,
      onChange(index) {
        panels.forEach((panel, panelIndex) => {
          panel.classList.toggle("is-active", panelIndex === index);
        });
      },
    });
  }

  const QS_IME_PRESETS = [
    { id: "typeless", nameKey: "imePresetTypeless", badge: "Ty", badgeEn: "Ty", targetKey: "RAlt", icon: "assets/icons/ime/typeless.png" },
    { id: "zhipu", nameKey: "imePresetZhipu", badge: "智", badgeEn: "Zp", targetKey: "RAlt", icon: "assets/icons/ime/zhipu.png" },
    { id: "qianwen", nameKey: "imePresetQianwen", badge: "千", badgeEn: "Qw", targetKey: "RAlt", icon: "assets/icons/ime/qianwen.png" },
    { id: "shandianshuo", nameKey: "imePresetShandianshuo", badge: "闪", badgeEn: "Li", targetKey: "RAlt", icon: "assets/icons/ime/shandianshuo.jpg" },
    { id: "sogou", nameKey: "imePresetSogou", badge: "搜", badgeEn: "Sg", targetKey: "Ctrl+Space", icon: "assets/icons/ime/sougou.png" },
    { id: "xunfei", nameKey: "imePresetXunfei", badge: "讯", badgeEn: "Xf", targetKey: "F2", icon: "assets/icons/ime/xunfei.png" },
  ];

  const HOME_IME_PRESET_IDS = ["typeless", "xunfei", "sogou"];
  const HOME_IME_PHRASE_KEYS = ["homeImeWakePhrase1", "homeImeWakePhrase2", "homeImeWakePhrase3"];

  const HOME_IME_DEMO_CONFIGS = {
    normal: {
      withWake: true,
      withSend: true,
      draftKey: "homeImeWakeDraft",
      partialDraftKey: null,
      doneKey: null,
      flowLabelKeys: ["homeImeWakeFlowEnd", "homeImeWakeFlowWait", "homeImeWakeFlowSend"],
    },
    cancel: {
      withWake: false,
      withSend: false,
      draftKey: "homeImeCancelDraft",
      partialDraftKey: "homeImeCancelDraftPartial",
      doneKey: "homeImeCancelDone",
      flowLabelKeys: ["homeImeWakeFlow1", "homeImeWakeFlow2", "homeImeWakeFlow3"],
    },
  };

  function getHomeImePresets() {
    return HOME_IME_PRESET_IDS.map((id) => QS_IME_PRESETS.find((p) => p.id === id)).filter(Boolean);
  }

  function createHomeImeDemo(root, config) {
    const stageEl = root.querySelector(".home-ime-wake-stage");
    const phraseTranscriptEl = root.querySelector("[data-home-ime-phrase]");
    const statusEl = root.querySelector("[data-home-ime-status]");
    const phraseNodeEl = root.querySelector("[data-home-ime-phrase-node]");
    const phraseLabelEl = root.querySelector("[data-home-ime-phrase-label]");
    const onetoneEl = root.querySelector("[data-home-ime-onetone]");
    const targetEl = root.querySelector("[data-home-ime-target]");
    const iconEl = root.querySelector("[data-home-ime-icon]");
    const nameEl = root.querySelector("[data-home-ime-name]");
    const barEl = root.querySelector("[data-home-ime-bar]");
    const barTextEl = root.querySelector("[data-home-ime-bar-text]");
    const editorEl = root.querySelector("[data-home-ime-editor]");
    const typedEl = root.querySelector("[data-home-ime-typed]");
    const typedWrap = root.querySelector(".home-ime-typed");
    const sendBtn = root.querySelector("[data-home-ime-send]");
    const cancelChip = root.querySelector("[data-home-ime-cancel-chip]");
    const delayEl = root.querySelector("[data-home-ime-delay]");
    const delayFillEl = root.querySelector("[data-home-ime-delay-fill]");
    const outcomeEl = root.querySelector("[data-home-ime-outcome-status]");
    const flowSteps = Array.from(root.querySelectorAll("[data-home-ime-flow-step]"));

    const presets = getHomeImePresets();
    if (!presets.length) return;

    let presetIndex = 0;
    let phraseIndex = 0;
    const timers = [];
    let typeTimer = 0;
    let running = false;
    let visible = false;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function clearAll() {
      timers.splice(0).forEach((id) => window.clearTimeout(id));
      if (typeTimer) {
        window.clearTimeout(typeTimer);
        typeTimer = 0;
      }
    }

    function schedule(fn, delay) {
      const id = window.setTimeout(fn, delay);
      timers.push(id);
      return id;
    }

    function currentPhrase() {
      const key = HOME_IME_PHRASE_KEYS[phraseIndex % HOME_IME_PHRASE_KEYS.length];
      return qsT(key);
    }

    function getDraftText() {
      return qsT(config.draftKey);
    }

    function getPartialDraftText() {
      return config.partialDraftKey ? qsT(config.partialDraftKey) : "";
    }

    function syncFlowLabels() {
      config.flowLabelKeys.forEach((key, index) => {
        if (flowSteps[index]) flowSteps[index].textContent = qsT(key);
      });
    }

    function setWakeStatus(key) {
      if (statusEl) statusEl.textContent = qsT(key);
    }

    function setBarText(key) {
      if (barTextEl) barTextEl.textContent = qsT(key);
    }

    function setOutcome(text, muted = false) {
      if (!outcomeEl) return;
      outcomeEl.textContent = text;
      outcomeEl.classList.toggle("is-muted", muted);
      outcomeEl.removeAttribute("hidden");
    }

    function hideOutcome() {
      outcomeEl?.setAttribute("hidden", "");
      outcomeEl?.classList.remove("is-muted");
    }

    function syncFlowStep(step) {
      flowSteps.forEach((item) => {
        const idx = Number(item.dataset.homeImeFlowStep);
        item.classList.toggle("is-active", idx <= step);
        item.classList.toggle("is-current", idx === step);
      });
    }

    function syncPreset(preset) {
      if (iconEl && preset?.icon) {
        iconEl.src = preset.icon;
        iconEl.alt = qsT(preset.nameKey);
      }
      if (nameEl && preset) nameEl.textContent = qsT(preset.nameKey);
    }

    function syncPhraseLabel(phrase) {
      if (phraseLabelEl) phraseLabelEl.textContent = `「${phrase}」`;
    }

    function resetVisual() {
      stageEl?.classList.remove("is-listening");
      phraseNodeEl?.classList.remove("is-lit");
      onetoneEl?.classList.remove("is-lit");
      targetEl?.classList.remove("is-lit");
      barEl?.classList.remove("is-active", "is-ending");
      editorEl?.classList.remove("is-waiting", "is-sending", "is-sent", "is-canceling", "is-retrying", "is-done");
      typedWrap?.classList.remove("is-typing");
      phraseTranscriptEl?.classList.remove("is-typing");
      cancelChip?.classList.remove("is-lit");
      cancelChip?.setAttribute("hidden", "");
      if (phraseTranscriptEl) phraseTranscriptEl.textContent = "";
      if (typedEl) typedEl.textContent = "";
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.classList.remove("is-sent");
      }
      delayEl?.setAttribute("hidden", "");
      if (delayFillEl) delayFillEl.style.width = "0%";
      hideOutcome();
      syncFlowStep(0);
      if (config.withWake && statusEl) setWakeStatus("homeImeWakeRecognizing");
      setBarText("homeImeWakeListening");
    }

    function showFinalState(preset, phrase) {
      syncPreset(preset);
      syncFlowLabels();
      if (config.withWake) {
        syncPhraseLabel(phrase);
        if (phraseTranscriptEl) phraseTranscriptEl.textContent = phrase;
        phraseNodeEl?.classList.add("is-lit");
        onetoneEl?.classList.add("is-lit");
        targetEl?.classList.add("is-lit");
      }
      if (config.withSend) {
        barEl?.classList.add("is-ending");
        if (typedEl) typedEl.textContent = getDraftText();
        editorEl?.classList.add("is-committed");
        syncFlowStep(3);
        setOutcome(qsT("homeImeWakeSent"));
        if (sendBtn) {
          sendBtn.disabled = true;
          sendBtn.classList.add("is-sent");
        }
        setBarText("homeImeWakeEnded");
        return;
      }
      barEl?.classList.add("is-active");
      if (typedEl) typedEl.textContent = getDraftText();
      editorEl?.classList.add("is-done");
      syncFlowStep(3);
      if (config.doneKey) setOutcome(qsT(config.doneKey));
    }

    function typeInto(el, text, speed, onDone) {
      if (!el) {
        onDone?.();
        return;
      }
      el.textContent = "";
      el.classList.add("is-typing");
      let index = 0;
      const step = () => {
        if (!running || !visible) return;
        el.textContent = text.slice(0, index);
        if (index < text.length) {
          index += 1;
          typeTimer = window.setTimeout(step, speed);
          return;
        }
        el.classList.remove("is-typing");
        onDone?.();
      };
      step();
    }

    function typeDraft(text, onDone) {
      if (!typedEl) {
        onDone?.();
        return;
      }
      typedEl.textContent = "";
      typedWrap?.classList.add("is-typing");
      let index = 0;
      const step = () => {
        if (!running || !visible) return;
        typedEl.textContent = text.slice(0, index);
        if (index < text.length) {
          index += 1;
          typeTimer = window.setTimeout(step, 48);
          return;
        }
        typedWrap?.classList.remove("is-typing");
        onDone?.();
      };
      step();
    }

    function playAfterEnd(onDone) {
      barEl?.classList.remove("is-active");
      barEl?.classList.add("is-ending");
      setBarText("homeImeWakeEnded");
      syncFlowStep(1);

      schedule(() => {
        editorEl?.classList.add("is-waiting");
        delayEl?.removeAttribute("hidden");
        setOutcome(qsT("homeImeWakeWaiting"));
        syncFlowStep(2);
        if (delayFillEl) delayFillEl.style.width = "0%";
        window.requestAnimationFrame(() => {
          if (delayFillEl) delayFillEl.style.width = "100%";
        });

        schedule(() => {
          editorEl?.classList.remove("is-waiting");
          editorEl?.classList.add("is-committed");
          delayEl?.setAttribute("hidden", "");
          editorEl?.classList.add("is-sending");
          syncFlowStep(3);
          setOutcome(qsT("homeImeWakeSending"));
          if (sendBtn) sendBtn.disabled = false;

          schedule(() => {
            if (sendBtn) {
              sendBtn.disabled = true;
              sendBtn.classList.add("is-sent");
            }
            editorEl?.classList.remove("is-sending");
            editorEl?.classList.add("is-sent");
            if (typedEl) typedEl.textContent = "";
            setOutcome(qsT("homeImeWakeSent"));
            schedule(onDone, 1200);
          }, 980);
        }, reduceMotion.matches ? 500 : 1300);
      }, 520);
    }

    function playCancelMidDictation(onDone) {
      schedule(() => {
        cancelChip?.removeAttribute("hidden");
        cancelChip?.classList.add("is-lit");
        setOutcome(qsT("homeImeWakeCancelHint"));
        syncFlowStep(2);
        editorEl?.classList.add("is-canceling");
        barEl?.classList.add("is-ending");
        setBarText("homeImeWakeCancelAction");

        schedule(() => {
          if (typedEl) typedEl.textContent = "";
          editorEl?.classList.remove("is-canceling");
          barEl?.classList.remove("is-active", "is-ending");
          cancelChip?.classList.remove("is-lit");
          cancelChip?.setAttribute("hidden", "");
          setOutcome(qsT("homeImeWakeCanceled"), true);
          syncFlowStep(3);

          schedule(() => {
            hideOutcome();
            editorEl?.classList.add("is-retrying");
            barEl?.classList.add("is-active");
            setBarText("homeImeWakeListening");
            typeDraft(getDraftText(), () => {
              editorEl?.classList.remove("is-retrying");
              editorEl?.classList.add("is-done");
              if (config.doneKey) setOutcome(qsT(config.doneKey));
              schedule(onDone, 1400);
            });
          }, 900);
        }, 820);
      }, 480);
    }

    function playWakePhase(onReady) {
      const preset = presets[presetIndex % presets.length];
      const phrase = currentPhrase();
      syncPreset(preset);
      syncPhraseLabel(phrase);
      syncFlowLabels();
      stageEl?.classList.add("is-listening");
      setWakeStatus("homeImeWakeRecognizing");

      typeInto(phraseTranscriptEl, phrase, 68, () => {
        schedule(() => phraseNodeEl?.classList.add("is-lit"), 180);
        schedule(() => onetoneEl?.classList.add("is-lit"), 520);
        schedule(() => {
          stageEl?.classList.remove("is-listening");
          targetEl?.classList.add("is-lit");
        }, 860);
        schedule(() => {
          barEl?.classList.add("is-active");
          setBarText("homeImeWakeListening");
          syncFlowStep(1);
        }, 1180);
        schedule(onReady, 1500);
      });
    }

    function playCancelCycle(onDone) {
      syncFlowLabels();
      barEl?.classList.add("is-active");
      setBarText("homeImeWakeListening");
      syncFlowStep(1);

      schedule(() => {
        typeDraft(getPartialDraftText(), () => {
          playCancelMidDictation(onDone);
        });
      }, 420);
    }

    function playCycle() {
      if (!visible || !running) return;
      clearAll();
      resetVisual();

      const preset = presets[presetIndex % presets.length];
      const phrase = currentPhrase();

      if (reduceMotion.matches) {
        showFinalState(preset, phrase);
        presetIndex += 1;
        phraseIndex += 1;
        schedule(() => playCycle(), 6500);
        return;
      }

      const finishCycle = () => {
        presetIndex += 1;
        phraseIndex += 1;
        schedule(() => playCycle(), 900);
      };

      if (config.withWake) {
        playWakePhase(() => {
          typeDraft(getDraftText(), () => {
            playAfterEnd(finishCycle);
          });
        });
        return;
      }

      playCancelCycle(finishCycle);
    }

    function start() {
      if (running) return;
      running = true;
      playCycle();
    }

    function stop() {
      running = false;
      clearAll();
      resetVisual();
    }

    document.addEventListener("onetone:langchange", () => {
      syncFlowLabels();
      if (reduceMotion.matches && visible) {
        showFinalState(presets[presetIndex % presets.length], currentPhrase());
      }
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.target !== root) return;
            visible = entry.isIntersecting;
            if (visible) start();
            else stop();
          });
        },
        { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
      );
      observer.observe(root);
    } else {
      visible = true;
      start();
    }

    if (reduceMotion.addEventListener) {
      reduceMotion.addEventListener("change", () => {
        if (!visible) return;
        stop();
        start();
      });
    }
  }

  function initHomeImeWakeDemo() {
    document.querySelectorAll("[data-home-ime-demo]").forEach((root) => {
      const variant = root.dataset.homeImeDemo || "normal";
      const config = HOME_IME_DEMO_CONFIGS[variant];
      if (config) createHomeImeDemo(root, config);
    });
  }

  const QS_TRIGGER_FALLBACK = {
    zh: {
      mouse: "鼠标侧键",
      volume: "音量键",
      gamepad: "手柄按键",
      ring: "蓝牙戒指",
      trackball: "轨迹球",
      mic: "麦克风口令",
    },
    en: {
      mouse: "Mouse button",
      volume: "Volume key",
      gamepad: "Gamepad button",
      ring: "Bluetooth ring",
      trackball: "Trackball",
      mic: "Voice command",
    },
  };

  function qsLang() {
    if (window.OneToneSite?.getLang) return window.OneToneSite.getLang();
    return document.documentElement.lang === "en" ? "en" : "zh";
  }

  function qsT(key) {
    const lang = qsLang();
    return window.OneToneSite?.strings?.[lang]?.[key] || window.OneToneSite?.strings?.zh?.[key] || key;
  }

  function initQuickstartScrollReveal() {
    const nodes = document.querySelectorAll(".qs-reveal");
    if (!nodes.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    nodes.forEach((node) => observer.observe(node));

    window.requestAnimationFrame(() => {
      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.94) node.classList.add("is-visible");
      });
    });
  }

  function initHomeReveal() {
    const nodes = document.querySelectorAll(".home-reveal");
    if (!nodes.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
    );

    nodes.forEach((node, index) => {
      node.style.transitionDelay = `${Math.min(index * 70, 280)}ms`;
      observer.observe(node);
    });

    window.requestAnimationFrame(() => {
      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.92) node.classList.add("is-visible");
      });
    });
  }

  function initQuickstartScrollSpy() {
    const zones = ["step1", "step2"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!zones.length || !("IntersectionObserver" in window)) return;

    const chainMap = { step1: 0, step2: 1 };
    let activeId = "step1";

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const nextId = visible.target.id;
        if (nextId === activeId) return;
        activeId = nextId;
        if (chainMap[nextId] != null) setQuickstartChainHighlight(chainMap[nextId]);
      },
      { threshold: [0.15, 0.35, 0.55], rootMargin: "-20% 0px -45% 0px" }
    );

    zones.forEach((zone) => observer.observe(zone));
  }

  function activateQuickstartPanels(panels, target) {
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.zonePanel === target);
    });
  }

  function initQuickstartZoneLab(root, chainIndex) {
    const items = Array.from(root.querySelectorAll("[data-zone-item]"));
    const panels = Array.from(root.querySelectorAll("[data-zone-panel]"));
    if (!items.length || !panels.length) return null;

    const autoplay = !root.hasAttribute("data-no-autoplay");
    const cycle = createCycle({
      items,
      autoplay,
      onChange(index) {
        const target = items[index]?.dataset.zoneTarget;
        activateQuickstartPanels(panels, target);
        if (root.dataset.cycleGroup === "zone2") {
          setQuickstartChainHighlight(index >= 2 ? 2 : 1);
        } else if (typeof chainIndex === "number") {
          setQuickstartChainHighlight(chainIndex);
        }
      },
    });

    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = root.closest(".qs-zone");
        const sectionId = section?.id;
        if (sectionId && sectionId.startsWith("step")) {
          history.replaceState(null, "", `#${sectionId}`);
        }
      });
    });

    return cycle;
  }

  function setQuickstartChainHighlight(activeIndex) {
    document.querySelectorAll("[data-chain-seg]").forEach((seg) => {
      const idx = Number(seg.dataset.chainSeg);
      seg.classList.toggle("is-active", idx === activeIndex);
    });
  }

  function initQuickstartImePresets() {
    const hosts = document.querySelectorAll("[data-ime-list]");
    if (!hosts.length) return;

    hosts.forEach((host) => {
      const lang = qsLang();
      host.innerHTML = QS_IME_PRESETS.map((preset, index) => {
        const label = qsT(preset.nameKey);
        const badge = lang === "en" ? preset.badgeEn : preset.badge;
        return `<button type="button" class="qs-ime-preset${index === 0 ? " is-active" : ""}" data-ime-id="${preset.id}" data-target-key="${preset.targetKey}" data-ime-icon="${preset.icon}" aria-pressed="${index === 0 ? "true" : "false"}"><img class="qs-ime-logo" src="${preset.icon}" alt="" width="24" height="24" decoding="async"><span>${label}</span><kbd>${preset.targetKey}</kbd></button>`;
      }).join("");

      host.querySelectorAll(".qs-ime-preset").forEach((btn) => {
        btn.addEventListener("click", () => {
          host.querySelectorAll(".qs-ime-preset").forEach((el) => {
            const active = el === btn;
            el.classList.toggle("is-active", active);
            el.setAttribute("aria-pressed", active ? "true" : "false");
          });
          syncQuickstartMappingPreview();
        });
      });
    });
  }

  function getSelectedTriggerLabel() {
    const active = document.querySelector(".qs-trigger-item.is-active");
    if (!active) return QS_TRIGGER_FALLBACK[qsLang()].mouse;
    const id = active.dataset.triggerId;
    const keyMap = {
      mouse: "triggerMouse",
      volume: "triggerVolume",
      gamepad: "triggerGamepad",
      ring: "triggerRing",
      trackball: "triggerTrackball",
      mic: "triggerMic",
    };
    return qsT(keyMap[id] || "triggerMouse");
  }

  function getSelectedImePreset() {
    const active = document.querySelector(".qs-ime-preset.is-active");
    if (!active) return QS_IME_PRESETS[0];
    const id = active.dataset.imeId;
    return QS_IME_PRESETS.find((p) => p.id === id) || QS_IME_PRESETS[0];
  }

  const TRIGGER_ICON_CLASS = {
    mouse: "ph-mouse",
    volume: "ph-speaker-high",
    gamepad: "ph-gamepad",
    ring: "ph-record",
    trackball: "ph-circle-notch",
    mic: "ph-microphone",
  };

  function syncQuickstartMappingPreview() {
    const triggerEl = document.querySelector("[data-qs-trigger-label]");
    const imeLabelEl = document.querySelector("[data-qs-ime-label]");
    const badgeEl = document.querySelector("[data-qs-ime-badge]");
    const keyEl = document.querySelector("[data-qs-target-key]");
    const imeIconEl = document.querySelector("[data-qs-ime-icon]");
    const preset = getSelectedImePreset();
    if (triggerEl) triggerEl.textContent = getSelectedTriggerLabel();
    if (imeLabelEl) imeLabelEl.textContent = qsT(preset.nameKey);
    if (badgeEl) {
      badgeEl.textContent = qsLang() === "en" ? preset.badgeEn : preset.badge;
      badgeEl.hidden = false;
    }
    if (imeIconEl && preset.icon) {
      imeIconEl.src = preset.icon;
      imeIconEl.alt = qsT(preset.nameKey);
      if (badgeEl) badgeEl.hidden = true;
    }
    if (keyEl) keyEl.textContent = preset.targetKey;

    // ── 同步上手体验流：Stage 01 图标随触发器切换，Stage 02 是 OneTone 自身（不跟 IME） ──
    const activeTrigger = document.querySelector(".qs-trigger-item.is-active");
    const demoIconWrap = document.querySelector("[data-qs-demo-icon]");
    const demoKey = document.querySelector("[data-qs-demo-key]");
    if (demoKey) demoKey.textContent = getSelectedTriggerLabel();
    if (demoIconWrap) {
      const id = activeTrigger?.dataset.triggerId || "mouse";
      const cls = TRIGGER_ICON_CLASS[id] || TRIGGER_ICON_CLASS.mouse;
      demoIconWrap.innerHTML = `<i class="ph-bold ${cls}" aria-hidden="true"></i>`;
    }
  }

  // ── 上手体验：编辑器里"打字"循环 ──
  const QS_TYPING_PHRASES = {
    zh: [
      "// 重构这个函数",
      "explain(text);",
      "// 加单元测试",
      "AI.write(code);",
    ],
    en: [
      "// refactor this fn",
      "explain(text);",
      "// add unit tests",
      "AI.write(code);",
    ],
  };

  function runOnboardTypingDemo() {
    const target = document.querySelector("[data-qs-demo-target]");
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      target.textContent = "AI.write(code);";
      return;
    }
    let idx = 0;
    let typingTimer = null;
    let eraseTimer = null;

    function pickPhrase() {
      const arr = QS_TYPING_PHRASES[qsLang()] || QS_TYPING_PHRASES.zh;
      return arr[idx % arr.length];
    }
    function typeChar(text, i) {
      if (i > text.length) {
        eraseTimer = setTimeout(() => eraseChar(text, text.length), 1600);
        return;
      }
      target.textContent = text.slice(0, i);
      typingTimer = setTimeout(() => typeChar(text, i + 1), 70);
    }
    function eraseChar(text, j) {
      if (j < 0) {
        idx++;
        typingTimer = setTimeout(startCycle, 500);
        return;
      }
      target.textContent = text.slice(0, j);
      eraseTimer = setTimeout(() => eraseChar(text, j - 1), 28);
    }
    function startCycle() {
      const text = pickPhrase();
      typeChar(text, 0);
    }
    startCycle();
    return {
      restart: () => { clearTimeout(typingTimer); clearTimeout(eraseTimer); idx = 0; startCycle(); },
    };
  }

  let onboardTypingCtrl = null;
  function initQuickstartTriggerRef() {
    const items = Array.from(document.querySelectorAll(".qs-trigger-item"));
    if (!items.length) return;
    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        items.forEach((el) => el.classList.toggle("is-active", el === btn));
        syncQuickstartMappingPreview();
      });
    });
    syncQuickstartMappingPreview();
    onboardTypingCtrl = runOnboardTypingDemo();
    document.addEventListener("onetone:langchange", () => {
      syncQuickstartMappingPreview();
      if (onboardTypingCtrl) onboardTypingCtrl.restart();
    });
  }

  const quickstartZoneCycles = {};
  let voiceBindDemo = null;
  let afterSpeakDemo = null;

  function initQuickstartVoiceBindDemo() {
    const root = document.querySelector("[data-voice-bind-demo]");
    if (!root) return null;

    const scene = root.querySelector(".qs-voice-bind-scene");
    const statusText = root.querySelector("[data-bind-status-text]");
    const transcript = root.querySelector("[data-bind-transcript]");
    const result = root.querySelector("[data-bind-result]");
    const resultPhrase = root.querySelector("[data-bind-result-phrase]");
    const resultIme = root.querySelector("[data-bind-result-ime]");
    const resultKey = root.querySelector("[data-bind-result-key]");
    const resultIcon = root.querySelector("[data-bind-result-icon]");
    const chips = Array.from(root.querySelectorAll("[data-bind-phrase-key]"));
    const panel = root.closest('[data-zone-panel="key-wake"]');

    let loopTimer = 0;
    let typeTimer = 0;
    let chipIndex = 0;
    let animating = false;

    function phraseFromChip(chip) {
      return qsT(chip.dataset.bindPhraseKey);
    }

    function syncChipLabels() {
      chips.forEach((chip) => {
        chip.textContent = phraseFromChip(chip);
      });
    }

    function setStatus(key) {
      if (statusText) statusText.textContent = qsT(key);
    }

    function clearLoop() {
      if (loopTimer) {
        window.clearTimeout(loopTimer);
        loopTimer = 0;
      }
    }

    function clearTyping() {
      if (typeTimer) {
        window.clearTimeout(typeTimer);
        typeTimer = 0;
      }
    }

    function isPanelActive() {
      return panel?.classList.contains("is-active");
    }

    function stop() {
      clearLoop();
      clearTyping();
      animating = false;
      scene?.classList.remove("is-listening", "is-binding", "is-bound");
      transcript?.classList.remove("is-typing");
      if (transcript) transcript.textContent = "";
      result?.setAttribute("hidden", "");
      setStatus("qsVoiceBindIdle");
    }

    function showResult(phrase, preset) {
      if (resultPhrase) resultPhrase.textContent = `「${phrase}」`;
      if (resultIme) resultIme.textContent = qsT(preset.nameKey);
      if (resultKey) resultKey.textContent = preset.targetKey;
      if (resultIcon && preset.icon) {
        resultIcon.src = preset.icon;
        resultIcon.alt = qsT(preset.nameKey);
      }
      result?.removeAttribute("hidden");
    }

    function playPhrase(chip, { autoNext = false } = {}) {
      if (!chip || !scene || !isPanelActive()) return;

      clearLoop();
      clearTyping();
      animating = true;
      chips.forEach((el) => el.classList.toggle("is-active", el === chip));

      const phrase = phraseFromChip(chip);
      const preset = getSelectedImePreset();

      scene.classList.remove("is-bound", "is-binding");
      scene.classList.add("is-listening");
      result?.setAttribute("hidden", "");
      setStatus("qsVoiceBindListening");
      if (transcript) {
        transcript.textContent = "";
        transcript.classList.add("is-typing");
      }

      let index = 0;
      const typeNext = () => {
        if (!transcript || !isPanelActive()) {
          animating = false;
          return;
        }
        transcript.textContent = phrase.slice(0, index);
        if (index < phrase.length) {
          index += 1;
          typeTimer = window.setTimeout(typeNext, 68);
          return;
        }

        transcript.classList.remove("is-typing");
        scene.classList.remove("is-listening");
        scene.classList.add("is-binding");
        setStatus("qsVoiceBindBinding");

        window.setTimeout(() => {
          if (!isPanelActive()) {
            animating = false;
            return;
          }
          scene.classList.remove("is-binding");
          scene.classList.add("is-bound");
          setStatus("qsVoiceBindBound");
          showResult(phrase, preset);
          animating = false;
          if (autoNext) scheduleNext(4200);
        }, 620);
      };

      typeNext();
    }

    function scheduleNext(delay) {
      clearLoop();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      loopTimer = window.setTimeout(() => {
        if (!isPanelActive() || animating) {
          if (isPanelActive()) scheduleNext(800);
          return;
        }
        playPhrase(chips[chipIndex % chips.length], { autoNext: true });
        chipIndex += 1;
      }, reduceMotion.matches ? Math.max(delay, 6500) : delay);
    }

    function start() {
      if (!isPanelActive() || !chips.length) return;
      chipIndex = 0;
      playPhrase(chips[0], { autoNext: true });
      chipIndex = 1;
    }

    syncChipLabels();
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        playPhrase(chip, { autoNext: true });
        chipIndex = (chips.indexOf(chip) + 1) % chips.length;
      });
    });

    return { start, stop, syncChipLabels, isPanelActive };
  }

  function initQuickstartAfterSpeakDemo() {
    const root = document.querySelector("[data-after-speak-demo]");
    if (!root) return null;

    const layout = root.closest(".qs-after-speak-layout");
    const inputEl = root.querySelector("[data-after-input]");
    const statusText = root.querySelector("[data-after-status-text]");
    const sendBtn = root.querySelector("[data-after-send-btn]");
    const actionBox = root.querySelector("[data-after-action]");
    const actionText = root.querySelector("[data-after-action-text]");
    const keyEl = root.querySelector("[data-after-key]");
    const delayBox = root.querySelector("[data-after-delay]");
    const delayFill = root.querySelector("[data-after-delay-fill]");
    const delayMsEl = root.querySelector("[data-after-delay-ms]");
    const delaySettingFill = layout?.querySelector("[data-after-delay-setting-fill]");
    const delaySettingMs = layout?.querySelector("[data-after-delay-setting-ms]");
    const modeBtns = Array.from(root.querySelectorAll("[data-after-mode]"));
    const toggleEl = layout?.querySelector('[data-after-toggle="autosend"]');
    const commitBtns = Array.from(layout?.querySelectorAll("[data-after-commit]") || []);
    const flowSteps = Array.from(layout?.querySelectorAll("[data-after-flow-step]") || []);
    const panel = root.closest('[data-zone-panel="auto-send"]');

    const modeOrder = ["auto", "off"];
    const commitKeys = ["Enter", "Ctrl+Enter"];
    const demoDelayMs = 4000;
    let loopTimer = 0;
    let stepTimer = 0;
    let typeTimer = 0;
    let animating = false;
    let currentMode = "auto";
    let modeIndex = 0;
    let commitIndex = 0;

    function setStatus(key, params = {}) {
      if (!statusText) return;
      let text = qsT(key);
      Object.entries(params).forEach(([name, value]) => {
        text = text.replace(new RegExp(`\\{${name}\\}`, "g"), value);
      });
      statusText.textContent = text;
    }

    function clearTimers() {
      if (loopTimer) {
        window.clearTimeout(loopTimer);
        loopTimer = 0;
      }
      if (stepTimer) {
        window.clearTimeout(stepTimer);
        stepTimer = 0;
      }
      if (typeTimer) {
        window.clearTimeout(typeTimer);
        typeTimer = 0;
      }
    }

    function isPanelActive() {
      return panel?.classList.contains("is-active");
    }

    function formatDelay(ms) {
      return `${(ms / 1000).toFixed(1)}s`;
    }

    function syncAutoSendToggle(enabled) {
      toggleEl?.classList.toggle("is-on", enabled);
    }

    function syncCommitKey(key) {
      commitBtns.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.afterCommit === key);
      });
      if (keyEl) keyEl.textContent = key;
      const flow3 = layout?.querySelector('[data-after-flow-step="3"] span');
      if (flow3) {
        flow3.textContent = qsT("qsAfterSpeakFlow3").replace("{key}", key);
      }
    }

    function syncFlowStep(step) {
      flowSteps.forEach((item) => {
        const idx = Number(item.dataset.afterFlowStep);
        item.classList.toggle("is-active", idx <= step);
        item.classList.toggle("is-current", idx === step);
      });
    }

    function setMode(mode) {
      currentMode = mode === "off" ? "off" : "auto";
      modeIndex = Math.max(0, modeOrder.indexOf(currentMode));
      modeBtns.forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.afterMode === currentMode);
      });
      root.classList.toggle("is-auto-mode", currentMode === "auto");
      root.classList.toggle("is-off-mode", currentMode === "off");
    }

    function resetVisual() {
      root.classList.remove("is-typing", "is-waiting", "is-sending", "is-sent", "is-off-done");
      keyEl?.classList.remove("is-pulse");
      actionBox?.setAttribute("hidden", "");
      delayBox?.setAttribute("hidden", "");
      if (delayFill) delayFill.style.width = "0%";
      if (inputEl) inputEl.textContent = "";
      if (actionText) actionText.textContent = "";
      if (sendBtn) sendBtn.disabled = true;
      syncAutoSendToggle(false);
      syncFlowStep(0);
    }

    function stop() {
      clearTimers();
      animating = false;
      resetVisual();
      setStatus("qsAfterSpeakStatusIdle");
    }

    function scheduleNext(delay) {
      clearTimers();
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      loopTimer = window.setTimeout(() => {
        if (!isPanelActive() || animating) {
          if (isPanelActive()) scheduleNext(800);
          return;
        }
        modeIndex = (modeIndex + 1) % modeOrder.length;
        if (modeOrder[modeIndex] === "auto") {
          commitIndex = (commitIndex + 1) % commitKeys.length;
        }
        setMode(modeOrder[modeIndex]);
        play({ autoNext: true, mode: currentMode });
      }, reduceMotion.matches ? Math.max(delay, 6500) : delay);
    }

    function animateDelay(onDone) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const duration = reduceMotion.matches ? 400 : 1400;
      const label = formatDelay(demoDelayMs);

      delayBox?.removeAttribute("hidden");
      if (delayMsEl) delayMsEl.textContent = label;
      if (delaySettingMs) delaySettingMs.textContent = label;
      if (delaySettingFill) delaySettingFill.style.width = "40%";
      root.classList.add("is-waiting");
      setStatus("qsAfterSpeakStatusWaiting");
      syncFlowStep(2);

      if (delayFill) delayFill.style.width = "0%";
      window.requestAnimationFrame(() => {
        if (delayFill) delayFill.style.width = "100%";
      });

      stepTimer = window.setTimeout(() => {
        root.classList.remove("is-waiting");
        delayBox?.setAttribute("hidden", "");
        onDone();
      }, duration);
    }

    function play({ autoNext = false, mode = currentMode } = {}) {
      if (!isPanelActive()) return;

      clearTimers();
      animating = true;
      setMode(mode);
      resetVisual();
      setStatus("qsAfterSpeakStatusIdle");

      const phrase = qsT("qsAfterSpeakDraft");
      const commitKey = commitKeys[commitIndex];
      syncCommitKey(commitKey);
      let index = 0;

      stepTimer = window.setTimeout(() => {
        if (!isPanelActive()) {
          animating = false;
          return;
        }

        root.classList.add("is-typing");
        setStatus("qsAfterSpeakStatusTyping");

        const typeNext = () => {
          if (!inputEl || !isPanelActive()) {
            animating = false;
            return;
          }
          inputEl.textContent = phrase.slice(0, index);
          if (index < phrase.length) {
            index += 1;
            typeTimer = window.setTimeout(typeNext, 42);
            return;
          }

          root.classList.remove("is-typing");
          playAfterType({ autoNext, phrase, commitKey });
        };

        typeNext();
      }, 420);
    }

    function finishSequence({ autoNext, statusKey, extraClass = "", statusParams = {} }) {
      if (extraClass) root.classList.add(extraClass);
      setStatus(statusKey, statusParams);
      animating = false;
      if (autoNext) scheduleNext(3600);
    }

    function playAfterType({ autoNext, phrase, commitKey }) {
      setStatus("qsAfterSpeakStatusEnded");
      syncFlowStep(1);

      if (currentMode === "off") {
        syncAutoSendToggle(false);
        stepTimer = window.setTimeout(() => {
          if (!isPanelActive()) {
            animating = false;
            return;
          }
          root.classList.add("is-off-done");
          if (inputEl) inputEl.textContent = phrase;
          finishSequence({ autoNext, statusKey: "qsAfterSpeakStatusOffDone" });
        }, 520);
        return;
      }

      syncAutoSendToggle(true);
      animateDelay(() => {
        if (!isPanelActive()) {
          animating = false;
          return;
        }

        root.classList.add("is-sending");
        setStatus("qsAfterSpeakStatusAuto");
        syncFlowStep(3);
        actionBox?.removeAttribute("hidden");
        if (actionText) {
          actionText.textContent = qsT("qsAfterSpeakActionAuto").replace("{key}", commitKey);
        }
        syncCommitKey(commitKey);

        stepTimer = window.setTimeout(() => {
          if (!isPanelActive()) {
            animating = false;
            return;
          }
          keyEl?.classList.add("is-pulse");
          if (sendBtn) sendBtn.disabled = false;

          stepTimer = window.setTimeout(() => {
            if (!isPanelActive()) {
              animating = false;
              return;
            }
            root.classList.remove("is-sending");
            root.classList.add("is-sent");
            if (inputEl) inputEl.textContent = "";
            if (sendBtn) sendBtn.disabled = true;
            finishSequence({
              autoNext,
              statusKey: "qsAfterSpeakStatusAutoDone",
              statusParams: { key: commitKey },
            });
          }, 980);
        }, 320);
      });
    }

    function start() {
      if (!isPanelActive()) return;
      modeIndex = 0;
      commitIndex = 0;
      setMode("auto");
      play({ autoNext: true, mode: "auto" });
    }

    modeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        modeIndex = modeOrder.indexOf(btn.dataset.afterMode);
        play({ autoNext: true, mode: btn.dataset.afterMode });
      });
    });

    return { start, stop, setMode, isPanelActive };
  }

  function applyQuickstartHash() {
    const hash = location.hash.slice(1);

    if (hash === "step0") {
      setQuickstartChainHighlight(2);
      quickstartZoneCycles.zone2?.apply(2);
      document.getElementById("step0")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (hash === "step3") {
      setQuickstartChainHighlight(2);
      quickstartZoneCycles.zone2?.apply(2);
      document.getElementById("step2")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (hash === "step1") {
      quickstartZoneCycles.zone1?.apply(0);
      setQuickstartChainHighlight(0);
      document.getElementById("step1")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (hash === "step2") {
      quickstartZoneCycles.zone2?.apply(0);
      setQuickstartChainHighlight(1);
      document.getElementById("step2")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!hash) {
      quickstartZoneCycles.zone1?.apply(0);
      setQuickstartChainHighlight(0);
    }
  }

  function initQuickstartPage() {
    if (document.body.dataset.page !== "quickstart") return;

    initQuickstartImePresets();
    initQuickstartTriggerRef();
    initQuickstartScrollReveal();
    initQuickstartScrollSpy();

    const voiceBind = initQuickstartVoiceBindDemo();
    voiceBindDemo = voiceBind;
    const afterSpeak = initQuickstartAfterSpeakDemo();
    afterSpeakDemo = afterSpeak;
    const zone2Root = document.querySelector('[data-cycle-group="zone2"]');
    const keyWakePanel = zone2Root?.querySelector('[data-zone-panel="key-wake"]');
    const autoSendPanel = zone2Root?.querySelector('[data-zone-panel="auto-send"]');

    document.querySelectorAll(".qs-zone-lab[data-cycle-group]").forEach((root) => {
      const group = root.dataset.cycleGroup;
      const chainIndex = group === "zone1" ? 0 : group === "zone2" ? 1 : null;
      const cycle = initQuickstartZoneLab(root, chainIndex);
      if (cycle && group) quickstartZoneCycles[group] = cycle;
    });

    if (voiceBind && keyWakePanel) {
      const bindObserver = new MutationObserver(() => {
        if (keyWakePanel.classList.contains("is-active")) voiceBind.start();
        else voiceBind.stop();
      });
      bindObserver.observe(keyWakePanel, { attributes: true, attributeFilter: ["class"] });
      if (keyWakePanel.classList.contains("is-active")) voiceBind.start();
    }

    if (afterSpeak && autoSendPanel) {
      const afterSpeakObserver = new MutationObserver(() => {
        if (autoSendPanel.classList.contains("is-active")) afterSpeak.start();
        else afterSpeak.stop();
      });
      afterSpeakObserver.observe(autoSendPanel, { attributes: true, attributeFilter: ["class"] });
      if (autoSendPanel.classList.contains("is-active")) afterSpeak.start();
    }

    applyQuickstartHash();
    window.addEventListener("hashchange", applyQuickstartHash);

    document.addEventListener("onetone:langchange", () => {
      initQuickstartImePresets();
      initQuickstartTriggerRef();
      window.requestAnimationFrame(syncQuickstartMappingPreview);
      voiceBindDemo?.syncChipLabels();
      if (afterSpeakDemo?.isPanelActive()) afterSpeakDemo.start();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initNavActive();
    initHeroWordCycle();
    initHeroDeviceCycle();
    initFlowDemoCycle();
    initContextCycle();
    initHomeReveal();
    initHomeImeWakeDemo();
    initQuickstartPage();
  });
})();
