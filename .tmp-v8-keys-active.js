(() => {
  const orig = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  for (let i = 0; i < 200; i++) { clearInterval(i); clearTimeout(i); }
  const els = document.querySelectorAll('.scene--extra .device');
  els.forEach((el, idx) => {
    if (idx === 0) el.classList.add('is-active');
    else el.classList.remove('is-active');
  });
  return 'idx0 active, count=' + els.length;
})();
