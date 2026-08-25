/* Dark-only site — force dark class before first paint. */
(function () {
  try {
    var root = document.documentElement;
    root.classList.add("dark");
    root.style.colorScheme = "dark";
    root.classList.add("theme-init");
  } catch (_) {}
})();
