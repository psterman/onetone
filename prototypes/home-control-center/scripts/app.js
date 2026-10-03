(function () {
  const variants = window.HomePrototypeVariants;
  const fixtures = window.HomePrototypeFixtures;
  const store = window.HomePrototypeEvaluation.createStore(window.localStorage);
  const stage = document.getElementById('stage');
  const picker = document.querySelector('.proto-picker');
  const highlight = picker.querySelector('.proto-picker-highlight');
  const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
  const replay = picker.querySelector('.proto-picker-replay');
  const stateNav = document.querySelector('[data-state-nav]');
  const panel = document.querySelector('[data-evaluation-panel]');
  const feedback = document.querySelector('[data-prototype-feedback]');
  let current = Math.min(Math.max((parseInt(new URLSearchParams(location.search).get('v'), 10) || 1) - 1, 0), variants.length - 1);
  let stateId = location.hash.replace('#', '') || 'idle';
  if (!fixtures.stateIds.includes(stateId)) stateId = 'idle';

  stateNav.innerHTML = fixtures.stateIds.map((id) => `<button data-state="${id}">${fixtures.labels[id]}</button>`).join('');
  function moveHighlight() { const el = items[current]; highlight.style.width = `${el.offsetWidth}px`; highlight.style.transform = `translateX(${el.offsetLeft}px)`; }
  function mount() {
    const snapshot = fixtures.getSnapshot(stateId);
    stage.innerHTML = variants[current].render(snapshot);
    stage.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => act(button.dataset.action, button.textContent.trim())));
    items.forEach((el, i) => { el.toggleAttribute('data-active', i === current); i === current ? el.setAttribute('aria-current', 'true') : el.removeAttribute('aria-current'); });
    stateNav.querySelectorAll('button').forEach((el) => { el.toggleAttribute('data-active', el.dataset.state === stateId); el.setAttribute('aria-pressed', String(el.dataset.state === stateId)); });
    moveHighlight(); renderPanel();
  }
  function setActive(i) {
    if (i < 0 || i >= variants.length) return;
    current = i;
    const url = new URL(location); url.searchParams.set('v', i + 1); url.hash = stateId; history.replaceState(null, '', url);
    mount();
  }
  function setState(id) { stateId = id; const url = new URL(location); url.hash = id; history.replaceState(null, '', url); mount(); }
  function act(id, label) {
    if (id === 'speak') setState('listening');
    else if (id === 'finish' || id === 'type' || id === 'new-task') setState('running');
    else if (id === 'cancel' || id === 'stop' || id === 'later') setState('idle');
    else if (id === 'decide') setState('idle');
    feedback.textContent = `${label || id} · 已在原型中执行`;
    feedback.classList.add('show'); window.setTimeout(() => feedback.classList.remove('show'), 1800);
  }
  function renderPanel() {
    const variant = variants[current]; const saved = store.load()[variant.id] || { scores: {}, notes: '' };
    const criteria = [['beginner','小白易懂'],['launch','发起效率'],['control','控制中心'],['visibility','状态可见'],['scale','扩展能力'],['identity','一声独特性']];
    panel.innerHTML = `<button class="panel-close" data-close-panel aria-label="关闭">×</button><small>方案说明</small><h2>${variant.label}</h2><p>${variant.axis}</p><dl><dt>优势</dt><dd>${variant.strengths}</dd><dt>代价</dt><dd>${variant.cost}</dd><dt>可融合</dt><dd>${variant.fusion}</dd></dl><h3>你的评分</h3>${criteria.map(([key,label]) => `<label class="score-row"><span>${label}</span><input type="range" min="1" max="5" value="${saved.scores[key] || 3}" data-score="${key}"><output>${saved.scores[key] || 3}</output></label>`).join('')}<label class="notes-label">评审备注<textarea data-notes placeholder="值得保留什么？应该舍弃什么？">${saved.notes || ''}</textarea></label>`;
    panel.querySelector('[data-close-panel]').onclick = () => { panel.hidden = true; };
    panel.querySelectorAll('[data-score]').forEach((input) => input.addEventListener('input', () => { input.nextElementSibling.value = input.value; saveEvaluation(); }));
    panel.querySelector('[data-notes]').addEventListener('input', saveEvaluation);
  }
  function saveEvaluation() {
    const scores = {}; panel.querySelectorAll('[data-score]').forEach((i) => { scores[i.dataset.score] = Number(i.value); });
    store.saveVariant(variants[current].id, { scores, notes: panel.querySelector('[data-notes]').value, fusion: variants[current].fusion });
  }
  function showSummary() {
    const rows = variants.map((v) => { const data = store.load()[v.id]; const score = data ? Object.values(data.scores || {}).reduce((a,b) => a+b, 0) : 0; return `<tr><td>${v.label}</td><td>${score || '未评分'}</td><td>${data?.notes || '—'}</td><td>${v.fusion}</td></tr>`; }).join('');
    stage.innerHTML = `<section class="summary-view"><header><div><small>评审汇总</small><h1>八个方向，拆开再融合</h1></div><button data-action="back-summary">返回当前方案</button></header><table><thead><tr><th>方向</th><th>总分 / 30</th><th>备注</th><th>候选融合元素</th></tr></thead><tbody>${rows}</tbody></table><p>分数用于辅助讨论，不自动宣布赢家。</p></section>`;
    stage.querySelector('[data-action="back-summary"]').onclick = mount;
  }
  items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
  replay.addEventListener('click', mount);
  stateNav.addEventListener('click', (e) => { const btn = e.target.closest('[data-state]'); if (btn) setState(btn.dataset.state); });
  document.querySelector('[data-toggle-notes]').onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) panel.querySelector('h2').focus?.(); };
  document.querySelector('[data-show-summary]').onclick = showSummary;
  window.addEventListener('resize', moveHighlight);
  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= variants.length) setActive(num - 1);
    else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
    else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
    else if (e.key === 'r' || e.key === 'R') mount();
  });
  setActive(current);
  requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
})();
