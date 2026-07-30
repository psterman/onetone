// P14c: SoftPad 功能瓷砖宿主。
// 单一来源：legacy OneToneSoftPadHub.buildSoftPadFuncTilesModel。

export interface SoftPadFuncTilesModel {
  tilesHtml: string;
  hidden: boolean;
  ariaLabel: string;
  mappingId: string;
  view: string;
  ready: boolean;
  sig: string;
}

interface LegacySoftPadHub {
  buildSoftPadFuncTilesModel?: () => SoftPadFuncTilesModel;
}

const EMPTY: SoftPadFuncTilesModel = {
  tilesHtml: '',
  hidden: true,
  ariaLabel: '',
  mappingId: '',
  view: 'hub',
  ready: false,
  sig: 'empty',
};

function legacyHub(): LegacySoftPadHub {
  return (
    (window as unknown as { OneToneSoftPadHub?: LegacySoftPadHub }).OneToneSoftPadHub ?? {}
  );
}

export function softPadFuncTilesReady(): boolean {
  return typeof legacyHub().buildSoftPadFuncTilesModel === 'function';
}

export function buildSoftPadFuncTilesModel(): SoftPadFuncTilesModel {
  const api = legacyHub();
  if (!api.buildSoftPadFuncTilesModel) return EMPTY;
  try {
    return api.buildSoftPadFuncTilesModel();
  } catch (err) {
    console.error('[islands] buildSoftPadFuncTilesModel failed', err);
    return EMPTY;
  }
}

export function softPadFuncTilesSignature(model: SoftPadFuncTilesModel): string {
  return model.sig || `${model.mappingId}\0${model.view}\0${model.hidden}\0${model.ready}`;
}
