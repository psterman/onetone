// Voice configuration domain for React islands (P6).
//
// Single-source rule (see docs/migration-react-islands.md P6):
//   - Reads come from `OneToneState.state.config` (the legacy single source of truth).
//   - Writes update that same config object in place AND call the typed IPC command
//     the legacy code uses, then trigger `OneToneConfigPersist.saveAsync()` so the
//     change survives reload (mirrors legacy flushWakePhraseSave / voice-end.js).
//
// This module deliberately avoids forking any state into React; the island reads
// via these helpers and re-reads on every refresh.

import * as typed from '../ipc/typedIpc';
import { normalizePhraseList, mergeZhEn, addPhrase, removePhrase } from './phrase-utils';

type Engine = 'sapi' | 'vosk' | 'kws';

function w(): any {
  return window as unknown as any;
}

function getConfig(): any {
  return (w().OneToneState && w().OneToneState.state && w().OneToneState.state.config) || {};
}

/** Resolve the currently active voice engine (sapi/vosk/kws). Falls back to sapi. */
export function getActiveVoiceEngine(): Engine {
  try {
    const vm = w().OneToneVoiceSettingsViewModel?.build?.();
    const m = vm?.mode;
    if (m === 'vosk' || m === 'kws' || m === 'sapi') return m;
  } catch {
    /* view model may not be ready */
  }
  return 'sapi';
}

function engineKeys(eng: Engine): { camel: string; snake: string } {
  if (eng === 'vosk') return { camel: 'voiceVosk', snake: 'voice_vosk' };
  if (eng === 'kws') return { camel: 'voiceKws', snake: 'voice_kws' };
  return { camel: 'voiceSapi', snake: 'voice_sapi' };
}

function persistSoon(): void {
  const cp = w().OneToneConfigPersist;
  if (cp && typeof cp.saveAsync === 'function') cp.saveAsync();
  else if (cp && typeof cp.save === 'function') cp.save();
}

// ---------------------------------------------------------------------------
// Wake phrases (per engine: voiceSapi/Vosk/Kws.phrases)
// ---------------------------------------------------------------------------

export function getWakePhrases(): string[] {
  const cfg = getConfig();
  const { camel, snake } = engineKeys(getActiveVoiceEngine());
  const node = cfg[camel] || cfg[snake] || {};
  return normalizePhraseList(node.phrases);
}

export async function setWakePhrases(phrases: string[]): Promise<void> {
  const cfg = getConfig();
  const eng = getActiveVoiceEngine();
  const { camel, snake } = engineKeys(eng);
  const node = cfg[camel] || cfg[snake] || (cfg[camel] = {});
  node.phrases = phrases.slice();
  try {
    if (eng === 'sapi') await typed.setVoiceSapiPhrases(phrases);
    else if (eng === 'vosk') await typed.setVoiceVoskPhrases(phrases);
    else await typed.setVoiceKwsPhrases(phrases);
  } catch (err) {
    console.error('voiceConfig.setWakePhrases', err);
  }
  persistSoon();
}

// ---------------------------------------------------------------------------
// Cancel / End / Send phrases (voiceEnd.{cancelPhrasesZh/En, phrasesZh/En, ...})
// ---------------------------------------------------------------------------

function getVoiceEndNode(): any {
  const cfg = getConfig();
  return cfg.voiceEnd || cfg.voice_end || (cfg.voiceEnd = {});
}

function readZhEn(node: any, zhKey: string, enKey: string): { zh: string[]; en: string[] } {
  return {
    zh: normalizePhraseList(node[zhKey]),
    en: normalizePhraseList(node[enKey] || node[`${enKey.replace(/En$/, '_en')}`] || []),
  };
}

export function getCancelPhrases(): { zh: string[]; en: string[] } {
  return readZhEn(getVoiceEndNode(), 'cancelPhrasesZh', 'cancelPhrasesEn');
}
export function getEndPhrases(): { zh: string[]; en: string[] } {
  return readZhEn(getVoiceEndNode(), 'phrasesZh', 'phrasesEn');
}

/** Combined display list (zh first) for the cancel phrases tab. */
export function getCancelPhraseList(): string[] {
  const { zh, en } = getCancelPhrases();
  return mergeZhEn(zh, en);
}

/** Combined display list (zh first) for the end phrases tab. */
export function getEndPhraseList(): string[] {
  const { zh, en } = getEndPhrases();
  return mergeZhEn(zh, en);
}

export async function addCancelPhrase(phrase: string): Promise<void> {
  const c = getCancelPhrases();
  const zh = addPhrase(c.zh, phrase);
  const node = getVoiceEndNode();
  node.cancelPhrasesZh = zh;
  try {
    await typed.setVoiceEndCancelPhrases(zh, c.en);
  } catch (err) {
    console.error('voiceConfig.addCancelPhrase', err);
  }
  persistSoon();
}

export async function removeCancelPhrase(phrase: string): Promise<void> {
  const c = getCancelPhrases();
  let zh = removePhrase(c.zh, phrase);
  let en = c.en;
  if (zh.length === c.zh.length) en = removePhrase(c.en, phrase);
  const node = getVoiceEndNode();
  node.cancelPhrasesZh = zh;
  node.cancelPhrasesEn = en;
  try {
    await typed.setVoiceEndCancelPhrases(zh, en);
  } catch (err) {
    console.error('voiceConfig.removeCancelPhrase', err);
  }
  persistSoon();
}

export async function addEndPhrase(phrase: string): Promise<void> {
  const c = getEndPhrases();
  const zh = addPhrase(c.zh, phrase);
  const node = getVoiceEndNode();
  node.phrasesZh = zh;
  try {
    await typed.setVoiceEndPhrases(zh, c.en);
  } catch (err) {
    console.error('voiceConfig.addEndPhrase', err);
  }
  persistSoon();
}

export async function removeEndPhrase(phrase: string): Promise<void> {
  const c = getEndPhrases();
  let zh = removePhrase(c.zh, phrase);
  let en = c.en;
  if (zh.length === c.zh.length) en = removePhrase(c.en, phrase);
  const node = getVoiceEndNode();
  node.phrasesZh = zh;
  node.phrasesEn = en;
  try {
    await typed.setVoiceEndPhrases(zh, en);
  } catch (err) {
    console.error('voiceConfig.removeEndPhrase', err);
  }
  persistSoon();
}

// ---------------------------------------------------------------------------
// Listening strategy / engine selection
// ---------------------------------------------------------------------------

export type ListeningStrategy = 'auto' | 'resourceSaver' | 'enhanced' | 'off' | string;

export function getListeningStrategy(): string {
  const cfg = getConfig();
  return String(cfg.voiceListeningStrategy || cfg.voice_listening_strategy || 'auto');
}

export async function setListeningStrategy(strategy: string): Promise<void> {
  const cfg = getConfig();
  cfg.voiceListeningStrategy = strategy;
  if ('voice_listening_strategy' in cfg) cfg.voice_listening_strategy = strategy;
  persistSoon();
  try {
    await typed.setListeningStrategy(strategy);
  } catch (err) {
    console.error('voiceConfig.setListeningStrategy', err);
  }
}
