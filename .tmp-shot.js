var devs = document.querySelectorAll('.device');
for (var i = 0; i < devs.length; i++) devs[i].classList.remove('is-active');
devs[0].classList.add('is-active');
devs[3].classList.add('is-active');
