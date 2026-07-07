/* =====================================================================
   voice-pilot · 一声 onetone
   M1 配套 JS · home-v9.js
   =====================================================================
   用途：把 home-v9.css 的新组件接上现有数据流
   配套：在 src/index.html 底部 app.js 之后引入

   提供：
   · 流式 typewriter 效果（替换 .live-text 内容）
   · 设置 tray 折叠展开
   · 状态码更新（idle/listening/dictating/error）
   · 光晕球态切换

   使用方法：
   1. 把这个文件存为 src/js/home-v9.js
   2. 在 src/index.html 的 <body> 末尾、app.js 之后引入：
      <script src="js/home-v9.js" defer></script>
   3. 调用 window.vp9.updateState('DICTATING') 等方法触发更新
   ===================================================================== */

(function(){
  'use strict';

  // ============================================================
  // 1. 流式 typewriter 效果
  // ============================================================
  // 调用 vp9.typewrite('.vp-hero-live .live-text', '现在我把界面重构一下', 60)
  // speed: 每字间隔 ms（推荐 50-80）

  const vp9 = {
    typewrite: function(selector, text, speed = 60){
      const el = document.querySelector(selector);
      if(!el) return;

      el.innerHTML = '';
      let i = 0;
      const cursorHTML = '<span class="cursor"></span>';

      function step(){
        if(i < text.length){
          // 用 DOM 节点保留格式（last / typed）
          const span = document.createElement('span');
          span.textContent = text[i];
          span.className = 'typed';
          el.insertBefore(span, el.querySelector('.cursor'));
          i++;
          setTimeout(step, speed);
        }
      }
      el.insertAdjacentHTML('beforeend', cursorHTML);
      step();
    },

    // 一次性设置文字（带 last / typed 区分）
    setText: function(selector, finalized, pending){
      const el = document.querySelector(selector);
      if(!el) return;
      el.innerHTML = '';
      if(finalized){
        const span = document.createElement('span');
        span.className = 'typed';
        span.textContent = finalized;
        el.appendChild(span);
      }
      if(pending){
        const span = document.createElement('span');
        span.className = 'last';
        span.textContent = pending;
        el.appendChild(span);
      }
      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      el.appendChild(cursor);
    },

    // 清空文字，回到空状态
    clear: function(selector){
      const el = document.querySelector(selector);
      if(el) el.innerHTML = '';
    }
  };


  // ============================================================
  // 2. 设置 tray 折叠展开
  // ============================================================
  // DOM: <div class="vp-tray-toggle">展开设置…</div>
  //      <div class="vp-tray">…内容…</div>

  function initTray(){
    const toggle = document.querySelector('.vp-tray-toggle');
    const tray = document.querySelector('.vp-tray');
    if(!toggle || !tray) return;

    toggle.addEventListener('click', () => {
      const isOpen = tray.classList.toggle('open');
      toggle.classList.toggle('open', isOpen);
      const label = isOpen ? '收起设置' : '展开设置与习惯配置';
      const textNode = Array.from(toggle.childNodes).find(n => n.nodeType === 3);
      if(textNode){
        textNode.textContent = label;
      }
    });
  }


  // ============================================================
  // 3. 状态码更新 · 同步所有相关元素
  // ============================================================
  // 调用 vp9.updateState('DICTATING') / 'LISTENING' / 'IDLE' / 'ERROR'

  const STATE_CONFIG = {
    IDLE: {
      label: '待命',
      code: '[IDLE]',
      dotClass: '',
      orbClass: 'is-idle',
      pillClass: '',
      statusbarClass: 'idle'
    },
    LISTENING: {
      label: '听见了唤醒词',
      code: '[LISTENING]',
      dotClass: '',
      orbClass: '',
      pillClass: 'live',
      statusbarClass: ''
    },
    DICTATING: {
      label: '正在听',
      code: '[DICTATING]',
      dotClass: '',
      orbClass: '',
      pillClass: 'live',
      statusbarClass: ''
    },
    ERROR: {
      label: '离线',
      code: '[ERROR]',
      dotClass: '',
      orbClass: 'is-error',
      pillClass: 'error',
      statusbarClass: 'error'
    }
  };

  vp9.updateState = function(stateName){
    const cfg = STATE_CONFIG[stateName];
    if(!cfg) return;

    // 状态条
    document.querySelectorAll('.vp-statusbar .state').forEach(el => {
      el.className = 'state ' + cfg.statusbarClass;
      const codeEl = el.querySelector('.state-code');
      const labelEl = el.querySelector('.state-label');
      if(codeEl) codeEl.textContent = cfg.code;
      if(labelEl) labelEl.textContent = cfg.label;
    });

    // 主屏状态 label
    document.querySelectorAll('.vp-hero-live .state-label').forEach(el => {
      const textEl = el.querySelector('.state-text');
      if(textEl) textEl.textContent = cfg.label;
    });

    // 光晕球
    document.querySelectorAll('.vp-orb').forEach(el => {
      el.className = 'vp-orb ' + cfg.orbClass;
    });

    // 状态 pill 行
    document.querySelectorAll('.vp-status-pills .pill').forEach(el => {
      el.classList.remove('live', 'error');
      if(cfg.pillClass) el.classList.add(cfg.pillClass);
    });

    // 触发自定义事件（其他模块可以监听）
    window.dispatchEvent(new CustomEvent('vp9:state-change', {
      detail: { state: stateName, config: cfg }
    }));
  };


  // ============================================================
  // 4. Header 切换按钮联动
  // ============================================================
  // 监听 .app-header-rev 内的 .icon-btn 点击，自动切 active 状态

  function initHeaderButtons(){
    const buttons = document.querySelectorAll('.app-header-rev .icon-btn[data-toggle]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const group = btn.dataset.toggle;
        document.querySelectorAll(`.app-header-rev .icon-btn[data-toggle="${group}"]`)
          .forEach(b => b.classList.remove('is-on'));
        btn.classList.add('is-on');
      });
    });
  }


  // ============================================================
  // 5. 暴露 API
  // ============================================================
  window.vp9 = vp9;


  // ============================================================
  // 6. DOM Ready 自动初始化
  // ============================================================
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => {
      initTray();
      initHeaderButtons();
    });
  } else {
    initTray();
    initHeaderButtons();
  }

})();