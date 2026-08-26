(() => {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));

  function initOneToneVoiceCard() {
    const root = document.getElementById("qs-voice-command");
    if (!root) return null;

    const msgsEl = root.querySelector("[data-ot-msgs]");
    const emptyEl = root.querySelector("[data-ot-empty]");
    const inputEl = root.querySelector("[data-ot-input]");
    const inputWrap = root.querySelector("[data-ot-input-wrap]");
    const pill = root.querySelector("[data-ot-pill]");
    const voiceEl = root.querySelector("[data-ot-voice]");
    const mic = root.querySelector("[data-ot-mic]");
    const waves = root.querySelector("[data-ot-waves]");
    const micIcon = root.querySelector("[data-ot-mic-icon]");
    const intentEl = root.querySelector("[data-ot-intent]");
    const intentLabel = root.querySelector("[data-ot-intent-label]");
    const agentBtns = Array.from(root.querySelectorAll("[data-ot-agent]"));

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let running = false;
    let seqToken = 0;
    let agentTimer = 0;
    let agentIndex = 0;
    let inView = false;
    let modeVoice = false;

    function setMessages(list) {
      const items = list || [];
      if (!items.length) {
        msgsEl.hidden = true;
        msgsEl.innerHTML = "";
        emptyEl.hidden = false;
        return;
      }
      emptyEl.hidden = true;
      msgsEl.hidden = false;
      msgsEl.innerHTML = items
        .map((msg) => {
          if (msg.html) {
            return `<div class="ot-vc-msg is-${msg.role}"><div class="ot-vc-bubble">${msg.html}</div></div>`;
          }
          return `<div class="ot-vc-msg is-${msg.role}"><div class="ot-vc-bubble">${escapeHtml(msg.content)}</div></div>`;
        })
        .join("");
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function setInput(value) {
      const v = value || "";
      if (!v) {
        inputEl.innerHTML = '<span class="ot-vc-ph">问点什么...</span>';
        inputWrap.classList.remove("is-filled");
      } else {
        inputEl.textContent = v;
        inputWrap.classList.add("is-filled");
      }
    }

    function getIntent(text) {
      if (text.includes("发送")) return { label: "回车发送", kind: "send" };
      if (text.includes("继续")) return { label: "执行继续", kind: "continue" };
      if (text.includes("新建") || text.includes("取消")) return { label: "重置对话", kind: "reset" };
      return null;
    }

    function setVoice(text, listening) {
      const t = text || "";
      voiceEl.textContent = t || (listening ? "正在聆听..." : "");
      const show = listening || t !== "";
      pill.classList.toggle("is-on", show);
      mic.classList.toggle("is-listening", !!listening);
      waves.hidden = !listening;
      micIcon.hidden = !!listening;

      const badge = getIntent(t);
      if (badge) {
        intentEl.hidden = false;
        intentEl.dataset.kind = badge.kind;
        intentLabel.textContent = badge.label;
      } else {
        intentEl.hidden = true;
        intentLabel.textContent = "";
      }
    }

    function bumpWake(name) {
      const chip = root.querySelector("[data-ot-wake]");
      const text = root.querySelector("[data-ot-wake-text]");
      if (text) text.textContent = `"唤醒 ${name}"`;
      if (chip) chip.replaceWith(chip.cloneNode(true));
    }

    function setAgentFixed(index) {
      agentIndex = ((index % agentBtns.length) + agentBtns.length) % agentBtns.length;
      agentBtns.forEach((el, i) => el.classList.toggle("is-active", i === agentIndex));
      const name = agentBtns[agentIndex]?.dataset.agentName || "Cursor";
      bumpWake(name);
    }

    async function typeText(token, text, speed) {
      setVoice("", true);
      for (let i = 0; i <= text.length; i++) {
        if (token !== seqToken || !running) return;
        setVoice(text.slice(0, i), true);
        await delay(speed);
      }
    }

    async function runSequence(token) {
      while (running && token === seqToken) {
        setMessages([]);
        setInput("");
        setVoice("", false);
        await delay(1500);
        if (!running || token !== seqToken) break;

        await typeText(token, "帮我写一个快速排序，发送", 60);
        if (!running || token !== seqToken) break;
        await delay(300);
        if (!running || token !== seqToken) break;

        setVoice("已触发发送...", false);
        setInput("帮我写一个快速排序");
        await delay(600);
        if (!running || token !== seqToken) break;

        setInput("");
        setVoice("", false);
        setMessages([{ role: "user", content: "帮我写一个快速排序算法" }]);
        await delay(600);
        if (!running || token !== seqToken) break;

        setMessages([
          { role: "user", content: "帮我写一个快速排序算法" },
          { role: "ai", content: "好的，正在为您生成快速排序的实现代码..." },
        ]);
        await delay(2500);
        if (!running || token !== seqToken) break;

        await typeText(token, "代码太长断了，继续", 80);
        if (!running || token !== seqToken) break;
        await delay(300);
        if (!running || token !== seqToken) break;

        setVoice('正在执行 "继续"', false);
        await delay(600);
        if (!running || token !== seqToken) break;

        setVoice("", false);
        setMessages([
          { role: "user", content: "帮我写一个快速排序算法" },
          { role: "ai", content: "好的，正在为您生成快速排序的实现代码..." },
          {
            role: "ai",
            html:
              '<div style="display:flex;flex-direction:column;gap:0.5rem"><span>接着输出后续逻辑：</span><div class="ot-vc-code">if (arr.length &lt;= 1) return arr;<br>const pivot = arr[arr.length - 1];<br>// ...后续实现</div></div>',
          },
        ]);
        await delay(3000);
        if (!running || token !== seqToken) break;

        await typeText(token, "算了，新建对话", 80);
        if (!running || token !== seqToken) break;
        await delay(300);
        if (!running || token !== seqToken) break;

        setVoice('正在执行 "新建"', false);
        await delay(600);
        if (!running || token !== seqToken) break;

        setVoice("", false);
        setMessages([]);
        await delay(1000);
      }
    }

    function startAgentCycle() {
      stopAgentCycle();
      if (reduceMotion.matches) return;
      agentTimer = window.setInterval(() => {
        setAgentFixed(agentIndex + 1);
      }, 3500);
    }

    function stopAgentCycle() {
      if (agentTimer) {
        window.clearInterval(agentTimer);
        agentTimer = 0;
      }
    }

    function shouldRun() {
      return modeVoice && inView && !root.hidden && !reduceMotion.matches;
    }

    function sync() {
      if (shouldRun()) start();
      else stop();
    }

    function start() {
      if (running) return;
      if (reduceMotion.matches) {
        setAgentFixed(0);
        setMessages([]);
        setInput("");
        setVoice("", false);
        return;
      }
      running = true;
      seqToken += 1;
      const token = seqToken;
      startAgentCycle();
      runSequence(token);
    }

    function stop() {
      running = false;
      seqToken += 1;
      stopAgentCycle();
      setMessages([]);
      setInput("");
      setVoice("", false);
    }

    function setMode(voice) {
      modeVoice = !!voice;
      root.hidden = !modeVoice;
      sync();
    }

    agentBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.otAgent) || 0;
        setAgentFixed(idx);
        if (running) startAgentCycle();
      });
    });

    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          inView = entries.some((e) => e.isIntersecting);
          sync();
        },
        { threshold: 0.2 }
      );
      obs.observe(root);
    } else {
      inView = true;
    }

    window.addEventListener("qs-hero-mode", (e) => {
      setMode(e.detail?.mode === "voice");
    });

    // initial from hero dataset (applyQuickstartHash may run after)
    const hero = document.getElementById("qs-hero");
    setMode(hero?.dataset.mode === "voice");

    return { start, stop, setMode, sync };
  }

  window.OneToneVoiceCard = { init: initOneToneVoiceCard };

  document.addEventListener("DOMContentLoaded", () => {
    window.OneToneVoiceCard.instance = initOneToneVoiceCard();
  });
})();
