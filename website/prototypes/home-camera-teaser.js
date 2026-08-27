(function () {
  "use strict";

  var stage = document.getElementById("hct-stage");
  var codeEl = document.getElementById("hct-code");
  var descEl = document.getElementById("hct-desc");
  var dotEl = document.getElementById("hct-dot");
  var labelEl = document.getElementById("hct-label");
  var iconEl = document.getElementById("hct-icon");
  var modes = document.querySelectorAll("[data-hct-mode]");

  if (!stage) return;

  var states = [
    {
      className: "state-blink",
      icon: "ph-eye",
      label: "眨眼",
      code: "眨眼了",
      desc: "长眨眼 → 开麦说话（接到语音模式）",
      mode: "voice",
    },
    {
      className: "state-shake",
      icon: "ph-user",
      label: "摇头",
      code: "摇头了",
      desc: "左右摇头 → 取消 / 切窗（按键态联动）",
      mode: "keys",
    },
    {
      className: "state-hand",
      icon: "ph-hand-palm",
      label: "举手",
      code: "举手了",
      desc: "张开手掌 → 暂停当前动作（可控 SoftPad）",
      mode: "softpad",
    },
    {
      className: "state-away",
      icon: "",
      label: "",
      code: "人不在",
      desc: "镜头前没人了，屏幕先帮你盖上。",
      mode: null,
    },
  ];

  function setModes(mode) {
    modes.forEach(function (el) {
      el.classList.toggle("is-on", mode != null && el.getAttribute("data-hct-mode") === mode);
    });
  }

  function setIdle() {
    stage.className = "hct-stage state-idle";
    codeEl.textContent = "看着你呢";
    codeEl.classList.remove("is-live");
    descEl.textContent = "做个小动作试试看…";
    dotEl.classList.add("is-idle");
    labelEl.textContent = "SEARCHING";
    iconEl.className = "ph ph-scan hct-target";
    setModes(null);
  }

  function setCapture(state) {
    stage.className = "hct-stage " + state.className;
    codeEl.textContent = state.code;
    codeEl.classList.add("is-live");
    descEl.textContent = state.desc;
    dotEl.classList.remove("is-idle");
    if (state.className !== "state-away") {
      labelEl.textContent = state.label;
      iconEl.className = "ph " + state.icon + " hct-target";
    }
    setModes(state.mode);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function runLoop() {
    var i = 0;
    while (true) {
      setIdle();
      await sleep(2200);
      setCapture(states[i]);
      await sleep(2800);
      i = (i + 1) % states.length;
    }
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setIdle();
    descEl.textContent = "眨眼、摇头、举手都能变成快捷键（静态预览）。";
    return;
  }

  runLoop();
})();
