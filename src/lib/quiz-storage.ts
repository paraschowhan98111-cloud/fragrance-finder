import type { UserPreferences } from './types';

export function hashPreferences(prefs: UserPreferences): string {
  const normalized = JSON.stringify({
    anchor: prefs.anchor?.trim().toLowerCase() ?? null,
    occasion: prefs.occasion,
    season: prefs.season,
    gender: prefs.gender,
    budget_tier: prefs.budget_tier,
    dealbreakers: [...(prefs.dealbreakers ?? [])].sort(),
  });
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

const STORAGE_PREFIX = 'fragrance-app:';

export function savePrefs(hash: string, prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}prefs:${hash}`, JSON.stringify(prefs));
  } catch {
    // localStorage full or disabled
  }
}

export function loadPrefs(hash: string): UserPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}prefs:${hash}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveResults(hash: string, results: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}results:${hash}`, JSON.stringify(results));
  } catch {
    // Silently fail if storage is full
  }
}

export function loadResults(hash: string): unknown | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}results:${hash}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
