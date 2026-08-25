(function () {
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

  var path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (path === "" || path === "/") path = "index.html";
  document.querySelectorAll("[data-nav]").forEach(function (el) {
    var key = el.getAttribute("data-nav");
    var map = {
      home: "index.html",
      quickstart: "quickstart.html",
      vision: "vision.html",
      agent: "agent.html",
      download: "download.html",
      faq: "faq.html",
    };
    if (map[key] === path) el.classList.add("is-active");
  });
})();
