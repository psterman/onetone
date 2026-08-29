(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.getElementById("sec-try-top");
    if (!root) return;

    var btn = root.querySelector(".ot-try-hold-btn");
    var output = root.querySelector(".ot-try-output");
    var fallback = root.querySelector(".ot-try-fallback");
    if (!btn || !output) return;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      btn.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }

    var rec = new SpeechRecognition();
    rec.lang = document.documentElement.lang === "en" ? "en-US" : "zh-CN";
    rec.interimResults = true;
    rec.continuous = false;
    var listening = false;

    rec.onresult = function (e) {
      var text = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      output.textContent = text;
    };

    rec.onend = function () {
      listening = false;
      btn.classList.remove("is-listening");
    };

    rec.onerror = function () {
      listening = false;
      btn.classList.remove("is-listening");
    };

    function start() {
      if (listening) return;
      listening = true;
      output.textContent = "";
      btn.classList.add("is-listening");
      try {
        rec.start();
      } catch (_) {
        listening = false;
        btn.classList.remove("is-listening");
      }
    }

    function stop() {
      if (!listening) return;
      try {
        rec.stop();
      } catch (_) {}
    }

    btn.addEventListener("mousedown", start);
    btn.addEventListener("mouseup", stop);
    btn.addEventListener("mouseleave", stop);
    btn.addEventListener("touchstart", function (e) {
      e.preventDefault();
      start();
    }, { passive: false });
    btn.addEventListener("touchend", stop);
  });
})();
