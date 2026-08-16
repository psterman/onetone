(() => {
  if (window._vp_raf) { cancelAnimationFrame(window._vp_raf); window._vp_raf = null; }
  for (let i = 0; i < 100; i++) clearInterval(i);
  document.querySelectorAll('.device').forEach((el, idx) => {
    if (idx === 3) el.classList.add('is-active');
    else el.classList.remove('is-active');
  });
})();
