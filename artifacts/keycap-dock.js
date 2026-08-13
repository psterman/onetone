/**
 * Keycap dock control — pick a trigger key by stepping through physical
 * categories (not "intent" / "section"). The dock is the control's own
 * submenu; it appears in place, not as a modal or new page.
 *
 * Usage:
 *   const root = createKeycapDock({
 *     current: 'RAlt',
 *     onChange: (key) => console.log('picked', key)
 *   });
 *   document.body.appendChild(root);
 *
 * No deps. Vanilla DOM. ~200 lines.
 */
(function (global) {
  'use strict';

  // Physical categories. Each group is a "drawer" in the dock.
  // Order matters — first one is the default drawer.
  const CATEGORIES = [
    {
      id: 'modifier',
      label: '修饰键',
      icon: '⌘',
      keys: [
        { id: 'Ctrl',     label: 'Ctrl',  hint: '修饰' },
        { id: 'Shift',    label: 'Shift', hint: '修饰' },
        { id: 'Alt',      label: 'Alt',   hint: '修饰' },
        { id: 'RAlt',     label: 'RAlt',  hint: '右修饰' },
        { id: 'RCtrl',    label: 'RCtrl', hint: '右修饰' },
        { id: 'RShift',   label: 'RShift',hint: '右修饰' },
        { id: 'LWin',     label: 'Win',   hint: '系统' },
        { id: 'Meta',     label: 'Meta',  hint: 'macOS ⌘' }
      ]
    },
    {
      id: 'function',
      label: '功能键',
      icon: 'Fx',
      keys: [
        { id: 'Esc',   label: 'Esc',   hint: '退出' },
        { id: 'Tab',   label: 'Tab',   hint: '制表' },
        { id: 'Space', label: 'Space', hint: '空格' },
        { id: 'Enter', label: 'Enter', hint: '回车' },
        { id: 'Backspace', label: '⌫', hint: '退格' },
        { id: 'Delete', label: 'Del',  hint: '删除' },
        { id: 'F1',  label: 'F1',  hint: '功能' },
        { id: 'F2',  label: 'F2' },
        { id: 'F3',  label: 'F3' },
        { id: 'F4',  label: 'F4' },
        { id: 'F5',  label: 'F5' },
        { id: 'F6',  label: 'F6' },
        { id: 'F7',  label: 'F7' },
        { id: 'F8',  label: 'F8' },
        { id: 'F9',  label: 'F9' },
        { id: 'F10', label: 'F10' },
        { id: 'F11', label: 'F11' },
        { id: 'F12', label: 'F12' }
      ]
    },
    {
      id: 'arrow',
      label: '方向键',
      icon: '↕',
      keys: [
        { id: 'Up',    label: '↑', hint: '上' },
        { id: 'Down',  label: '↓', hint: '下' },
        { id: 'Left',  label: '←', hint: '左' },
        { id: 'Right', label: '→', hint: '右' },
        { id: 'Home',  label: 'Home',  hint: '行首' },
        { id: 'End',   label: 'End',   hint: '行尾' },
        { id: 'PageUp',   label: 'PgUp',   hint: '上翻' },
        { id: 'PageDown', label: 'PgDn',   hint: '下翻' }
      ]
    },
    {
      id: 'letter',
      label: '字母',
      icon: 'Aa',
      keys: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(function (c) {
        return { id: c, label: c };
      })
    },
    {
      id: 'digit',
      label: '数字',
      icon: '09',
      keys: '0123456789'.split('').map(function (c) {
        return { id: c, label: c };
      })
    },
    {
      id: 'mouse',
      label: '鼠标',
      icon: '🖱',
      keys: [
        { id: 'MouseLeft',   label: '左键',   hint: '主键' },
        { id: 'MouseRight',  label: '右键',   hint: '菜单' },
        { id: 'MouseMiddle', label: '中键',   hint: '滚轮按' },
        { id: 'MouseX1',     label: 'X1',     hint: '侧键 1' },
        { id: 'MouseX2',     label: 'X2',     hint: '侧键 2' },
        { id: 'WheelUp',     label: '滚↑',    hint: '上滚' },
        { id: 'WheelDown',   label: '滚↓',    hint: '下滚' }
      ]
    },
    {
      id: 'gesture',
      label: '手势',
      icon: '✋',
      keys: [
        { id: 'PinchIn',  label: '捏合',  hint: '双指收' },
        { id: 'PinchOut', label: '张开',  hint: '双指放' },
        { id: 'SwipeUp',  label: '上滑',  hint: '三指' },
        { id: 'SwipeDown',label: '下滑',  hint: '三指' }
      ]
    },
    {
      id: 'combo',
      label: '组合',
      icon: '⇧',
      keys: [
        { id: 'Ctrl+Shift',    label: 'Ctrl+Shift',  hint: '组合' },
        { id: 'Ctrl+Alt',      label: 'Ctrl+Alt',    hint: '组合' },
        { id: 'Alt+Shift',     label: 'Alt+Shift',   hint: '组合' },
        { id: 'CustomCombo',   label: '自定义…',     hint: '录入' }
      ]
    }
  ];

  // Locate the "best" category for a given current key — used to seed
  // the dock drawer when opened.
  function findCategoryForKey(keyId) {
    if (!keyId) return CATEGORIES[0];
    for (let i = 0; i < CATEGORIES.length; i++) {
      const keys = CATEGORIES[i].keys;
      if (Array.isArray(keys) && keys.some(function (k) { return k.id === keyId; })) {
        return CATEGORIES[i];
      }
    }
    return CATEGORIES[0];
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function createKeycapDock(opts) {
    opts = opts || {};
    let current = opts.current || '';
    let onChange = opts.onChange || function () {};

    const root = el('div', { class: 'kcd-root' });

    // --- Keycap (the always-visible affordance) ---
    const keycap = el('button', {
      type: 'button',
      class: 'kcd-keycap',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-label': '选择触发键'
    });
    const keycapLabel = el('span', { class: 'kcd-keycap-label', text: current || '选键' });
    const keycapHint = el('span', { class: 'kcd-keycap-hint', text: '点击选键' });
    keycap.appendChild(keycapLabel);
    keycap.appendChild(keycapHint);
    root.appendChild(keycap);

    // --- Dock (lazy-mounted on first open) ---
    let dock = null;
    let drawerHost = null;
    let catStrip = null;
    let activeCategory = null;

    function buildDock() {
      if (dock) return dock;
      dock = el('div', { class: 'kcd-dock', role: 'menu', 'aria-label': '按键分类' });
      catStrip = el('div', { class: 'kcd-cats', role: 'tablist' });
      drawerHost = el('div', { class: 'kcd-drawer' });
      dock.appendChild(catStrip);
      dock.appendChild(drawerHost);
      root.appendChild(dock);

      CATEGORIES.forEach(function (cat) {
        const tab = el('button', {
          type: 'button',
          class: 'kcd-cat',
          role: 'tab',
          'data-cat': cat.id,
          'aria-selected': 'false',
          onclick: function () { selectCategory(cat.id); }
        });
        tab.appendChild(el('span', { class: 'kcd-cat-icon', text: cat.icon }));
        tab.appendChild(el('span', { class: 'kcd-cat-label', text: cat.label }));
        catStrip.appendChild(tab);
      });
      return dock;
    }

    function renderDrawer(cat) {
      drawerHost.innerHTML = '';
      const grid = el('div', { class: 'kcd-grid' });
      cat.keys.forEach(function (k) {
        const cell = el('button', {
          type: 'button',
          class: 'kcd-key' + (k.id === current ? ' is-current' : ''),
          role: 'menuitem',
          'data-key': k.id,
          title: k.hint || k.label,
          onclick: function (ev) {
            ev.stopPropagation();
            pick(k.id, k.label);
          }
        });
        cell.appendChild(el('span', { class: 'kcd-key-label', text: k.label }));
        if (k.hint) cell.appendChild(el('small', { class: 'kcd-key-hint', text: k.hint }));
        grid.appendChild(cell);
      });
      drawerHost.appendChild(grid);
    }

    function selectCategory(catId) {
      const cat = CATEGORIES.find(function (c) { return c.id === catId; }) || CATEGORIES[0];
      activeCategory = cat;
      Array.prototype.forEach.call(catStrip.children, function (tab) {
        tab.setAttribute('aria-selected', tab.getAttribute('data-cat') === cat.id ? 'true' : 'false');
        tab.classList.toggle('is-active', tab.getAttribute('data-cat') === cat.id);
      });
      renderDrawer(cat);
    }

    function open() {
      buildDock();
      dock.hidden = false;
      // Force a reflow so the slide-in transition fires.
      void dock.offsetWidth;
      dock.classList.add('is-open');
      keycap.setAttribute('aria-expanded', 'true');
      // Seed the drawer to the category that holds the current key.
      const seed = findCategoryForKey(current);
      selectCategory(seed.id);
      // Focus first key for keyboard nav.
      setTimeout(function () {
        const first = drawerHost.querySelector('.kcd-key');
        if (first) first.focus();
      }, 60);
    }

    function close() {
      if (!dock || dock.hidden) return;
      dock.classList.remove('is-open');
      keycap.setAttribute('aria-expanded', 'false');
      setTimeout(function () {
        if (dock && !dock.classList.contains('is-open')) dock.hidden = true;
      }, 200);
    }

    function pick(keyId, keyLabel) {
      current = keyId;
      keycapLabel.textContent = keyLabel || keyId;
      keycapHint.textContent = '已选 · 再点换';
      keycap.classList.add('is-set');
      close();
      try { onChange(keyId); } catch (e) { /* swallow — caller may throw */ }
    }

    // --- Wiring ---
    keycap.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (dock && !dock.hidden) close();
      else open();
    });

    keycap.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        keycap.click();
      } else if (ev.key === 'Escape') {
        close();
      }
    });

    // Outside click + ESC close.
    document.addEventListener('click', function (ev) {
      if (!dock || dock.hidden) return;
      if (root.contains(ev.target)) return;
      close();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && dock && !dock.hidden) close();
    });

    // Public API so demos can poke it.
    root.setKey = function (keyId) {
      const cat = findCategoryForKey(keyId);
      const k = (cat.keys || []).find(function (kk) { return kk.id === keyId; });
      pick(keyId, k ? k.label : keyId);
    };
    root.getKey = function () { return current; };
    root.open = open;
    root.close = close;

    return root;
  }

  global.createKeycapDock = createKeycapDock;
  global.KeycapDockCategories = CATEGORIES;
})(typeof window !== 'undefined' ? window : globalThis);
