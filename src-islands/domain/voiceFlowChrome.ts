// P6d: Voice flow nodes / hints chrome。
// 单一来源：legacy OneToneVoicePageNav.buildVoiceFlowChromeModel。

export interface VoiceFlowChromeModel {
  activeStep: string;
  wakeHint: string;
  recognizeHint: string;
  sendHint: string;
  sig: string;
}

interface LegacyNav {
  buildVoiceFlowChromeModel?: () => VoiceFlowChromeModel;
}

const EMPTY: VoiceFlowChromeModel = {
  activeStep: 'wake',
  wakeHint: '',
  recognizeHint: '',
  sendHint: '',
  sig: 'empty',
};

const FLOW_NODE_IDS: Record<string, { btn: string; hint: string }> = {
  wake: { btn: 'voiceFlowNodeWake', hint: 'voiceFlowNodeWakeHint' },
  recognize: { btn: 'voiceFlowNodeRecognize', hint: 'voiceFlowNodeRecognizeHint' },
  send: { btn: 'voiceFlowNodeSend', hint: 'voiceFlowNodeSendHint' },
};

function legacyNav(): LegacyNav {
  return (window as unknown as { OneToneVoicePageNav?: LegacyNav }).OneToneVoicePageNav ?? {};
}

export function voiceFlowChromeReady(): boolean {
  return typeof legacyNav().buildVoiceFlowChromeModel === 'function';
}

export function buildVoiceFlowChromeModel(): VoiceFlowChromeModel {
  const api = legacyNav();
  if (!api.buildVoiceFlowChromeModel) return EMPTY;
  try {
    return api.buildVoiceFlowChromeModel();
  } catch (err) {
    console.error('[islands] buildVoiceFlowChromeModel failed', err);
    return EMPTY;
  }
}

export function voiceFlowChromeSignature(model: VoiceFlowChromeModel): string {
  return model.sig || `${model.activeStep}\0${model.wakeHint}\0${model.recognizeHint}\0${model.sendHint}`;
}

export function applyVoiceFlowChromeHosts(model: VoiceFlowChromeModel): void {
  (['wake', 'recognize', 'send'] as const).forEach((page) => {
    const meta = FLOW_NODE_IDS[page];
    if (!meta) return;
    const btn = document.getElementById(meta.btn);
    if (btn) {
      const on = page === model.activeStep;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    // #voiceFlowNodeWakeHint 由 React 渲染；其余 flow hint 由 apply 写
    if (page === 'wake') return;
    const hintEl = document.getElementById(meta.hint);
    if (hintEl) {
      const key = `${page}Hint` as 'recognizeHint' | 'sendHint';
      hintEl.textContent = model[key] || '';
    }
  });
  const wake = document.getElementById('voiceSubtabWakeHint');
  const rec = document.getElementById('voiceSubtabRecognizeHint');
  const send = document.getElementById('voiceSubtabSendHint');
  if (wake) wake.textContent = model.wakeHint || '';
  if (rec) rec.textContent = model.recognizeHint || '';
  if (send) send.textContent = model.sendHint || '';
}
