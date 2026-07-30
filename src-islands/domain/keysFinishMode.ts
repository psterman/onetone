// P12b-5: Keys 收尾模式分段宿主。
// 单一来源：legacy OneToneKeyFinishFlowRender.buildKeysFinishModeModel。

export interface KeysFinishModeModel {
  modeHtml: string;
  mappingId: string;
  finishMode: string;
  variant: string;
  sig: string;
}

interface LegacyFinishRender {
  buildKeysFinishModeModel?: () => KeysFinishModeModel;
}

const EMPTY: KeysFinishModeModel = {
  modeHtml: '',
  mappingId: '',
  finishMode: '',
  variant: 'empty',
  sig: 'empty',
};

function legacyFinish(): LegacyFinishRender {
  return (
    (window as unknown as { OneToneKeyFinishFlowRender?: LegacyFinishRender }).OneToneKeyFinishFlowRender ??
    {}
  );
}

export function keysFinishModeReady(): boolean {
  return typeof legacyFinish().buildKeysFinishModeModel === 'function';
}

export function buildKeysFinishModeModel(): KeysFinishModeModel {
  const api = legacyFinish();
  if (!api.buildKeysFinishModeModel) return EMPTY;
  try {
    return api.buildKeysFinishModeModel();
  } catch (err) {
    console.error('[islands] buildKeysFinishModeModel failed', err);
    return EMPTY;
  }
}

export function modeModelSignature(model: KeysFinishModeModel): string {
  return model.sig || `${model.mappingId}\0${model.finishMode}\0${model.variant}`;
}
