import { useEffect } from 'react';
import {
  bumpVoiceAcousticMount,
  ensureVoiceAcousticBridge,
  refreshVoiceAcousticPaint,
} from '../domain/voiceAcousticHosts';

// P6e: 声学宿主 paint-target。三宿主共用本组件；挂载点外层 id 由 main 指定。

export function VoiceAcousticHostIsland(): JSX.Element {
  useEffect(() => {
    bumpVoiceAcousticMount(1);
    ensureVoiceAcousticBridge();
    refreshVoiceAcousticPaint();
    return () => {
      bumpVoiceAcousticMount(-1);
    };
  }, []);

  return <div data-voice-acoustic-paint="" className="voice-acoustic-paint" />;
}

export function registerVoiceAcousticBridge(): void {
  ensureVoiceAcousticBridge();
}
