// P6c: Voice 引擎 tabs（#voiceRecognizeSourceGrid）。
// 单一来源：legacy OneToneVoiceWake.buildVoiceEngineTabsModel。

export interface VoiceEngineTabItem {
  id: string;
  label: string;
  hidden: boolean;
}

export interface VoiceEngineTabsModel {
  activeTab: string;
  voskOnly: boolean;
  disabled: boolean;
  busy: boolean;
  tabs: VoiceEngineTabItem[];
  sig: string;
}

interface LegacyWake {
  buildVoiceEngineTabsModel?: () => VoiceEngineTabsModel;
}

const EMPTY: VoiceEngineTabsModel = {
  activeTab: 'vosk',
  voskOnly: false,
  disabled: false,
  busy: false,
  tabs: [
    { id: 'sapi', label: '系统兼容', hidden: false },
    { id: 'vosk', label: '本地识别', hidden: false },
    { id: 'kws', label: '快速口令', hidden: false },
  ],
  sig: 'empty',
};

function legacyWake(): LegacyWake {
  return (window as unknown as { OneToneVoiceWake?: LegacyWake }).OneToneVoiceWake ?? {};
}

export function voiceEngineTabsReady(): boolean {
  return typeof legacyWake().buildVoiceEngineTabsModel === 'function';
}

export function buildVoiceEngineTabsModel(): VoiceEngineTabsModel {
  const api = legacyWake();
  if (!api.buildVoiceEngineTabsModel) return EMPTY;
  try {
    return api.buildVoiceEngineTabsModel();
  } catch (err) {
    console.error('[islands] buildVoiceEngineTabsModel failed', err);
    return EMPTY;
  }
}

export function voiceEngineTabsSignature(model: VoiceEngineTabsModel): string {
  return model.sig || `${model.activeTab}\0${model.disabled}\0${model.voskOnly}`;
}

/** 不重挂按钮：只写 active/hidden/disabled（grid 上仍有 legacy 委托）。 */
export function applyVoiceEngineTabsHosts(model: VoiceEngineTabsModel): void {
  const grid = document.getElementById('voiceRecognizeSourceGrid');
  if (!grid) return;
  grid.querySelectorAll('[data-voice-engine-tab]').forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const tab = el.getAttribute('data-voice-engine-tab') || '';
    const on = tab === model.activeTab;
    el.classList.toggle('is-active', on);
    el.disabled = !!model.disabled;
    el.setAttribute('aria-busy', model.busy ? 'true' : 'false');
    if (tab === 'sapi') el.hidden = !!model.voskOnly;
    else el.hidden = false;
  });
}
