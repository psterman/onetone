// stop any existing rAF
if (window._vp_raf) { cancelAnimationFrame(window._vp_raf); window._vp_raf = null; }
// also clear interval-based auto switcher if any
let h = setInterval(() => {}, 9999); for (let i = 0; i < 100; i++) clearInterval(i); clearInterval(h);

// set is-active on ring (data-d=0)
document.querySelectorAll('.device').forEach((el, i) => {
  if (i === 0) el.classList.add('is-active');
  else el.classList.remove('is-active');
});
