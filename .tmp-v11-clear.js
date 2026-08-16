(() => {
  window.requestAnimationFrame = () => 0;
  for (let i = 0; i < 200; i++) { clearInterval(i); clearTimeout(i); }
  document.querySelectorAll('.device').forEach((el) => el.classList.remove('is-active'));
})();
