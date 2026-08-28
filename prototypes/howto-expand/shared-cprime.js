(function (global) {
  'use strict';

  var P = global.HowtoExpandProto;
  if (!P) return;

  function reducedMotion() {
    return (
      global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function flipDetailColumn(anchor, newCol, done) {
    if (!anchor) {
      if (done) done();
      return;
    }
    if (reducedMotion()) {
      anchor.style.gridColumn = String(newCol);
      anchor.setAttribute('data-col', String(newCol));
      if (done) done();
      return;
    }
    var first = anchor.getBoundingClientRect();
    anchor.style.gridColumn = String(newCol);
    anchor.setAttribute('data-col', String(newCol));
    var last = anchor.getBoundingClientRect();
    var dx = first.left - last.left;
    if (Math.abs(dx) < 2) {
      if (done) done();
      return;
    }
    anchor.classList.add('is-sliding');
    anchor.style.transform = 'translateX(' + dx + 'px)';
    anchor.style.transition = 'none';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        anchor.style.transition = 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)';
        anchor.style.transform = '';
        global.setTimeout(function () {
          anchor.classList.remove('is-sliding');
          anchor.style.transition = '';
          if (done) done();
        }, 340);
      });
    });
  }

  function swapDetailContent(panel, card) {
    if (!panel) return;
    var slot = panel.closest('.howto-detail-slot');
    if (slot) slot.classList.add('is-fading');
    global.setTimeout(function () {
      panel.innerHTML = P.detailBodyHtml(card, { animate: true });
      if (slot) {
        slot.classList.remove('is-fading');
        void panel.offsetWidth;
      }
    }, 120);
  }

  function anchoredDetailHtml(card, open) {
    var col = P.colForCardId(card.id);
    return (
      '<div class="howto-detail-anchor" id="howtoDetailAnchor" style="grid-column:' +
      col +
      '" data-col="' +
      col +
      '">' +
      '<div class="howto-detail-slot' +
      (open ? ' is-open' : '') +
      '" id="howtoDetailSlot">' +
      '<div class="howto-detail-inner">' +
      '<div class="howto-detail-panel" id="howtoDetailPanel">' +
      P.detailBodyHtml(card, { animate: open }) +
      '</div></div></div></div>'
    );
  }

  function boot(opts) {
    opts = opts || {};
    var root = document.getElementById(opts.rootId || 'workbench');
    var stage = document.getElementById(opts.stageId || 'howtoStage');
    if (!root || !stage) return;

    var activeId = 'voice';
    var openId = '';

    root.insertAdjacentHTML('afterbegin', P.renderScopeTop() + P.renderHero(activeId));

    function paintCards() {
      stage.innerHTML = P.CARDS.map(function (card, i) {
        return P.summaryCardHtml(card, {
          activeId: activeId,
          selected: openId === card.id,
          col: i + 1,
        });
      }).join('');
      if (openId) {
        stage.insertAdjacentHTML(
          'beforeend',
          anchoredDetailHtml(P.cardById(openId), true)
        );
      }
    }

    function onCardClick(id) {
      var col = P.colForCardId(id);
      var anchor = document.getElementById('howtoDetailAnchor');
      var panel = document.getElementById('howtoDetailPanel');

      if (openId === id) {
        openId = '';
        activeId = id;
        P.setHeroMode(id);
        paintCards();
        return;
      }

      if (openId && openId !== id && anchor && panel) {
        activeId = id;
        P.setHeroMode(id);
        stage.querySelectorAll('.howto-card').forEach(function (c) {
          var cid = c.getAttribute('data-card');
          c.classList.toggle('is-selected', cid === id);
          c.classList.toggle('is-active', cid === id);
        });
        flipDetailColumn(anchor, col, function () {
          swapDetailContent(panel, P.cardById(id));
        });
        openId = id;
        return;
      }

      activeId = id;
      openId = id;
      P.setHeroMode(id);
      paintCards();
    }

    paintCards();
    P.bindStackTips(root);
    P.stopEditClick(root);

    root.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('[data-card]');
      if (!card) return;
      onCardClick(card.getAttribute('data-card'));
    });

    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest && e.target.closest('[data-card]');
      if (!card) return;
      e.preventDefault();
      onCardClick(card.getAttribute('data-card'));
    });
  }

  global.HowtoExpandCPrime = {
    boot: boot,
    flipDetailColumn: flipDetailColumn,
    anchoredDetailHtml: anchoredDetailHtml,
  };
})(window);
