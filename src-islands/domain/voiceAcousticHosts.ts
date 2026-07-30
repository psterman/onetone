// P6e: Voice 声学三宿主 paint-target handoff。
// React 拥有外壳；legacy paint 写入 [data-voice-acoustic-paint]。不重写 MediaRecorder。

export const VOICE_ACOUSTIC_HOST_IDS = [
  'voiceWakeAcousticHost',
  'voiceCancelAcousticHost',
  'voiceEndAcousticHost',
] as const;

export type VoiceAcousticHostId = (typeof VOICE_ACOUSTIC_HOST_IDS)[number];

let acousticMountCount = 0;

type Win = Window & {
  __otVoiceAcousticMounted?: boolean;
  __otVoiceAcousticSync?: () => void;
};

function win(): Win {
  return window as Win;
}

export function resolveVoiceAcousticPaintHost(hostId: string): HTMLElement | null {
  const outer = document.getElementById(hostId);
  if (!outer) return null;
  const paint = outer.querySelector('[data-voice-acoustic-paint]') as HTMLElement | null;
  return paint || outer;
}

export function bumpVoiceAcousticMount(delta: 1 | -1): void {
  acousticMountCount = Math.max(0, acousticMountCount + delta);
  const w = win();
  w.__otVoiceAcousticMounted = acousticMountCount > 0;
  if (!w.__otVoiceAcousticMounted) w.__otVoiceAcousticSync = undefined;
}

export function isVoiceAcousticMounted(): boolean {
  return acousticMountCount > 0 || !!win().__otVoiceAcousticMounted;
}

/** 岛挂载后触发各角色 paint（业务仍走 legacy）。 */
export function refreshVoiceAcousticPaint(): void {
  const wake = (window as unknown as { OneToneVoiceWakeAcoustic?: { render?: () => void } })
    .OneToneVoiceWakeAcoustic;
  const control = (
    window as unknown as {
      OneToneVoiceControlAcoustic?: { render?: (role?: string) => void };
    }
  ).OneToneVoiceControlAcoustic;
  try {
    wake?.render?.();
  } catch (err) {
    console.error('[islands] voice wake acoustic render failed', err);
  }
  try {
    control?.render?.('cancel');
  } catch (err) {
    console.error('[islands] voice cancel acoustic render failed', err);
  }
  try {
    control?.render?.('end');
  } catch (err) {
    console.error('[islands] voice end acoustic render failed', err);
  }
}

export function ensureVoiceAcousticBridge(): void {
  const w = win();
  w.__otVoiceAcousticSync = () => {
    refreshVoiceAcousticPaint();
  };
  if (acousticMountCount > 0) w.__otVoiceAcousticMounted = true;
}
