/* Dark-only site — force dark canvas before first paint. */
(function () {
  try {
    var root = document.documentElement;
    root.classList.add("dark", "theme-init");
    root.style.colorScheme = "dark";
    root.style.backgroundColor = "#000";
  } catch (_) {}
})();
