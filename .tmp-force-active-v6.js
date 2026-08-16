const els = document.querySelectorAll('.device');
els.forEach((el, i) => {
  if (i === 0 || i === 3) {
    el.classList.add('is-active');
  } else {
    el.classList.remove('is-active');
  }
});
// also switch to extras scene
document.querySelectorAll('.scene').forEach(s => s.classList.remove('is-active'));
document.querySelector('[data-scene="extra"]').classList.add('is-active');
document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
document.querySelectorAll('.tab')[1].classList.add('is-active');
