/**
 * logging.ts
 *
 * Best-effort logging of recommendation sessions to Supabase.
 * Never throws — any failure is logged to stderr and swallowed so the
 * main request flow is not affected.
 */

import { supabase } from './supabase.ts';
import type { UserPreferences } from './types.ts';

/**
 * Insert one row into `recommendation_sessions`.
 *
 * Runs best-effort: catches all errors and logs to stderr.
 * Safe to call with `void` (fire-and-forget).
 */
export async function logRecommendationSession(
  prefs: UserPreferences,
  recommendedIds: number[],
): Promise<void> {
  try {
    const { error } = await supabase.from('recommendation_sessions').insert({
      preferences: prefs,
      recommended_ids: recommendedIds,
      anchor: prefs.anchor ?? null,
    });

    if (error) {
      console.error('[logging] Failed to insert recommendation_session:', error.message);
    }
  } catch (err) {
    console.error(
      '[logging] Unexpected error in logRecommendationSession:',
      err instanceof Error ? err.message : String(err),
    );
  }
}
