// P12c-6: triggerDisplay/targetDisplay empty/icon/recording/trace chrome。
// 单一来源：legacy OneToneMappingList.buildKeysDisplayChromeModel。
// 文案仍归 P12b-1 #triggerView/#targetView。

export interface KeysDisplayChromeModel {
  triggerEmpty: boolean;
  targetEmpty: boolean;
  triggerRaw: string;
  targetRaw: string;
  triggerRecording: boolean;
  targetRecording: boolean;
  traceText: string;
  traceShow: boolean;
  mappingId: string;
  recMode: string;
  sig: string;
}

interface LegacyMappingList {
  buildKeysDisplayChromeModel?: () => KeysDisplayChromeModel;
}

const EMPTY: KeysDisplayChromeModel = {
  triggerEmpty: true,
  targetEmpty: true,
  triggerRaw: '',
  targetRaw: '',
  triggerRecording: false,
  targetRecording: false,
  traceText: '',
  traceShow: false,
  mappingId: '',
  recMode: 'none',
  sig: 'empty',
};

function legacyList(): LegacyMappingList {
  return (
    (window as unknown as { OneToneMappingList?: LegacyMappingList }).OneToneMappingList ?? {}
  );
}

export function keysDisplayChromeReady(): boolean {
  return typeof legacyList().buildKeysDisplayChromeModel === 'function';
}

export function buildKeysDisplayChromeModel(): KeysDisplayChromeModel {
  const api = legacyList();
  if (!api.buildKeysDisplayChromeModel) return EMPTY;
  try {
    return api.buildKeysDisplayChromeModel();
  } catch (err) {
    console.error('[islands] buildKeysDisplayChromeModel failed', err);
    return EMPTY;
  }
}

export function keysDisplayChromeSignature(model: KeysDisplayChromeModel): string {
  return model.sig || `${model.mappingId}\0${model.recMode}\0${model.triggerRaw}\0${model.targetRaw}`;
}

type KeyIconsApi = {
  syncDisplayIcon?: (el: HTMLElement, key: string) => void;
};

export function applyKeysDisplayChromeHosts(model: KeysDisplayChromeModel): void {
  const triggerDisp = document.getElementById('triggerDisplay');
  const targetDisp = document.getElementById('targetDisplay');
  const icons = (window as unknown as { OneToneKeyIcons?: KeyIconsApi }).OneToneKeyIcons;

  if (triggerDisp) {
    triggerDisp.classList.toggle('empty', !!model.triggerEmpty);
    triggerDisp.classList.toggle('is-recording', !!model.triggerRecording);
    if (icons?.syncDisplayIcon) icons.syncDisplayIcon(triggerDisp, model.triggerRaw || '');
  }
  if (targetDisp) {
    targetDisp.classList.toggle('empty', !!model.targetEmpty);
    targetDisp.classList.toggle('is-recording', !!model.targetRecording);
  }
  // #triggerTrace 由 React 渲染文案；此处只写 show/hidden class
  const traceEl = document.getElementById('triggerTrace');
  if (traceEl) {
    if (model.traceShow) {
      traceEl.classList.add('show');
      traceEl.hidden = false;
    } else {
      traceEl.classList.remove('show');
      traceEl.hidden = true;
    }
  }
}
