(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function openAndScroll(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    const details = el.closest("details");
    if (details) details.open = true;
    el.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
  }

  function initHashOpen() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    openAndScroll(hash);
  }

  function setActiveById(id) {
    qsa("[data-docs-nav]").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("data-docs-nav") === id);
    });
    qsa("[data-toc]").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("data-toc") === id);
    });
  }

  function initScrollSpy() {
    const sections = qsa(".faq-docs-main [id^='sec-']");
    if (!sections.length || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        setActiveById(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] }
    );

    sections.forEach((s) => observer.observe(s));
  }

  function collectSearchIndex() {
    return qsa(".faq-item").map((item) => {
      const summary = item.querySelector("summary span")?.textContent?.trim() || "";
      const body = item.querySelector(".faq-body")?.textContent?.trim() || "";
      return { id: item.id, title: summary, body, el: item };
    });
  }

  function filterItems(query) {
    const q = query.trim().toLowerCase();
    const index = collectSearchIndex();
    if (!q) {
      index.forEach(({ el }) => el.classList.remove("is-search-hidden"));
      return index;
    }
    const hits = [];
    index.forEach((entry) => {
      const match =
        entry.title.toLowerCase().includes(q) || entry.body.toLowerCase().includes(q);
      entry.el.classList.toggle("is-search-hidden", !match);
      if (match) hits.push(entry);
    });
    return hits;
  }

  function renderModalResults(hits, query) {
    const host = document.getElementById("faq-search-results");
    if (!host) return;

    if (!query.trim()) {
      host.innerHTML =
        '<div class="faq-search-results-label">快捷跳转</div>' +
        [
          { id: "no-response", title: "按了没反应" },
          { id: "ime-not-wake", title: "输入法没唤醒" },
          { id: "record-failed", title: "录键失败" },
          { id: "error-messages", title: "软件提示对照" },
        ]
          .map(
            (item) =>
              `<a class="faq-search-hit" href="#${item.id}" data-faq-hit="${item.id}"><span><i class="ph ph-file-text"></i>${item.title}</span><i class="ph ph-arrow-u-down-left"></i></a>`
          )
          .join("");
      return;
    }

    if (!hits.length) {
      host.innerHTML = '<p class="faq-search-empty">没有匹配的条目，试试别的关键词。</p>';
      return;
    }

    host.innerHTML =
      '<div class="faq-search-results-label">搜索结果</div>' +
      hits
        .slice(0, 12)
        .map(
          (h) =>
            `<a class="faq-search-hit" href="#${h.id}" data-faq-hit="${h.id}"><span><i class="ph ph-magnifying-glass"></i>${h.title}</span><i class="ph ph-arrow-u-down-left"></i></a>`
        )
        .join("");
  }

  function initSearch() {
    const mainInput = document.getElementById("faq-main-search");
    const modal = document.getElementById("faq-search-modal");
    const modalInput = document.getElementById("faq-modal-search");
    const results = document.getElementById("faq-search-results");

    function openModal(prefill) {
      if (!modal) return;
      modal.hidden = false;
      modal.classList.add("is-open");
      if (modalInput) {
        modalInput.value = prefill || "";
        renderModalResults(filterItems(modalInput.value), modalInput.value);
        window.requestAnimationFrame(() => modalInput.focus());
      }
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove("is-open");
      modal.hidden = true;
    }

    if (mainInput) {
      mainInput.addEventListener("input", () => {
        filterItems(mainInput.value);
      });
      mainInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const hits = filterItems(mainInput.value);
          if (hits[0]) openAndScroll(hits[0].id);
        }
      });
      mainInput.addEventListener("focus", () => {
        if (window.innerWidth >= 768) openModal(mainInput.value);
      });
    }

    document.addEventListener("keydown", (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (modal?.classList.contains("is-open")) closeModal();
        else openModal(mainInput?.value || "");
      }
      if (e.key === "Escape" && modal?.classList.contains("is-open")) {
        e.preventDefault();
        closeModal();
      }
    });

    modal?.querySelector("[data-faq-close-modal]")?.addEventListener("click", closeModal);

    modalInput?.addEventListener("input", () => {
      renderModalResults(filterItems(modalInput.value), modalInput.value);
    });

    modalInput?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const hits = filterItems(modalInput.value);
      if (!hits[0]) return;
      closeModal();
      openAndScroll(hits[0].id);
    });

    results?.addEventListener("click", (e) => {
      const hit = e.target.closest("[data-faq-hit]");
      if (!hit) return;
      e.preventDefault();
      closeModal();
      openAndScroll(hit.getAttribute("data-faq-hit"));
    });

    renderModalResults([], "");
  }

  function initCards() {
    qsa("[data-faq-card]").forEach((card) => {
      card.addEventListener("click", (e) => {
        const href = card.getAttribute("href");
        if (!href || !href.startsWith("#")) return;
        e.preventDefault();
        const id = href.slice(1);
        history.replaceState(null, "", href);
        openAndScroll(id);
        setActiveById(id);
      });
    });
  }

  function initHeroMotion() {
    if (reduceMotion.matches) return;

    const hero = document.getElementById("faq-hero");
    const cardsStage = document.getElementById("faq-cards-stage");
    const lexicon = document.querySelector(".faq-lexicon");
    const orbit = document.getElementById("faq-data-orbit");
    const searchInput = document.getElementById("faq-main-search");
    const cards = qsa("[data-tilt]");

    cards.forEach((card) => {
      card.addEventListener("mouseenter", () => {
        card.style.transition =
          "transform 0.1s ease-out, background 0.1s ease-out, border-color 0.4s ease, box-shadow 0.4s ease";
      });

      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const rotateX = ((y - rect.height / 2) / (rect.height / 2)) * -12;
        const rotateY = ((x - rect.width / 2) / (rect.width / 2)) * 12;
        card.style.animation = "none";
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        card.style.background = `radial-gradient(circle at ${(x / rect.width) * 100}% ${(y / rect.height) * 100}%, rgba(var(--mac-accent-rgb), 0.08) 0%, rgba(10, 18, 25, 0.7) 60%)`;
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform =
          "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
        card.style.background = "rgba(10, 18, 25, 0.7)";
        window.setTimeout(() => {
          card.style.removeProperty("animation");
          card.style.removeProperty("transform");
          card.style.removeProperty("background");
          card.style.removeProperty("transition");
        }, 300);
      });
    });

    if (hero && cardsStage && lexicon) {
      hero.addEventListener("mousemove", (e) => {
        const x = e.clientX - window.innerWidth / 2;
        const y = e.clientY - window.innerHeight / 2;
        cardsStage.style.transform = `translate(${-x * 0.015}px, ${-y * 0.015}px)`;
        lexicon.style.transform = `translate(calc(-50% + ${x * 0.03}px), calc(-50% + ${y * 0.03}px))`;
      });
      hero.addEventListener("mouseleave", () => {
        cardsStage.style.transform = "translate(0, 0)";
        lexicon.style.transform = "translate(-50%, -50%)";
      });
    }

    if (searchInput && orbit) {
      searchInput.addEventListener("input", () => {
        orbit.classList.toggle("is-fast", searchInput.value.trim().length > 0);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initHashOpen();
    initScrollSpy();
    initSearch();
    initCards();
    initHeroMotion();
    window.addEventListener("hashchange", initHashOpen);
  });
})();
