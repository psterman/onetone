(() => {
  const orig = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  for (let i = 0; i < 200; i++) { clearInterval(i); clearTimeout(i); }
  const els = document.querySelectorAll('.device');
  els.forEach((el) => el.classList.remove('is-active'));
  return 'cleared all, total=' + els.length;
})();
