document.addEventListener('DOMContentLoaded', () => {
      
      /* =========================================
         1. Hero 区域 3D 鼠标视差 (Parallax)
         ========================================= */
      const demoWrap = document.getElementById("demoWrap");
      const opDemo = document.getElementById("opDemo");
      const spatialWrap = document.getElementById("spatialWrap");
      
      if (demoWrap && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.getElementById('sec-hero').addEventListener("mousemove", (e) => {
          const rect = demoWrap.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          const deltaX = (x - centerX) / centerX;
          const deltaY = (y - centerY) / centerY;

          opDemo.style.transform = `rotateY(${deltaX * 8}deg) rotateX(${-deltaY * 8}deg) translateY(-6px) scale(1.02)`;
          opDemo.style.boxShadow = `${-deltaX * 15}px ${deltaY * 15 + 40}px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.2)`;
          if (spatialWrap) spatialWrap.style.transform = `translateX(${-deltaX * 20}px) translateY(${-deltaY * 20}px)`;
        });

        document.getElementById('sec-hero').addEventListener("mouseleave", () => {
          opDemo.style.transform = `rotateY(0deg) rotateX(0deg) translateY(0) scale(1)`;
          opDemo.style.boxShadow = ``;
          if (spatialWrap) spatialWrap.style.transform = `translateX(0) translateY(0)`;
        });
      }

      /* =========================================
         2. Hero 数据集：纯 CSS/SVG 绘制的设备与 UI
         ========================================= */
      const opScenes = [
        {
          label: "Cursor",
          app: "Cursor",
          theme: "cursor",
          icon: "assets/brands/cursor.svg",
          deviceSVG: `
            <svg viewBox="0 0 100 140" width="80" height="112" style="filter: drop-shadow(0 20px 30px rgba(0,0,0,0.8));">
              <rect x="20" y="10" width="60" height="120" rx="30" fill="rgba(30,30,32,0.9)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
              <line x1="50" y1="10" x2="50" y2="50" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
              <circle cx="50" cy="35" r="4" fill="#52525b"/>
              <circle cx="15" cy="55" r="4" fill="currentColor" class="device-led"/>
            </svg>`,
          pose: { r: "-15deg", tx: "10px", ty: "10px", hsX: "15%", hsY: "40%" },
          typed: "把这个按钮改成圆角，跟主色一致",
          gesture: false,
          render() {
            return `
              <div class="ui-cursor">
                <div class="ui-cursor-sidebar">
                  <img class="op-brand-icon" src="assets/brands/cursor.svg" alt="" width="24" height="24">
                </div>
                <div class="ui-cursor-main">
                  <div class="ui-cursor-msgs">
                    <div class="ui-cursor-msg is-user">这个按钮样式有点乱</div>
                    <div class="ui-cursor-msg is-ai">我可以帮你改。想要圆角还是方角？</div>
                  </div>
                  <div class="ui-composer-inner">
                    <span class="ui-composer-placeholder">Plan, @ for context</span>
                    <span class="op-input-text"></span><span class="op-caret"></span>
                    <span class="ui-composer-mic" aria-hidden="true">
                      <i class="ph-fill ph-microphone"></i>
                      <span class="op-mic-waves"><span></span><span></span><span></span><span></span><span></span></span>
                    </span>
                  </div>
                </div>
              </div>`;
          }
        },
        {
          label: "Claude Code",
          app: "Terminal",
          theme: "claude",
          icon: "assets/brands/claude.svg",
          deviceSVG: `
            <svg viewBox="0 0 100 100" width="70" height="70" style="filter: drop-shadow(0 20px 30px rgba(0,0,0,0.8));">
              <circle cx="50" cy="50" r="40" fill="rgba(30,30,32,0.6)" stroke="rgba(255,255,255,0.2)" stroke-width="12"/>
              <circle cx="50" cy="50" r="34" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="2"/>
              <circle cx="50" cy="16" r="3" fill="currentColor" class="device-led"/>
            </svg>`,
          pose: { r: "5deg", tx: "0px", ty: "15px", hsX: "50%", hsY: "16%" },
          typed: "帮我把这个页面改窄一点",
          gesture: true,
          render() {
            return `
              <div class="ui-claude">
                <div class="ui-claude-head">
                  <img class="op-brand-icon" src="assets/brands/claude.svg" alt="" width="24" height="24">
                  <span>Claude Code</span>
                </div>
                <div class="ui-claude-lines">
                  <div class="ui-claude-line is-dim">~/projects/my-app</div>
                  <div class="ui-claude-line is-tool">Read src/App.tsx</div>
                </div>
                <div class="ui-claude-prompt">
                  <span class="ui-claude-chevron">›</span>
                  <span class="ui-composer-placeholder">说一句指令…</span>
                  <span class="op-input-text"></span><span class="op-caret"></span>
                  <span class="ui-composer-mic" aria-hidden="true">
                    <i class="ph-fill ph-microphone"></i>
                    <span class="op-mic-waves"><span></span><span></span><span></span><span></span><span></span></span>
                  </span>
                </div>
              </div>`;
          }
        },
        {
          label: "豆包",
          app: "豆包",
          theme: "doubao",
          icon: "assets/brands/doubao.svg",
          deviceSVG: `
            <svg viewBox="0 0 140 100" width="112" height="80" style="filter: drop-shadow(0 20px 30px rgba(0,0,0,0.8));">
              <path d="M 20 40 C 20 10, 50 10, 70 20 C 90 10, 120 10, 120 40 C 120 70, 140 90, 120 90 C 100 90, 80 70, 70 70 C 60 70, 40 90, 20 90 C 0 90, 20 70, 20 40 Z" fill="rgba(30,30,32,0.9)" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
              <circle cx="45" cy="40" r="12" fill="#27272a" stroke="rgba(255,255,255,0.1)"/>
              <circle cx="95" cy="55" r="12" fill="#27272a" stroke="rgba(255,255,255,0.1)"/>
              <circle cx="105" cy="20" r="4" fill="currentColor" class="device-led"/>
              <circle cx="95" cy="30" r="3" fill="#52525b"/><circle cx="105" cy="40" r="3" fill="#52525b"/><circle cx="85" cy="40" r="3" fill="#52525b"/><circle cx="95" cy="50" r="3" fill="#52525b"/>
            </svg>`,
          pose: { r: "-8deg", tx: "-5px", ty: "5px", hsX: "75%", hsY: "25%" },
          typed: "写一段产品介绍，语气轻松点",
          gesture: false,
          render() {
            return `
              <div class="ui-doubao">
                <div class="ui-doubao-head">
                  <img class="op-brand-icon is-lg" src="assets/brands/doubao.svg" alt="" width="28" height="28">
                  <span>豆包</span>
                </div>
                <div class="ui-doubao-body">
                  <div class="ui-doubao-msg is-ai">想写什么？直接说或打字都行。</div>
                </div>
                <div class="ui-composer-inner">
                  <span class="ui-composer-placeholder">发消息...</span>
                  <span class="op-input-text"></span><span class="op-caret"></span>
                  <span class="ui-composer-mic" aria-hidden="true">
                    <i class="ph-fill ph-microphone"></i>
                    <span class="op-mic-waves"><span></span><span></span><span></span><span></span><span></span></span>
                  </span>
                </div>
              </div>`;
          }
        }
      ];

      /* =========================================
         3. Hero 动画调度器 (Animation Scheduler)
         ========================================= */
      const opStage = document.getElementById("opStage");
      const opAppBody = document.getElementById("opAppBody");
      const opAction = document.getElementById("opAction");
      const opDeviceSvgWrap = document.getElementById("opDeviceSvgWrap");
      
      const dsCode = document.getElementById("dsCode");
      const dsDesc = document.getElementById("dsDesc");
      const dsDot = document.getElementById("dsDot");
      const dsPanel = document.getElementById("demoStatusPanel");

      // 终端状态面板更新逻辑
      function updateStatusPanel(phase, text) {
        if(!dsPanel) return;
        // 缩放强调动画
        dsPanel.style.transform = 'translateY(-50%) translateZ(40px) scale(1.03)';
        setTimeout(() => dsPanel.style.transform = 'translateY(-50%) translateZ(40px) scale(1)', 200);

        if(phase === 'idle') {
           dsCode.textContent = '待机中'; dsCode.classList.remove('is-active'); dsDot.classList.remove('is-active');
           dsDesc.textContent = '等你按一下外设…';
        } else if (phase === 'trigger') {
           dsCode.textContent = '收到按键'; dsCode.classList.add('is-active'); dsDot.classList.add('is-active');
           dsDesc.textContent = '正在帮你开麦。';
        } else if (phase === 'listen') {
           dsCode.textContent = '正在听';
           dsDesc.textContent = '说吧，字马上跟上…';
        } else if (phase === 'typing') {
           dsCode.textContent = '正在上屏';
           dsDesc.textContent = `正在打出：「${text}」`;
        }
      }

      function renderScene(index) {
        const scene = opScenes[index % opScenes.length];
        
        document.getElementById("opAppName").textContent = scene.app;
        document.getElementById("opSceneLabelText").textContent = scene.label;
        const sceneIcon = document.getElementById("opSceneIcon");
        if (sceneIcon) {
          sceneIcon.src = scene.icon;
          sceneIcon.alt = scene.label;
        }
        
        opAppBody.innerHTML = scene.render();
        
        opDeviceSvgWrap.innerHTML = scene.deviceSVG;
        
        opAction.style.setProperty('--pose-r', scene.pose.r);
        opAction.style.setProperty('--pose-tx', scene.pose.tx);
        opAction.style.setProperty('--pose-ty', scene.pose.ty);
        opAction.style.setProperty('--hs-x', scene.pose.hsX);
        opAction.style.setProperty('--hs-y', scene.pose.hsY);
        
        opAction.classList.toggle('has-gesture', scene.gesture);

        const dotsContainer = document.getElementById("opSceneDots");
        dotsContainer.innerHTML = '';
        opScenes.forEach((_, i) => {
           dotsContainer.innerHTML += `<div class="w-2 h-2 rounded-full transition-colors ${i === index ? 'bg-mac-accent' : 'bg-white/20'}"></div>`;
        });
        
        return scene;
      }

      function hideComposerPlaceholder() {
        opAppBody.querySelectorAll('.ui-composer-placeholder').forEach((el) => {
          el.classList.add('is-hidden');
        });
      }

      function startTimeline(index) {
        const scene = renderScene(index);
        const typedText = scene.typed;
        
        opStage.className = "op-demo-stage phase-idle";
        updateStatusPanel('idle');

        setTimeout(() => {
           opStage.className = "op-demo-stage phase-trigger";
           updateStatusPanel('trigger');
        }, 1500);

        setTimeout(() => {
           opStage.className = "op-demo-stage phase-listen";
           updateStatusPanel('listen');
           hideComposerPlaceholder();
        }, 2500);

        setTimeout(() => {
           opStage.className = "op-demo-stage phase-typing";
           updateStatusPanel('typing', typedText);
           hideComposerPlaceholder();
           
           const typedEl = opAppBody.querySelector('.op-input-text');
           let i = 0;
           const typeInterval = setInterval(() => {
              if (i < typedText.length) {
                 typedEl.textContent += typedText[i];
                 i++;
              } else {
                 clearInterval(typeInterval);
                 opStage.className = "op-demo-stage phase-done";
                 setTimeout(() => startTimeline(index + 1), 3000);
              }
           }, 80);
        }, 4000);
      }
      
      // 启动 Hero 轮播
      startTimeline(0);

      /* =========================================
         4. 下方卡片自动演示循环 (Card 1, 2, 3)
         ========================================= */
      
      // --- Card 1: 触发链路轮播 ---
      const flowItems = document.querySelectorAll('.command-item');
      const flowStatus = document.querySelector('[data-flow-status]');
      const flowCurrent = document.querySelector('[data-flow-current]');
      const flowResult = document.querySelector('[data-flow-result]');
      const statuses = ["鼠标侧键已记录", "手柄按键已记录", "蓝牙戒指已记录", "麦克风口令已记录"];
      const results = [
        "按下鼠标侧键后，嘴炮立刻进输入框。",
        "按下手柄，沙发上也能口述周报。",
        "轻点戒指，假装还在认真打字。",
        "说出口令，麦克风也会帮你开麦。"
      ];
      let flowIndex = 0;
      setInterval(() => {
        flowItems.forEach((item, i) => {
          if (i === flowIndex) {
            item.classList.add('is-active');
            flowCurrent.textContent = item.querySelector('strong').textContent;
            flowStatus.textContent = statuses[i];
            flowResult.textContent = results[i];
          } else {
            item.classList.remove('is-active');
          }
        });
        flowIndex = (flowIndex + 1) % flowItems.length;
      }, 3000);

      // --- Card 2: 语音唤醒心流演示 ---
      const typed1 = document.getElementById('ime-typed-1');
      const caret1 = document.getElementById('ime-caret-1');
      const status1 = document.getElementById('ime-status-1');
      const waves1 = document.getElementById('ime-waves-1');
      const bar1 = document.getElementById('ime-bar-1');
      const text1 = "今天就把这句想法说出来。";
      
      async function runImeDemo1() {
        while(true) {
          typed1.textContent = ''; caret1.style.display = 'none';
          status1.textContent = '等待口令唤醒...'; waves1.style.opacity = '0';
          bar1.classList.remove('is-active');
          await new Promise(r => setTimeout(r, 2000));
          
          status1.textContent = '正在聆听...'; waves1.style.opacity = '1';
          bar1.classList.add('is-active'); caret1.style.display = 'inline-block';
          await new Promise(r => setTimeout(r, 1000));
          
          for(let i=0; i<text1.length; i++) {
            typed1.textContent += text1[i];
            await new Promise(r => setTimeout(r, 100));
          }
          
          status1.textContent = '已自动上屏并发送'; waves1.style.opacity = '0';
          bar1.classList.remove('is-active'); caret1.style.display = 'none';
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      runImeDemo1();

      // --- Card 3: 撤销重说心流演示 ---
      const typed2 = document.getElementById('ime-typed-2');
      const status2 = document.getElementById('ime-status-2');
      const hint2 = document.getElementById('ime-cancel-hint');
      const text2_wrong = "我爱你";
      const text2_right = "我爱你塞北的雪。";

      async function runImeDemo2() {
        while(true) {
          typed2.textContent = ''; hint2.style.opacity = '0';
          status2.textContent = '聆听中...';
          await new Promise(r => setTimeout(r, 1000));
          
          for(let i=0; i<text2_wrong.length; i++) {
            typed2.textContent += text2_wrong[i];
            await new Promise(r => setTimeout(r, 150));
          }
          await new Promise(r => setTimeout(r, 500));
          
          hint2.style.opacity = '1'; status2.textContent = '已取消';
          await new Promise(r => setTimeout(r, 800));
          
          typed2.textContent = ''; hint2.style.opacity = '0';
          status2.textContent = '重新聆听...';
          await new Promise(r => setTimeout(r, 500));
          
          for(let i=0; i<text2_right.length; i++) {
            typed2.textContent += text2_right[i];
            await new Promise(r => setTimeout(r, 100));
          }
          status2.textContent = '完成输入';
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      runImeDemo2();

      // 滚动监听指示器同步
      const sections = document.querySelectorAll("[data-section]");
      const dots = document.querySelectorAll(".rail-dot");
      const sectionObs = new IntersectionObserver((entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              dots.forEach((d, i) => d.classList.toggle("is-active", i === Number(e.target.dataset.section)));
            }
          });
        }, { threshold: 0.5 }
      );
      sections.forEach((s) => sectionObs.observe(s));
      
      dots.forEach((dot) => {
        dot.addEventListener("click", () => {
          const target = document.querySelector(dot.dataset.target);
          if (target) target.scrollIntoView({ behavior: "smooth" });
        });
      });

      const heroRotate = document.getElementById("heroRotate");
      if (heroRotate) {
        const lines = ["Cursor 里直接说", "Claude Code 里直接说", "豆包里直接说", "任何输入框里直接说"];
        let hi = 0;
        setInterval(() => {
          hi = (hi + 1) % lines.length;
          heroRotate.textContent = lines[hi];
        }, 2800);
      }

      /* Section switch: whole story block enters once, children stagger via --d */
      const revealSections = document.querySelectorAll("#sec-chain, #sec-caps");
      if (revealSections.length) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const showSection = (section) => {
          section.classList.add("is-shown");
          section.querySelectorAll(".apple-reveal").forEach((el) => el.classList.add("is-in"));
        };
        if (reduceMotion) {
          revealSections.forEach(showSection);
        } else {
          const revealObs = new IntersectionObserver(
            (entries) => {
              entries.forEach((e) => {
                if (!e.isIntersecting) return;
                showSection(e.target);
                revealObs.unobserve(e.target);
              });
            },
            { threshold: 0.22, rootMargin: "0px 0px -12% 0px" }
          );
          revealSections.forEach((s) => revealObs.observe(s));
        }
      }

    });