// P12b-4: 映射浮动菜单。
// 单一来源：legacy OneToneMappingTrashMenu.buildMapMenuFloatModel。

export interface MapMenuFloatDisabled {
  test: boolean;
  dup: boolean;
  up: boolean;
  down: boolean;
  del: boolean;
}

export interface MapMenuFloatLabels {
  test: string;
  dup: string;
  up: string;
  down: string;
  del: string;
}

export interface MapMenuFloatModel {
  open: boolean;
  id: string;
  left: number;
  top: number;
  disabled: MapMenuFloatDisabled;
  labels: MapMenuFloatLabels;
  sig: string;
}

export type MapMenuAct = 'test' | 'dup' | 'up' | 'down' | 'del';

interface LegacyTrashMenu {
  buildMapMenuFloatModel?: () => MapMenuFloatModel;
  runMenuAct?: (act: MapMenuAct | string) => void;
}

const EMPTY_LABELS: MapMenuFloatLabels = {
  test: '',
  dup: '',
  up: '',
  down: '',
  del: '',
};

const EMPTY: MapMenuFloatModel = {
  open: false,
  id: '',
  left: 0,
  top: 0,
  disabled: { test: true, dup: true, up: true, down: true, del: true },
  labels: EMPTY_LABELS,
  sig: 'closed',
};

function legacyMenu(): LegacyTrashMenu {
  return (
    (window as unknown as { OneToneMappingTrashMenu?: LegacyTrashMenu }).OneToneMappingTrashMenu ??
    {}
  );
}

export function mapMenuFloatReady(): boolean {
  return typeof legacyMenu().buildMapMenuFloatModel === 'function';
}

export function buildMapMenuFloatModel(): MapMenuFloatModel {
  const api = legacyMenu();
  if (!api.buildMapMenuFloatModel) return EMPTY;
  try {
    return api.buildMapMenuFloatModel();
  } catch (err) {
    console.error('[islands] buildMapMenuFloatModel failed', err);
    return EMPTY;
  }
}

export function mapMenuFloatSignature(model: MapMenuFloatModel): string {
  return (
    model.sig ||
    [
      model.open ? '1' : '0',
      model.id,
      model.left,
      model.top,
      model.disabled.test,
      model.disabled.dup,
      model.disabled.up,
      model.disabled.down,
      model.disabled.del,
      model.labels.test,
      model.labels.dup,
      model.labels.up,
      model.labels.down,
      model.labels.del,
    ].join('|')
  );
}

export function runMapMenuAct(act: MapMenuAct): void {
  const fn = legacyMenu().runMenuAct;
  if (typeof fn === 'function') fn(act);
}
