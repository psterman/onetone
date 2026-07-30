// P12b-2: Keys 收尾 delay/cancel 时序宿主。
// 单一来源：legacy OneToneKeyFinishFlowRender.buildKeysFinishTimingModel。

export interface KeysFinishTimingModel {
  delayHtml: string;
  cancelHtml: string;
  delayHidden: boolean;
  cancelHidden: boolean;
  mappingId: string;
  finishMode: string;
  sig: string;
}

interface LegacyFinishRender {
  buildKeysFinishTimingModel?: () => KeysFinishTimingModel;
  syncAllTimingRanges?: (root?: HTMLElement | null) => void;
}

const EMPTY: KeysFinishTimingModel = {
  delayHtml: '',
  cancelHtml: '',
  delayHidden: true,
  cancelHidden: true,
  mappingId: '',
  finishMode: '',
  sig: '',
};

function legacyFinish(): LegacyFinishRender {
  return (
    (window as unknown as { OneToneKeyFinishFlowRender?: LegacyFinishRender }).OneToneKeyFinishFlowRender ??
    {}
  );
}

export function keysFinishTimingReady(): boolean {
  return typeof legacyFinish().buildKeysFinishTimingModel === 'function';
}

export function buildKeysFinishTimingModel(): KeysFinishTimingModel {
  const api = legacyFinish();
  if (!api.buildKeysFinishTimingModel) return EMPTY;
  try {
    return api.buildKeysFinishTimingModel();
  } catch (err) {
    console.error('[islands] buildKeysFinishTimingModel failed', err);
    return EMPTY;
  }
}

export function timingModelSignature(model: KeysFinishTimingModel): string {
  return model.sig || `${model.mappingId}\0${model.finishMode}\0${model.delayHidden}\0${model.cancelHidden}`;
}

export function afterTimingCommit(root: HTMLElement | null): void {
  const sync = legacyFinish().syncAllTimingRanges;
  if (typeof sync === 'function' && root) sync(root);
}
