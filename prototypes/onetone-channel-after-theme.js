/** Shared theme switch for channel after-habit prototypes. */
(function () {
  var KEY = 'ot_channel_after_theme';
  var root = document.documentElement;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          return {
            theme: o.theme === 'dark' ? 'dark' : 'light',
            style: o.style === 'graphite' ? 'graphite' : 'blue'
          };
        }
      }
    } catch (_) {}
    var prefersDark = false;
    try {
      prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {}
    return { theme: prefersDark ? 'dark' : 'light', style: 'blue' };
  }

  function apply(state) {
    root.setAttribute('data-theme', state.theme);
    root.setAttribute('data-style', state.style);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {}
    document.querySelectorAll('[data-theme-pick]').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-theme-pick') === state.theme);
    });
    document.querySelectorAll('[data-style-pick]').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-style-pick') === state.style);
    });
  }

  function bind() {
    document.querySelectorAll('[data-theme-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cur = read();
        cur.theme = btn.getAttribute('data-theme-pick') === 'dark' ? 'dark' : 'light';
        apply(cur);
      });
    });
    document.querySelectorAll('[data-style-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cur = read();
        cur.style = btn.getAttribute('data-style-pick') === 'graphite' ? 'graphite' : 'blue';
        apply(cur);
      });
    });
  }

  var state = read();
  apply(state);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.OneToneChannelAfterTheme = { read: read, apply: apply };
})();
