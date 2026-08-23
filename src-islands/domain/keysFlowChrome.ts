// P12c-1: Keys flow nodes / hints chrome。
// 单一来源：legacy OneToneKeysPageNav.buildKeysFlowChromeModel。

export interface KeysFlowChromeModel {
  activeStep: string;
  recordingMode: string;
  ipcPhase?: string;
  recording?: boolean;
  triggerHint: string;
  targetHint: string;
  finishHint: string;
  sig: string;
}

interface LegacyNav {
  buildKeysFlowChromeModel?: () => KeysFlowChromeModel;
}

const EMPTY: KeysFlowChromeModel = {
  activeStep: 'trigger',
  recordingMode: 'none',
  triggerHint: '',
  targetHint: '',
  finishHint: '',
  sig: 'empty',
};

const FLOW_NODE_IDS: Record<string, { btn: string; hint: string }> = {
  trigger: { btn: 'keysFlowNodeTrigger', hint: 'keysFlowNodeTriggerHint' },
  target: { btn: 'keysFlowNodeTarget', hint: 'keysFlowNodeTargetHint' },
};

function legacyNav(): LegacyNav {
  return (window as unknown as { OneToneKeysPageNav?: LegacyNav }).OneToneKeysPageNav ?? {};
}

export function keysFlowChromeReady(): boolean {
  return typeof legacyNav().buildKeysFlowChromeModel === 'function';
}

export function buildKeysFlowChromeModel(): KeysFlowChromeModel {
  const api = legacyNav();
  if (!api.buildKeysFlowChromeModel) return EMPTY;
  try {
    return api.buildKeysFlowChromeModel();
  } catch (err) {
    console.error('[islands] buildKeysFlowChromeModel failed', err);
    return EMPTY;
  }
}

export function keysFlowChromeSignature(model: KeysFlowChromeModel): string {
  return (
    model.sig ||
    `${model.activeStep}\0${model.recordingMode}\0${model.ipcPhase || ''}\0${model.triggerHint}\0${model.targetHint}\0${model.finishHint}`
  );
}

export function applyKeysFlowChromeHosts(model: KeysFlowChromeModel): void {
  const mode = model.recordingMode || 'none';
  const recording =
    typeof model.recording === 'boolean'
      ? model.recording
      : mode === 'trigger' || mode === 'target' || mode === 'agentBinding';
  (['trigger', 'target'] as const).forEach((page) => {
    const meta = FLOW_NODE_IDS[page];
    if (!meta) return;
    const btn = document.getElementById(meta.btn);
    if (btn) {
      const on = page === model.activeStep;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.classList.toggle(
        'is-recording',
        !!recording && (mode === page || (page === 'target' && mode === 'agentBinding')),
      );
    }
    // trigger hint 由 React 拥有；其余 hint 由 apply 写
    if (page === 'trigger') return;
    const hintEl = document.getElementById(meta.hint);
    if (hintEl) {
      const key = `${page}Hint` as 'targetHint' | 'finishHint';
      hintEl.textContent = model[key] || '';
    }
  });
}
