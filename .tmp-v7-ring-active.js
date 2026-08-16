(() => {
  if (window._vp_raf) { cancelAnimationFrame(window._vp_raf); window._vp_raf = null; }
  for (let i = 0; i < 100; i++) clearInterval(i);
  const els = document.querySelectorAll('.device');
  els.forEach((el, idx) => {
    if (idx === 0) el.classList.add('is-active');
    else el.classList.remove('is-active');
  });
  return Array.from(els).map((el, i) => i + ':' + (el.classList.contains('is-active') ? '1' : '0')).join(' ');
})();
