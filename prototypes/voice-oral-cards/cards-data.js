(function (global) {
  var items = [
    {
      id: 'soft:pushToTalk', cat: 'core', via: 'core', viaLabel: '核心',
      name: '说话', desc: '打开听写，把话写进当前输入框',
      keys: ['说话', '麦克风'], need: true
    },
    {
      id: 'soft:stopOrSend', cat: 'core', via: 'core', viaLabel: '核心',
      name: '发送', desc: '提交本轮内容给 Agent',
      keys: ['发送'], need: true
    },
    {
      id: 'soft:cancelListen', cat: 'core', via: 'core', viaLabel: '核心',
      name: '取消', desc: '退出口头收听，不执行其它动作',
      keys: ['取消', '退出'], need: false
    },
    {
      id: 'soft:continue', cat: 'soft', via: 'soft', viaLabel: 'Soft',
      name: '继续', desc: '让 Agent 接着上一轮继续干',
      keys: ['继续'], need: true
    },
    {
      id: 'soft:newThread', cat: 'soft', via: 'soft', viaLabel: 'Soft',
      name: '新建对话', desc: '开一条新的 Agent 线程',
      keys: ['新会话', '新建'], need: true
    },
    {
      id: 'prompt:review', cat: 'prompt', via: 'prompt', viaLabel: '注入',
      name: '代码审查', desc: '把审查模板写入输入框',
      keys: ['审查'], need: true
    },
    {
      id: 'prompt:explain', cat: 'prompt', via: 'prompt', viaLabel: '注入',
      name: '解释这段', desc: '注入「解释选中代码」模板',
      keys: ['解释'], need: true
    },
    {
      id: 'bind:undo', cat: 'bind', via: 'bind', viaLabel: '绑定',
      name: '撤销', desc: '撤销上一步 Agent 改动',
      keys: ['撤销'], need: false
    },
    {
      id: 'bind:accept', cat: 'bind', via: 'bind', viaLabel: '绑定',
      name: '接受改动', desc: '接受当前 diff',
      keys: ['接受'], need: false
    },
    {
      id: 'bind:stop', cat: 'bind', via: 'bind', viaLabel: '绑定',
      name: '停下', desc: '中断正在跑的 Agent',
      keys: ['停下'], need: false
    }
  ];

  var pool = [
    {
      id: 'prompt:fix', cat: 'prompt', via: 'prompt', viaLabel: '注入',
      name: '修类型错误', desc: '注入修 TS 错误模板',
      keys: ['修类型'], need: true
    },
    {
      id: 'bind:reject', cat: 'bind', via: 'bind', viaLabel: '绑定',
      name: '拒绝改动', desc: '拒绝当前 diff',
      keys: ['拒绝'], need: false
    }
  ];

  var cats = [
    { id: 'core', title: '核心', hint: '默认可说 · 不建议删' },
    { id: 'soft', title: 'Soft 槽', hint: '与屏幕按钮同一动作' },
    { id: 'prompt', title: '一词注入', hint: '来自本 App 模板' },
    { id: 'bind', title: '语音绑定', hint: '来自 Agent / 按键绑定' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cardHtml(item, opts) {
    opts = opts || {};
    var keys = (item.keys || []).map(function (k) {
      return '<input class="key" type="text" value="' + esc(k) + '" aria-label="关键词" />';
    }).join('');
    var sort = opts.sortButtons
      ? '<div class="sort-btns">' +
        '<button type="button" data-up="' + esc(item.id) + '" title="上移">↑</button>' +
        '<button type="button" data-down="' + esc(item.id) + '" title="下移">↓</button></div>'
      : '<span class="grip" title="拖动排序" aria-hidden="true">⠿</span>';
    var remove = opts.canRemove
      ? '<button type="button" class="cmd-remove" data-remove="' + esc(item.id) + '">移除</button>'
      : '';
    return (
      '<article class="cmd" draggable="' + (opts.drag !== false ? 'true' : 'false') + '" data-id="' + esc(item.id) + '" data-cat="' + esc(item.cat) + '">' +
      '<div class="cmd-top">' +
      '<div><h3 class="cmd-name">' + esc(item.name) + '</h3>' +
      '<p class="cmd-desc">' + esc(item.desc) + '</p></div>' +
      '<span class="cmd-via ' + esc(item.via) + '">' + esc(item.viaLabel) + '</span></div>' +
      '<div class="cmd-keys"><label>关键词</label>' + keys +
      '<button type="button" class="key-add" data-add-key="' + esc(item.id) + '">+</button></div>' +
      '<div class="cmd-meta">' +
      '<span class="need' + (item.need ? '' : ' ok') + '">' + (item.need ? '需输入框' : '随时可用') + '</span>' +
      '<div style="display:flex;align-items:center;gap:6px">' + remove + sort + '</div></div></article>'
    );
  }

  function wireKeys(root) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add-key]');
      if (!add) return;
      var id = add.getAttribute('data-add-key');
      var item = items.find(function (x) { return x.id === id; });
      if (!item) return;
      item.keys.push('');
      if (typeof global.ORAL_CARDS.onChange === 'function') global.ORAL_CARDS.onChange();
    });
  }

  function moveItem(list, fromId, toId, before) {
    var from = -1, to = -1, i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === fromId) from = i;
      if (list[i].id === toId) to = i;
    }
    if (from < 0 || to < 0 || from === to) return list;
    var copy = list.slice();
    var [row] = copy.splice(from, 1);
    to = copy.findIndex(function (x) { return x.id === toId; });
    if (!before) to += 1;
    copy.splice(to, 0, row);
    return copy;
  }

  function reorderInCat(catId, fromId, toId, before) {
    var catItems = items.filter(function (x) { return x.cat === catId; });
    var others = items.filter(function (x) { return x.cat !== catId; });
    catItems = moveItem(catItems, fromId, toId, before);
    // rebuild preserving cat order of sections
    var out = [];
    cats.forEach(function (c) {
      if (c.id === catId) out = out.concat(catItems);
      else out = out.concat(others.filter(function (x) { return x.cat === c.id; }));
    });
    items = out;
  }

  function reorderGlobal(fromId, toId, before) {
    items = moveItem(items, fromId, toId, before);
  }

  function shift(id, dir) {
    var i = items.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= items.length) return;
    if (items[i].cat !== items[j].cat && arguments[2] === 'sameCat') return;
    var copy = items.slice();
    var tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
    items = copy;
  }

  function shiftInCat(id, dir) {
    var item = items.find(function (x) { return x.id === id; });
    if (!item) return;
    var catItems = items.filter(function (x) { return x.cat === item.cat; });
    var idx = catItems.findIndex(function (x) { return x.id === id; });
    var j = idx + dir;
    if (j < 0 || j >= catItems.length) return;
    var a = catItems[idx].id;
    var b = catItems[j].id;
    var ia = items.findIndex(function (x) { return x.id === a; });
    var ib = items.findIndex(function (x) { return x.id === b; });
    var copy = items.slice();
    var t = copy[ia];
    copy[ia] = copy[ib];
    copy[ib] = t;
    items = copy;
  }

  function remove(id) {
    var item = items.find(function (x) { return x.id === id; });
    if (!item || item.cat === 'core') return;
    items = items.filter(function (x) { return x.id !== id; });
    pool.push(item);
  }

  function addFromPool(id) {
    var i = pool.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    items.push(pool[i]);
    pool.splice(i, 1);
  }

  /** Simple HTML5 drag within a container of .cmd */
  function enableDrag(container, mode) {
    var dragId = null;
    container.addEventListener('dragstart', function (e) {
      var cmd = e.target.closest('.cmd');
      if (!cmd) return;
      dragId = cmd.getAttribute('data-id');
      cmd.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    container.addEventListener('dragend', function (e) {
      var cmd = e.target.closest('.cmd');
      if (cmd) cmd.classList.remove('is-dragging');
      container.querySelectorAll('.cmd.is-over').forEach(function (el) {
        el.classList.remove('is-over');
      });
      dragId = null;
    });
    container.addEventListener('dragover', function (e) {
      e.preventDefault();
      var over = e.target.closest('.cmd');
      container.querySelectorAll('.cmd.is-over').forEach(function (el) {
        el.classList.remove('is-over');
      });
      if (over && over.getAttribute('data-id') !== dragId) over.classList.add('is-over');
    });
    container.addEventListener('drop', function (e) {
      e.preventDefault();
      var over = e.target.closest('.cmd');
      if (!over || !dragId) return;
      var toId = over.getAttribute('data-id');
      if (toId === dragId) return;
      var rect = over.getBoundingClientRect();
      var before = e.clientY < rect.top + rect.height / 2;
      if (mode === 'cat') {
        var from = items.find(function (x) { return x.id === dragId; });
        var to = items.find(function (x) { return x.id === toId; });
        if (!from || !to || from.cat !== to.cat) return;
        reorderInCat(from.cat, dragId, toId, before);
      } else {
        reorderGlobal(dragId, toId, before);
      }
      if (typeof global.ORAL_CARDS.onChange === 'function') global.ORAL_CARDS.onChange();
    });
  }

  global.ORAL_CARDS = {
    get items() { return items; },
    set items(v) { items = v; },
    pool: pool,
    cats: cats,
    esc: esc,
    cardHtml: cardHtml,
    wireKeys: wireKeys,
    enableDrag: enableDrag,
    shiftInCat: shiftInCat,
    shift: shift,
    remove: remove,
    addFromPool: addFromPool,
    onChange: null
  };
})(window);
