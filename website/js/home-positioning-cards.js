(function () {
  "use strict";

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function typeWriter(element, text, speed = 60) {
    element.textContent = "";
    for (let i = 0; i < text.length; i++) {
      element.textContent += text.charAt(i);
      await delay(speed + Math.random() * 30);
    }
  }

  async function runCard1Animation() {
    const bubble = document.getElementById("pos-c1-voice-bubble");
    const voiceText = document.getElementById("pos-c1-voice-text");
    const codeText = document.getElementById("pos-c1-code-text");
    const cursor = document.getElementById("pos-c1-cursor");
    const loading = document.getElementById("pos-c1-ai-loading");
    if (!bubble) return;

    while (true) {
      bubble.classList.remove("is-visible", "is-exit");
      voiceText.textContent = "";
      codeText.textContent = "";
      codeText.classList.remove("is-highlight");
      loading.hidden = true;
      cursor.hidden = false;

      await delay(1000);

      bubble.classList.add("is-visible");
      await typeWriter(voiceText, "加个毛玻璃按钮", 80);
      await delay(600);

      bubble.classList.remove("is-visible");
      bubble.classList.add("is-exit");
      cursor.hidden = true;
      loading.hidden = false;

      await delay(1200);

      loading.hidden = true;
      cursor.hidden = false;
      codeText.classList.add("is-highlight");
      await typeWriter(codeText, '<button class="backdrop-blur">', 30);

      await delay(2500);
    }
  }

  async function runCard2Animation() {
    const bar = document.getElementById("pos-c2-onetone-bar");
    const waveform = document.getElementById("pos-c2-waveform");
    const voiceText = document.getElementById("pos-c2-voice-text");
    const docText = document.getElementById("pos-c2-doc-text");
    const hwClick = document.getElementById("pos-c2-hardware-click");
    if (!bar) return;

    while (true) {
      bar.classList.remove("is-visible", "is-exit");
      waveform.classList.remove("is-active");
      voiceText.textContent = "";
      docText.textContent = "";
      hwClick.classList.remove("is-active", "is-pressed");

      await delay(1500);

      hwClick.classList.add("is-active", "is-pressed");
      await delay(200);
      hwClick.classList.remove("is-pressed");

      bar.classList.add("is-visible");
      waveform.classList.add("is-active");
      await typeWriter(voiceText, "整理一下今天的架构图", 60);
      waveform.classList.remove("is-active");

      await delay(500);

      bar.classList.remove("is-visible");
      bar.classList.add("is-exit");
      await typeWriter(docText, "整理一下今天的架构图", 20);

      await delay(2500);
    }
  }

  async function runCard3Animation() {
    const inputText = document.getElementById("pos-c3-input-text");
    const userMsg = document.getElementById("pos-c3-user-msg");
    const aiMsg = document.getElementById("pos-c3-ai-msg");
    const micIcon = document.getElementById("pos-c3-mic-icon");
    const sendIcon = document.getElementById("pos-c3-send-icon");
    if (!inputText) return;

    while (true) {
      inputText.textContent = "等待输入...";
      inputText.classList.remove("is-active");
      userMsg.textContent = "";
      userMsg.classList.remove("is-visible");
      aiMsg.classList.remove("is-visible");
      micIcon.classList.add("is-pulse");
      sendIcon.classList.remove("is-active");

      await delay(1000);

      inputText.classList.add("is-active");
      await typeWriter(inputText, "改成深色模式，加点边框", 50);
      micIcon.classList.remove("is-pulse");

      await delay(400);

      sendIcon.classList.add("is-active");
      await delay(200);
      inputText.textContent = "";
      sendIcon.classList.remove("is-active");

      userMsg.textContent = "改成深色模式，加点边框";
      userMsg.classList.add("is-visible");

      await delay(800);

      aiMsg.classList.add("is-visible");

      await delay(3000);
    }
  }

  async function runCard4Animation() {
    const genLine = document.getElementById("pos-c4-generating-line");
    const stopOverlay = document.getElementById("pos-c4-stop-overlay");
    const cameraPip = document.getElementById("pos-c4-camera-pip");
    const boundingBox = document.getElementById("pos-c4-bounding-box");
    const gestureIcon = document.getElementById("pos-c4-gesture-icon");
    const actionBadge = document.getElementById("pos-c4-action-badge");
    const aiStatusIcon = document.getElementById("pos-c4-ai-status-icon");
    const aiStatusText = document.getElementById("pos-c4-ai-status-text");
    const statusWrap = aiStatusText?.parentElement;
    if (!genLine) return;

    while (true) {
      genLine.style.transition = "none";
      genLine.style.width = "0%";

      stopOverlay.classList.remove("is-visible");
      cameraPip.classList.remove("is-alert");
      boundingBox.classList.remove("is-detected");
      gestureIcon.className = "ph-fill ph-user";
      actionBadge.classList.remove("is-visible");

      aiStatusText.textContent = "AI 正在生成深度报告...";
      statusWrap?.classList.remove("is-stopped");
      aiStatusIcon.className = "ph-bold ph-robot is-pulse";

      void genLine.offsetWidth;

      await delay(500);

      genLine.style.transition = "width 3s linear";
      genLine.style.width = "100%";

      await delay(1200);

      gestureIcon.className = "ph-fill ph-hand-palm is-stop";
      boundingBox.classList.add("is-detected");
      cameraPip.classList.add("is-alert");
      actionBadge.classList.add("is-visible");

      await delay(200);

      const currentWidth = window.getComputedStyle(genLine).width;
      genLine.style.transition = "none";
      genLine.style.width = currentWidth;

      stopOverlay.classList.add("is-visible");
      aiStatusIcon.className = "ph-bold ph-prohibit";
      aiStatusText.textContent = "生成已被体态打断";
      statusWrap?.classList.add("is-stopped");

      await delay(3000);
    }
  }

  function init() {
    if (!document.getElementById("sec-positioning")) return;
    runCard1Animation();
    runCard2Animation();
    runCard3Animation();
    runCard4Animation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
