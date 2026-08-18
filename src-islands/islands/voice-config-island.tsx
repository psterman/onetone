import * as React from 'react';
import { cn } from '../lib/utils';
import { useIslandRefresh } from '../island-runtime';
import * as vc from '../domain/voiceConfig';

function toast(msg: string): void {
  const ui = (window as unknown as { OneToneUi?: { toast?: (m: string) => void } }).OneToneUi;
  if (ui && typeof ui.toast === 'function') ui.toast(msg);
  else console.log('[voice-config-island]', msg);
}

const STRATEGIES: { key: string; label: string }[] = [
  { key: 'auto', label: '自动' },
  { key: 'resourceSaver', label: '省电' },
  { key: 'enhanced', label: '增强' },
];

function getWakeApi(): {
  switchListeningStrategy?: (s: string, opts?: { toastKind?: string }) => void;
  isModeSwitchPending?: () => boolean;
  isOpenClickGuarded?: () => boolean;
} | undefined {
  return (window as unknown as { OneToneVoiceWake?: {
    switchListeningStrategy?: (s: string, opts?: { toastKind?: string }) => void;
    isModeSwitchPending?: () => boolean;
    isOpenClickGuarded?: () => boolean;
  } }).OneToneVoiceWake;
}

function StrategySelector(): JSX.Element {
  const [strategy, setStrategy] = React.useState<string>(() => vc.getListeningStrategy());
  const [busy, setBusy] = React.useState<boolean>(() => !!getWakeApi()?.isModeSwitchPending?.());
  useIslandRefresh(() => {
    setStrategy(vc.getListeningStrategy());
    setBusy(!!getWakeApi()?.isModeSwitchPending?.());
  });
  React.useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => {
      setBusy(!!getWakeApi()?.isModeSwitchPending?.());
    }, 200);
    return () => window.clearInterval(id);
  }, [busy]);

  const apply = async (key: string): Promise<void> => {
    const wake = getWakeApi();
    if (wake?.isModeSwitchPending?.()) return;
    if (wake?.isOpenClickGuarded?.()) return;
    setStrategy(key);
    setBusy(true);
    if (wake && typeof wake.switchListeningStrategy === 'function') {
      wake.switchListeningStrategy(key, { toastKind: 'lite' });
      return;
    }
    try {
      await vc.setListeningStrategy(key);
      const label = STRATEGIES.find((s) => s.key === key)?.label ?? key;
      toast('已保存监听策略：' + label);
    } catch {
      toast('保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ot-vc-block">
      <div className="ot-vc-label">监听策略 / 引擎</div>
      <div className="ot-vc-seg" role="group" aria-label="监听策略" aria-busy={busy ? 'true' : 'false'}>
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={cn('ot-vc-seg-btn', strategy === s.key ? 'is-active' : '')}
            aria-pressed={strategy === s.key}
            disabled={busy}
            onClick={() => apply(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** P6: listening strategy only — cancel/end phrase editors live in step 02 legacy UI. */
export function VoiceConfigIsland(): JSX.Element {
  return (
    <div className="ot-voice-config">
      <StrategySelector />
    </div>
  );
}
