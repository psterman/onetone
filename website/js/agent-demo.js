function bootAgentDemo() {
      /* 1. Hero 3D Parallax Tilt */
      const hudWrap = document.getElementById('hudWrap');
      const hudDeck = document.getElementById('hudDeck');

      if (hudWrap && hudDeck && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        hudWrap.addEventListener('mousemove', (e) => {
          const rect = hudWrap.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const y = e.clientY - rect.top - rect.height / 2;
          
          const rotateX = (-y / rect.height) * 12;
          const rotateY = (x / rect.width) * 12;

          hudDeck.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
          hudDeck.style.boxShadow = `${-rotateY * 2}px ${rotateX * 2 + 30}px 60px rgba(0,0,0,0.9)`;
        });

        hudWrap.addEventListener('mouseleave', () => {
          hudDeck.style.transform = `rotateX(0deg) rotateY(0deg) scale(1)`;
          hudDeck.style.boxShadow = ``;
        });
      }

      /* 2. Full Deck <-> Mini Bar — auto demo via data-pad-mode */
      const padDemo = document.getElementById('pad-demo');
      const btnToggleMiniIcon = document.getElementById('btn-toggle-mini-icon');
      const btnToggleFullIcon = document.getElementById('btn-toggle-full-icon');

      function padMode() {
        return padDemo ? padDemo.getAttribute('data-pad-mode') : 'full';
      }
      function switchMode(toMini) {
        if (!padDemo) return;
        padDemo.setAttribute('data-pad-mode', toMini ? 'mini' : 'full');
      }

      btnToggleMiniIcon?.addEventListener('click', () => switchMode(true));
      btnToggleFullIcon?.addEventListener('click', () => switchMode(false));

      if (padDemo) {
        switchMode(false);
        window.setInterval(function () {
          switchMode(padMode() !== 'mini');
        }, 2500);
      }

      /* 3. Voice Command Simulator Logic */
      const voiceChips = document.querySelectorAll('#voice-chip-group button');
      const simCodeText = document.getElementById('sim-code-text');
      const simToast = document.getElementById('sim-toast');
      const simToastWord = document.getElementById('sim-toast-word');

      const voiceCodeMap = {
        '继续': 'function computeNextToken() { return model.generate(); }',
        '发送': 'git commit -m "feat: integrate Codex Micro HUD" && git push',
        '新建': 'const newSession = await agent.createSession({ provider: "Cursor" });',
        '取消': '// 听写已取消 · 已清空当前输入缓冲区'
      };

      voiceChips.forEach(chip => {
        chip.addEventListener('click', () => {
          voiceChips.forEach(c => c.classList.remove('is-active', 'bg-mac-accent/20', 'border-mac-accent'));
          chip.classList.add('is-active', 'bg-mac-accent/20', 'border-mac-accent');

          const word = chip.dataset.voice;
          triggerVoiceWord(word);
        });
      });

      function triggerVoiceWord(word) {
        if (!simCodeText) return;
        simCodeText.textContent = voiceCodeMap[word] || '// 执行完成';
        simToastWord.textContent = word;
        
        simToast.style.opacity = '1';
        setTimeout(() => {
          simToast.style.opacity = '0';
        }, 2000);
      }

      /* 4. Real Physical Numpad Keyboard Listener */
      const physicalKeys = document.querySelectorAll('#physical-numpad [data-np]');
      const virtualKeys = document.querySelectorAll('#key-matrix [data-numpad]');
      const numpadLog = document.getElementById('numpad-log');

      document.addEventListener('keydown', (e) => {
        const code = e.code; // e.g. "Numpad1", "NumpadEnter", "NumLock"
        
        // Match Physical Numpad Key
        const physKey = document.querySelector(`#physical-numpad [data-np="${code}"]`);
        const virtKey = document.querySelector(`#key-matrix [data-numpad="${code}"]`);

        if (physKey || virtKey) {
          if (physKey) {
            physKey.classList.add('bg-mac-accent', 'text-black', 'scale-95');
            setTimeout(() => physKey.classList.remove('bg-mac-accent', 'text-black', 'scale-95'), 200);
          }

          if (virtKey) {
            virtKey.classList.add('is-pressed');
            setTimeout(() => virtKey.classList.remove('is-pressed'), 250);
          }

          if (numpadLog) {
            numpadLog.innerHTML = `[NUMPAD EVENT] 按键: <strong class="text-mac-accent">${code}</strong> <br>→ 已同步派发至 OneTone 虚拟键盘对应键位。`;
          }
        }
      });

      /* 5. Auto-Demo Cycle Routine */
      let autoIndex = 0;
      const voiceWords = ['继续', '发送', '新建', '取消'];
      setInterval(() => {
        const word = voiceWords[autoIndex % voiceWords.length];
        const chip = document.querySelector(`#voice-chip-group [data-voice="${word}"]`);
        if (chip) chip.click();
        autoIndex++;
      }, 3500);

      /* 6. Custom Shortcut Remapper Interactive Logic */
      const keyConfigs = {
        'Cursor': {
          'undo': { label: '[Num 8] 重置/撤销', action: 'undo', shortcut: 'Ctrl + Shift + Backspace', voice: '撤销, 重新来', log: '按 [Num 8] -> 派发 [Ctrl + Shift + Backspace] 到 Cursor。' },
          'send': { label: '[Num 5] 发送消息', action: 'send', shortcut: 'Ctrl + Enter', voice: '发送, 提交', log: '按 [Num 5] -> 派发 [Ctrl + Enter] 到 Cursor Prompt 框。' },
          'mic': { label: '[Num 0] 麦克风', action: 'toggle_mic', shortcut: 'Ctrl + Shift + M', voice: '麦克风, 听写', log: '按 [Num 0] -> 唤醒 Cursor 原生 Voice 语音模式。' },
          'submit': { label: '[Num Enter] 新建/提交', action: 'new_chat', shortcut: 'Ctrl + L', voice: '新建, 新会话', log: '按 [Num Enter] -> 打开 Cursor Composer 窗口。' }
        },
        'Claude': {
          'undo': { label: '[Num 8] 重置/撤销', action: 'undo', shortcut: 'Escape + Escape', voice: '取消, 停止', log: '按 [Num 8] -> 派发 [Esc] 终止 Claude Code 命令行任务。' },
          'send': { label: '[Num 5] 发送消息', action: 'send', shortcut: 'Enter', voice: '发送, 运行', log: '按 [Num 5] -> 向 Terminal 提交用户指令。' },
          'mic': { label: '[Num 0] 麦克风', action: 'toggle_mic', shortcut: 'Alt + V', voice: '讲话, 口令', log: '按 [Num 0] -> 启动 Claude Code 语音收音模式。' },
          'submit': { label: '[Num Enter] 新建/提交', action: 'new_chat', shortcut: 'Ctrl + C', voice: '中断, 清空', log: '按 [Num Enter] -> 发送 SIGINT 中断并开辟新环境。' }
        },
        'Trae': {
          'undo': { label: '[Num 8] 重置/撤销', action: 'undo', shortcut: 'Ctrl + Z', voice: '撤回', log: '按 [Num 8] -> 派发 [Ctrl + Z] 回退 Trae AI 编辑。' },
          'send': { label: '[Num 5] 发送消息', action: 'send', shortcut: 'Ctrl + Enter', voice: '发送', log: '按 [Num 5] -> 派发 [Ctrl + Enter] 到 Trae 侧边栏。' },
          'mic': { label: '[Num 0] 麦克风', action: 'toggle_mic', shortcut: 'Ctrl + M', voice: '麦克风', log: '按 [Num 0] -> 开启 Trae 语音录入。' },
          'submit': { label: '[Num Enter] 新建/提交', action: 'new_chat', shortcut: 'Ctrl + Shift + N', voice: '新建', log: '按 [Num Enter] -> 新建 Trae 会话。' }
        }
      };

      let activeAgent = 'Cursor';
      let activeSelectedKey = 'undo';

      const agentPresetBtns = document.querySelectorAll('#agent-remap-preset button');
      const keyPickerBtns = document.querySelectorAll('#custom-key-picker button');
      const selectedKeyLabel = document.getElementById('selected-key-label');
      const cfgPanelTitle = document.getElementById('cfg-panel-title');
      const cfgActionClass = document.getElementById('cfg-action-class');
      const cfgShortcutInput = document.getElementById('cfg-shortcut-input');
      const cfgVoiceAlias = document.getElementById('cfg-voice-alias');
      const cfgTestLog = document.getElementById('cfg-test-log');
      const btnRecordKey = document.getElementById('btn-record-key');
      const btnTestDispatch = document.getElementById('btn-test-dispatch');

      function updateRemapPanel() {
        const agentData = keyConfigs[activeAgent] || keyConfigs['Cursor'];
        const cfg = agentData[activeSelectedKey] || {
          label: `[Key ${activeSelectedKey}]`,
          action: 'send',
          shortcut: 'Ctrl + Alt + K',
          voice: '执行, 触发',
          log: `[CUSTOM] 按 [${activeSelectedKey}] -> 派发 [Ctrl + Alt + K] 到 ${activeAgent}。`
        };

        if (selectedKeyLabel) selectedKeyLabel.textContent = `当前选中: ${cfg.label}`;
        if (cfgPanelTitle) cfgPanelTitle.textContent = `${activeAgent} 模式下 ${cfg.label} 映射参数`;
        if (cfgActionClass) cfgActionClass.value = cfg.action;
        if (cfgShortcutInput) cfgShortcutInput.value = cfg.shortcut;
        if (cfgVoiceAlias) cfgVoiceAlias.value = cfg.voice;
        if (cfgTestLog) cfgTestLog.textContent = cfg.log;
      }

      agentPresetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          agentPresetBtns.forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          activeAgent = btn.dataset.agentPreset;
          updateRemapPanel();
        });
      });

      keyPickerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          keyPickerBtns.forEach(b => b.classList.remove('is-picked'));
          btn.classList.add('is-picked');
          activeSelectedKey = btn.dataset.pickerKey;
          updateRemapPanel();
        });
      });

      btnRecordKey?.addEventListener('click', () => {
        if (!cfgShortcutInput || !cfgTestLog) return;
        cfgShortcutInput.value = "等待录制中...";
        cfgTestLog.innerHTML = `<span class="text-mac-accent">请在键盘上按下新的组合键（如 Ctrl + Shift + L）...</span>`;
        
        setTimeout(() => {
          cfgShortcutInput.value = "Ctrl + Alt + Shift + C";
          cfgTestLog.innerHTML = `<span class="text-emerald-400">[SUCCESS] 成功录制全新快捷键: Ctrl + Alt + Shift + C！</span>`;
        }, 1500);
      });

      btnTestDispatch?.addEventListener('click', () => {
        if (!cfgTestLog) return;
        const orig = cfgTestLog.innerHTML;
        cfgTestLog.innerHTML = `<span class="text-mac-accent animate-pulse">⚡ [DISPATCHING] 派发指令至 ${activeAgent} IDE 窗口...</span>`;
        setTimeout(() => {
          cfgTestLog.innerHTML = `<span class="text-emerald-400">✓ [SUCCESS] ${activeAgent} 响应成功，代码动作已自动完成！</span>`;
          setTimeout(() => cfgTestLog.innerHTML = orig, 2500);
        }, 800);
      });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAgentDemo);
} else {
  bootAgentDemo();
}
