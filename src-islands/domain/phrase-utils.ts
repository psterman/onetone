// Pure phrase utilities for voice config islands.
// Kept free of any browser/DOM/OneTone dependency so it can be unit-tested in node.
// Mirrors the sanitization rules found in the legacy
// src/js/features/voice/voice-settings-view-model.js `sanitizePhrase*`.

const NOISE_RE = /^[\?？.\-_]+$/;

/** Normalize a loose value into a clean, de-duplicated phrase list (case-insensitive dedup). */
export function normalizePhraseList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = String(raw ?? '').trim();
    if (!s) continue;
    if (NOISE_RE.test(s)) continue;
    if (s === '[unk]' || s === '[UNK]') continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Merge zh + en phrase arrays into a single display list (zh first). */
export function mergeZhEn(zh: unknown, en: unknown): string[] {
  return normalizePhraseList(zh).concat(normalizePhraseList(en));
}

/** Add a phrase unless it is empty/duplicate (case-insensitive). Returns a new array. */
export function addPhrase(list: string[], phrase: string): string[] {
  const p = String(phrase ?? '').trim();
  if (!p) return list.slice();
  const lower = p.toLowerCase();
  if (list.some((x) => x.toLowerCase() === lower)) return list.slice();
  return list.concat([p]);
}

/** Remove every case-insensitive match of `phrase`. Returns a new array. */
export function removePhrase(list: string[], phrase: string): string[] {
  const p = String(phrase ?? '').trim().toLowerCase();
  if (!p) return list.slice();
  return list.filter((x) => x.toLowerCase() !== p);
}
