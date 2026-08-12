// P6b: Voice 状态栏 chrome。
// 单一来源：legacy OneToneVoicePageHeaderRender.buildVoiceStatusChromeModel。

export interface VoiceStatusChromeModel {
  brandTitle: string;
  schemeName: string;
  statusText: string;
  statusCls: string;
  activeHintText: string;
  activeHintHidden: boolean;
  engineLbl: string;
  engineVal: string;
  scopeLbl: string;
  scopeVal: string;
  centerHidden: boolean;
  switchHidden: boolean;
  voiceOn: boolean;
  toggleTitle: string;
  loading: boolean;
  mode: string;
  sig: string;
}

interface LegacyHeader {
  buildVoiceStatusChromeModel?: (vm?: unknown) => VoiceStatusChromeModel;
}

const EMPTY: VoiceStatusChromeModel = {
  brandTitle: '',
  schemeName: '—',
  statusText: '—',
  statusCls: 'keys-scheme-summary-pill voice-scheme-summary-pill',
  activeHintText: '',
  activeHintHidden: true,
  engineLbl: '',
  engineVal: '—',
  scopeLbl: '',
  scopeVal: '—',
  centerHidden: false,
  switchHidden: false,
  voiceOn: false,
  toggleTitle: '',
  loading: false,
  mode: '',
  sig: 'empty',
};

function legacyHeader(): LegacyHeader {
  return (
    (window as unknown as { OneToneVoicePageHeaderRender?: LegacyHeader }).OneToneVoicePageHeaderRender ??
    {}
  );
}

export function voiceStatusChromeReady(): boolean {
  return typeof legacyHeader().buildVoiceStatusChromeModel === 'function';
}

export function buildVoiceStatusChromeModel(): VoiceStatusChromeModel {
  const api = legacyHeader();
  if (!api.buildVoiceStatusChromeModel) return EMPTY;
  try {
    return api.buildVoiceStatusChromeModel();
  } catch (err) {
    console.error('[islands] buildVoiceStatusChromeModel failed', err);
    return EMPTY;
  }
}

export function voiceStatusChromeSignature(model: VoiceStatusChromeModel): string {
  return model.sig || `${model.statusText}\0${model.engineVal}\0${model.scopeVal}\0${model.voiceOn}`;
}

export function applyVoiceStatusChromeHosts(model: VoiceStatusChromeModel): void {
  const brandTitle = document.getElementById('voicePageBrandTitle');
  const schemeName = document.getElementById('voiceSummaryName');
  const statusEl = document.getElementById('voiceSummaryStatus');
  const engineLbl = document.getElementById('voiceSummaryEngineLbl');
  const engineVal = document.getElementById('voiceSummaryEngine');
  const engineSwitch = document.getElementById('voiceSummaryEngineSwitch');
  const scopeLbl = document.getElementById('voiceSummaryScopeLbl');
  const scopeVal = document.getElementById('voiceSummaryScope');
  const centerCluster = document.getElementById('voiceStatusCenterCluster');

  if (brandTitle) brandTitle.textContent = model.brandTitle || '';
  if (schemeName) schemeName.textContent = model.schemeName || '';
  if (statusEl) {
    statusEl.className = model.statusCls || 'keys-scheme-summary-pill voice-scheme-summary-pill';
  }
  const activeHint = document.getElementById('voiceActiveHint');
  if (activeHint) {
    activeHint.textContent = model.activeHintText || '';
    activeHint.hidden = !!model.activeHintHidden;
  }
  if (engineLbl) engineLbl.textContent = model.engineLbl || '';
  if (engineVal) engineVal.textContent = model.engineVal || '—';
  if (scopeLbl) scopeLbl.textContent = model.scopeLbl || '';
  if (scopeVal) scopeVal.textContent = model.scopeVal || '—';
  if (engineSwitch) engineSwitch.hidden = !!model.switchHidden;
  if (centerCluster) centerCluster.hidden = !!model.centerHidden;

  const enabledToggle = document.getElementById('btnVoiceEnabled');
  if (enabledToggle) {
    enabledToggle.classList.toggle('is-on', !!model.voiceOn);
    enabledToggle.setAttribute('aria-checked', model.voiceOn ? 'true' : 'false');
    enabledToggle.title = model.toggleTitle || '';
    enabledToggle.setAttribute('aria-label', model.toggleTitle || '');
  }
}
