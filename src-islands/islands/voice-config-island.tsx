import * as React from 'react';
import { cn } from '../lib/utils';
import { useIslandRefresh } from '../island-runtime';
import * as vc from '../domain/voiceConfig';

function toast(msg: string): void {
  const ui = (window as unknown as { OneToneUi?: { toast?: (m: string) => void } }).OneToneUi;
  if (ui && typeof ui.toast === 'function') ui.toast(msg);
  else console.log('[voice-config-island]', msg);
}

function t(key: string, fb: string): string {
  const i18n = (window as unknown as { OneToneI18n?: { t?: (k: string, f?: string) => string } }).OneToneI18n;
  const v = i18n && typeof i18n.t === 'function' ? i18n.t(key, fb) : fb;
  return v && v !== key ? v : fb;
}

const STRATEGIES: { key: string; label: string }[] = [
  { key: 'auto', label: '自动' },
  { key: 'resourceSaver', label: '省电' },
  { key: 'enhanced', label: '增强' },
];

const ACTIVATIONS: { key: vc.VoiceActivation; labelKey: string; fb: string }[] = [
  { key: 'pushToTalk', labelKey: 'voiceActivationPushToTalk', fb: '按住快捷键说话（推荐）' },
  { key: 'softPad', labelKey: 'voiceActivationSoftPad', fb: '点击 SoftPad 开始/结束' },
  { key: 'wakeOrPushToTalk', labelKey: 'voiceActivationWakeOrPtt', fb: '唤醒词或按键' },
  { key: 'disabled', labelKey: 'voiceActivationDisabled', fb: '始终关闭' },
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

function ActivationSelector(): JSX.Element {
  const [mode, setMode] = React.useState<vc.VoiceActivation>(() => vc.getVoiceActivation());
  const [busy, setBusy] = React.useState(false);
  useIslandRefresh(() => {
    setMode(vc.getVoiceActivation());
  });

  const apply = async (key: vc.VoiceActivation): Promise<void> => {
    if (busy) return;
    setMode(key);
    setBusy(true);
    try {
      await vc.setVoiceActivation(key);
      toast(t('voiceActivationTitle', '语音启动方式') + '：' + t(
        ACTIVATIONS.find((a) => a.key === key)?.labelKey || '',
        ACTIVATIONS.find((a) => a.key === key)?.fb || key
      ));
    } catch {
      toast('保存失败，请重试');
      setMode(vc.getVoiceActivation());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ot-vc-block">
      <div className="ot-vc-label">{t('voiceActivationTitle', '语音启动方式')}</div>
      <div className="ot-vc-seg ot-vc-seg--stack" role="radiogroup" aria-label={t('voiceActivationTitle', '语音启动方式')} aria-busy={busy ? 'true' : 'false'}>
        {ACTIVATIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            className={cn('ot-vc-seg-btn', mode === a.key ? 'is-active' : '')}
            aria-checked={mode === a.key}
            disabled={busy}
            onClick={() => apply(a.key)}
          >
            {t(a.labelKey, a.fb)}
          </button>
        ))}
      </div>
    </div>
  );
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
      <div className="ot-vc-label">唤醒灵敏度 / 引擎</div>
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

/** P6: activation radios + wake extras only when wakeOrPushToTalk. */
export function VoiceConfigIsland(): JSX.Element {
  const [mode, setMode] = React.useState<vc.VoiceActivation>(() => vc.getVoiceActivation());
  useIslandRefresh(() => setMode(vc.getVoiceActivation()));
  const showWake = mode === 'wakeOrPushToTalk';

  return (
    <div className="ot-voice-config">
      <ActivationSelector />
      {showWake ? (
        <>
          <p className="ot-vc-hint">{t('voiceActivationWakePanelHint', '仅在「唤醒词或按键」时使用下方选项')}</p>
          <StrategySelector />
        </>
      ) : null}
    </div>
  );
}
