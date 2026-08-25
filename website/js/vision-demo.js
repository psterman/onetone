document.addEventListener('DOMContentLoaded', () => {
      
      /* --- 1. Hero 视觉中枢状态循环 (空间取景器) --- */
      const visionStage = document.getElementById('vision-stage');
      const vsCode = document.getElementById('vs-code');
      const vsDesc = document.getElementById('vs-desc');
      const vsDot = document.getElementById('vs-dot');
      const vfLabel = document.getElementById('vf-label');
      const vfIcon = document.getElementById('vf-icon');
      
      // UI 状态调度剧本
      const heroStates = [
        { 
          class: 'state-blink', icon: 'ph-eye', label: '眨眼',
          code: '眨眼了', desc: '长眨眼已识别，可以当成你设好的那个快捷键。' 
        },
        { 
          class: 'state-shake', icon: 'ph-user', label: '摇头',
          code: '摇头了', desc: '左右摇头已识别，可用来切窗口或静音。' 
        },
        { 
          class: 'state-hand', icon: 'ph-hand-palm', label: '举手',
          code: '举手了', desc: '张开手掌已识别，可暂停当前动作。' 
        },
        { 
          class: 'state-away', icon: '', label: '',
          code: '人不在', desc: '镜头前没人了，屏幕先帮你盖上。' 
        }
      ];

      // 异步循环控制状态切换
      async function runHeroVisionLoop() {
        if(!visionStage) return;
        let currentIndex = 0;

        while(true) {
          // 1. 回归待机寻踪状态 (Idle)
          visionStage.className = 'vision-stage state-idle';
          vsCode.textContent = '看着你呢';
          vsDesc.textContent = '做个小动作试试看…';
          vsCode.style.color = '#86868b'; 
          vsDot.classList.add('idle');
          vfLabel.textContent = 'SEARCHING';
          vfIcon.className = 'ph ph-scan vf-target';
          
          await new Promise(r => setTimeout(r, 2500)); // 待机扫描 2.5 秒

          // 2. 触发特定捕捉状态
          const state = heroStates[currentIndex];
          visionStage.className = `vision-stage ${state.class}`;
          
          vsCode.textContent = state.code;
          vsDesc.textContent = state.desc;
          vsCode.style.color = '#2a9cc4'; // Amber Color
          vsDot.classList.remove('idle');
          
          if(state.class !== 'state-away') {
            vfLabel.textContent = state.label;
            vfIcon.className = `ph ${state.icon} vf-target`;
          }
          
          await new Promise(r => setTimeout(r, 3500)); // 展示捕捉状态 3.5 秒

          currentIndex = (currentIndex + 1) % heroStates.length;
        }
      }
      
      // 启动视觉循环
      runHeroVisionLoop();

      /* --- 2. 手势卡片互动舞台控制 --- */
      const gestureBtns = document.querySelectorAll('.gesture-btn');
      const gPipIcon = document.getElementById('g-pip-icon');
      const gShieldLayer = document.getElementById('g-shield-layer');
      const gCenterIcon = document.getElementById('g-center-icon');
      const gToast = document.getElementById('g-toast');
      let gestureTimeout;

      gestureBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.getAttribute('data-gesture');
          
          // 1. 重置所有状态
          clearTimeout(gestureTimeout);
          gPipIcon.className = 'ph-fill ph-user text-gray-500 text-2xl transition-all duration-300';
          gPipIcon.classList.remove('animate-pip-shake');
          gShieldLayer.style.opacity = '0';
          
          gCenterIcon.style.opacity = '0';
          gCenterIcon.style.transform = 'scale(0.5)';
          
          gToast.style.opacity = '0';
          gToast.style.transform = 'translate(-50%, 15px)';

          // 强制浏览器重排，使得动画每次点击都能重新触发
          void gPipIcon.offsetWidth;

          // 2. 根据不同手势分配不同反馈效果
          if (type === 'blink') {
             gPipIcon.className = 'ph-fill ph-eye-closed text-mac-accent text-2xl transition-all duration-300';
             showStageFeedback('ph-keyboard', '已触发习惯键: [ ⌘ + ⇧ + 2 ]');
          } 
          else if (type === 'shake') {
             // 摇头表现为图标震动，且屏蔽层落下
             gPipIcon.classList.add('animate-pip-shake');
             gShieldLayer.style.opacity = '1';
             showStageFeedback('', '检测到离席动作'); 
          } 
          else if (type === 'fist') {
             gPipIcon.className = 'ph-fill ph-hand-fist text-mac-accent text-2xl transition-all duration-300';
             showStageFeedback('ph-x-circle', '系统指令: [ ESC ]');
          } 
          else if (type === 'palm') {
             gPipIcon.className = 'ph-fill ph-hand-palm text-mac-accent text-2xl transition-all duration-300';
             showStageFeedback('ph-pause-circle', '全局任务挂起');
          }

          // 3. 两秒后自动恢复待机态
          gestureTimeout = setTimeout(() => {
             gPipIcon.className = 'ph-fill ph-user text-gray-500 text-2xl transition-all duration-500';
             gShieldLayer.style.opacity = '0';
             
             gCenterIcon.style.opacity = '0';
             gCenterIcon.style.transform = 'scale(0.5)';
             
             gToast.style.opacity = '0';
             gToast.style.transform = 'translate(-50%, 15px)';
          }, 2500);
        });
      });

      // 辅助函数：显示中央图标与底部 Toast
      function showStageFeedback(iconClass, text) {
          if(iconClass) {
              gCenterIcon.className = `ph-fill ${iconClass} text-mac-accent text-6xl transition-all duration-500 drop-shadow-[0_0_15px_rgba(42, 156, 196,0.5)] z-20`;
              gCenterIcon.style.opacity = '1';
              gCenterIcon.style.transform = 'scale(1)';
          }
          gToast.textContent = text;
          gToast.style.opacity = '1';
          gToast.style.transform = 'translate(-50%, 0)';
      }


      /* --- 3. Hero 鼠标交互追踪 (增强物理抓取感) --- */
      const heroWrapper = document.getElementById('hero');
      if(heroWrapper && visionStage) {
        visionStage.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // 平滑物理缓冲
        
        heroWrapper.addEventListener('mousemove', (e) => {
          // 视差正向跟随，让取景框“追”着鼠标看
          const x = (e.clientX - window.innerWidth / 2) * 0.15; 
          const y = (e.clientY - window.innerHeight / 2) * 0.15;
          
          visionStage.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        });

        heroWrapper.addEventListener('mouseleave', () => {
           // 鼠标离开，取景器回正
           visionStage.style.transform = `translate(-50%, -50%)`;
        });
      }

      /* --- 4. Card 01: 在场保护 (全自动循环剧本) --- */
      async function runPresenceLoop() {
        const notif = document.getElementById('c1-notif');
        const shield = document.getElementById('c1-shield');
        if(!notif || !shield) return;
        
        while(true) {
          // Scene 1: 正常工作
          notif.style.opacity = '0'; notif.style.transform = 'translateX(20px)';
          shield.style.opacity = '0';
          await new Promise(r => setTimeout(r, 3000));
          
          // Scene 2: 弹窗提醒发现旁观者
          notif.style.opacity = '1'; notif.style.transform = 'translateX(0)';
          await new Promise(r => setTimeout(r, 4000));
          notif.style.opacity = '0'; notif.style.transform = 'translateX(20px)';
          await new Promise(r => setTimeout(r, 1000));
          
          // Scene 3: 主人离席，下落隐私遮罩
          shield.style.opacity = '1';
          await new Promise(r => setTimeout(r, 3500));
        }
      }
      runPresenceLoop();

      /* --- 5. Card 02: 多屏追踪 (全自动循环剧本) --- */
      async function runTrackingLoop() {
        const cursor = document.getElementById('c2-cursor');
        const monA = document.getElementById('c2-mon-a');
        const monB = document.getElementById('c2-mon-b');
        const labelA = document.getElementById('c2-label-a');
        const labelB = document.getElementById('c2-label-b');
        if(!cursor) return;
        
        const focusColor = '#2a9cc4';
        const blurColor = '#1f2937';
        
        while(true) {
          // Scene 1: 视线聚焦屏幕 A
          monA.style.borderColor = focusColor; labelA.style.color = focusColor; labelA.textContent = 'Display A (Focused)';
          monB.style.borderColor = blurColor; labelB.style.color = '#6b7280'; labelB.textContent = 'Display B';
          cursor.style.left = '30%'; 
          await new Promise(r => setTimeout(r, 3000));
          
          // Scene 2: 视线转移到屏幕 B，光标延迟飞跃
          monA.style.borderColor = blurColor; labelA.style.color = '#6b7280'; labelA.textContent = 'Display A';
          monB.style.borderColor = focusColor; labelB.style.color = focusColor; labelB.textContent = 'Display B (Focused)';
          await new Promise(r => setTimeout(r, 600)); // 0.6s 后光标随动
          
          cursor.style.left = '70%';
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      runTrackingLoop();

      /* --- 6. Card 03: 手势识别 (全自动演示剧本) --- */
      let autoGestureEnabled = true;
      let currentGestureIndex = 0;
      
      // 用户干涉逻辑 (悬停暂停自动演示)
      gestureBtns.forEach(btn => {
        btn.addEventListener('mouseenter', () => autoGestureEnabled = false);
        btn.addEventListener('mouseleave', () => {
           autoGestureEnabled = true;
           currentGestureIndex = Array.from(gestureBtns).indexOf(btn); // 接着离开的按钮继续
        });
      });

      async function runGestureLoop() {
        if(gestureBtns.length === 0) return;
        while(true) {
          if (autoGestureEnabled) {
            gestureBtns[currentGestureIndex].click();
            currentGestureIndex = (currentGestureIndex + 1) % gestureBtns.length;
          }
          await new Promise(r => setTimeout(r, 3500)); // 每 3.5 秒演示一个
        }
      }
      runGestureLoop();

    });