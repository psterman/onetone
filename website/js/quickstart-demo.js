(function () {
  "use strict";

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

  const QS_IME_PRESETS = [
    { id: "typeless", nameKey: "imePresetTypeless", badge: "Ty", badgeEn: "Ty", targetKey: "RAlt", icon: "assets/icons/ime/typeless.png" },
    { id: "zhipu", nameKey: "imePresetZhipu", badge: "智", badgeEn: "Zp", targetKey: "RAlt", icon: "assets/icons/ime/zhipu.png" },
    { id: "qianwen", nameKey: "imePresetQianwen", badge: "千", badgeEn: "Qw", targetKey: "RAlt", icon: "assets/icons/ime/qianwen.png" },
    { id: "shandianshuo", nameKey: "imePresetShandianshuo", badge: "闪", badgeEn: "Li", targetKey: "RAlt", icon: "assets/icons/ime/shandianshuo.jpg" },
    { id: "sogou", nameKey: "imePresetSogou", badge: "搜", badgeEn: "Sg", targetKey: "Ctrl+Space", icon: "assets/icons/ime/sougou.png" },
    { id: "xunfei", nameKey: "imePresetXunfei", badge: "讯", badgeEn: "Xf", targetKey: "F2", icon: "assets/icons/ime/xunfei.png" },
  ];

  const QS_TRIGGER_FALLBACK = {
    zh: {
      mouse: "鼠标侧键",
      volume: "按键",
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
        return `<button type="button" class="qs-ime-preset${index === 0 ? " is-active" : ""}" data-ime-id="${preset.id}" data-target-key="${preset.targetKey}" data-ime-icon="${preset.icon}" aria-pressed="${index === 0 ? "true" : "false"}"><img class="qs-ime-logo" src="${preset.icon}" alt="" width="24" height="24" decoding="async"><span>${label}</span></button>`;
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

  function initQsHero() {
    const canvas = document.getElementById("neural-canvas");
    const wrapper = document.getElementById("qs-hero");
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let particles = [];
    const particleCount = 45;
    const mouse = { x: -1000, y: -1000, radius: 150 };
    let isHovering = false;
    let activeSignal = null;

    const hubEl = document.getElementById("hn-hub");
    const hubIcon = document.getElementById("hn-hub-icon");
    const stDot = document.getElementById("st-dot");
    const stCode = document.getElementById("st-code");
    const stDesc = document.getElementById("st-desc");
    const stText = document.getElementById("st-text");
    const stCursor = document.getElementById("st-cursor");
    if (!hubEl || !hubIcon || !stDot || !stCode || !stDesc || !stText || !stCursor) return;

    const peripherals = [
      document.getElementById("rn-kb"),
      document.getElementById("rn-mouse"),
      document.getElementById("rn-gamepad"),
      document.getElementById("rn-ring"),
      document.getElementById("rn-trackball"),
    ].filter(Boolean);

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.6;
        this.vy = (Math.random() - 0.5) * 0.6;
        this.baseRadius = Math.random() * 1.5 + 0.5;
      }
      update() {
        if (isHovering) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            const angle = Math.atan2(dy, dx);
            this.vx -= Math.cos(angle) * force * 0.08;
            this.vy -= Math.sin(angle) * force * 0.08;
          }
        }
        this.vx *= 0.98;
        this.vy *= 0.98;
        if (Math.abs(this.vx) < 0.2) this.vx += (Math.random() - 0.5) * 0.1;
        if (Math.abs(this.vy) < 0.2) this.vy += (Math.random() - 0.5) * 0.1;
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
      }
      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fill();
      }
    }

    function getElCenter(el) {
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const wrapRect = wrapper.getBoundingClientRect();
      return {
        x: rect.left - wrapRect.left + rect.width / 2,
        y: rect.top - wrapRect.top + rect.height / 2,
      };
    }

    function drawNetwork() {
      ctx.clearRect(0, 0, width, height);
      const centerPos = getElCenter(hubEl);
      const periPositions = peripherals
        .filter((el) => window.getComputedStyle(el).display !== "none")
        .map(getElCenter);

      particles.forEach((p, index) => {
        p.update();
        p.draw();
        for (let j = index + 1; j < particles.length; j += 1) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 - (dist / 120) * 0.1})`;
            ctx.stroke();
          }
        }
      });

      ctx.setLineDash([4, 4]);
      periPositions.forEach((pos) => {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(centerPos.x, centerPos.y);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.setLineDash([]);

      if (activeSignal) {
        const sx = activeSignal.startX + (activeSignal.endX - activeSignal.startX) * activeSignal.progress;
        const sy = activeSignal.startY + (activeSignal.endY - activeSignal.startY) * activeSignal.progress;

        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(activeSignal.startX, activeSignal.startY);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = "rgba(245, 158, 11, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();

        if (Math.random() > 0.5) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + (Math.random() - 0.5) * 20, sy + (Math.random() - 0.5) * 20);
          ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        activeSignal.progress += 0.04;
        if (activeSignal.progress >= 1) {
          activeSignal.onArrive();
          activeSignal = null;
        }
      }

      window.requestAnimationFrame(drawNetwork);
    }

    const scenarios = [
      { el: document.getElementById("rn-kb"), code: "INT.KEYBOARD_HOOK", desc: "捕获系统级键盘钩子，ALT+Space，激活听写...", text: "「帮我生成一段测试代码」", icon: "ph-code" },
      { el: document.getElementById("rn-mouse"), code: "INT.MOUSE_EVENT", desc: "拦截到鼠标侧键 XButton1 电平跳变，激活听写...", text: "「这个方案我觉得可以」", icon: "ph-check-circle" },
      { el: document.getElementById("rn-gamepad"), code: "INT.XINPUT_POLL", desc: "读取到手柄 RT 扳机键阈值溢出，激活听写...", text: "「上路 Miss，请求支援！」", icon: "ph-sword" },
      { el: document.getElementById("rn-ring"), code: "INT.BLE_GATT", desc: "接收到蓝牙低功耗外设特征值，激活听写...", text: "「稍等，我马上看。」", icon: "ph-chat-teardrop" },
    ];

    function wait(ms) {
      return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function playStoryLoop() {
      let sIdx = 0;
      while (true) {
        scenarios.forEach((s) => s.el?.classList.remove("is-active"));
        hubEl.classList.remove("is-listening");
        hubIcon.className = "ph-fill ph-microphone";
        stDot.classList.remove("active");
        stCode.classList.remove("active");
        stCode.textContent = "SYS.IDLE";
        stDesc.textContent = "控制台中枢待机中，监控硬件总线信号...";
        stText.textContent = "";
        stCursor.classList.add("blinking");

        await wait(reduceMotion.matches ? 800 : 2000);

        const current = scenarios[sIdx];
        if (current.el && window.getComputedStyle(current.el).display !== "none") {
          current.el.classList.add("is-active");
          stCode.textContent = current.code;
          stCode.classList.add("active");
          stDesc.textContent = "总线中断！捕获按键信号...";
          await wait(400);

          const startPos = getElCenter(current.el);
          const endPos = getElCenter(hubEl);
          if (reduceMotion.matches) {
            activeSignal = null;
          } else {
            await new Promise((resolve) => {
              activeSignal = {
                startX: startPos.x,
                startY: startPos.y,
                endX: endPos.x,
                endY: endPos.y,
                progress: 0,
                onArrive: resolve,
              };
            });
          }

          current.el.classList.remove("is-active");
          hubEl.classList.add("is-listening");
          stDot.classList.add("active");
          stDesc.textContent = current.desc;
          stCursor.classList.remove("blinking");

          if (reduceMotion.matches) {
            stText.textContent = current.text;
          } else {
            for (let i = 0; i < current.text.length; i += 1) {
              stText.textContent += current.text[i];
              await wait(Math.random() * 40 + 60);
            }
          }
          stCursor.classList.add("blinking");
          await wait(600);

          hubEl.classList.remove("is-listening");
          hubIcon.className = `ph-fill ${current.icon}`;
          stDesc.textContent = "数据包封装完毕，已自动投递至目标窗口。";
          await wait(reduceMotion.matches ? 1200 : 3000);
        }

        sIdx = (sIdx + 1) % scenarios.length;
      }
    }

    resize();
    window.addEventListener("resize", resize);
    wrapper.addEventListener("mousemove", (e) => {
      const rect = wrapper.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      isHovering = true;
    });
    wrapper.addEventListener("mouseleave", () => {
      isHovering = false;
      mouse.x = -1000;
      mouse.y = -1000;
    });

    for (let i = 0; i < particleCount; i += 1) particles.push(new Particle());
    drawNetwork();
    playStoryLoop();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initQsHero();
    initQuickstartPage();
  });
})();
