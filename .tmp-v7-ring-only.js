(() => {
  // patch requestAnimationFrame to be a no-op so rAF cycle stops
  const orig = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  for (let i = 0; i < 100; i++) clearInterval(i);
  for (let i = 0; i < 100; i++) clearTimeout(i);
  const els = document.querySelectorAll('.scene--extra .device');
  els.forEach((el, idx) => {
    if (idx === 0) el.classList.add('is-active');
    else el.classList.remove('is-active');
  });
  return 'ok ring-only, count=' + els.length;
})();
