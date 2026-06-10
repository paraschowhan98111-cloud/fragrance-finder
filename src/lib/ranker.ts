/**
 * ranker.ts
 *
 * LLM reranker: takes the retrieval pipeline's candidates and produces a
 * curated shortlist of 3-5 personalised recommendations via Claude Sonnet 4.6.
 *
 * The module is intentionally stateless and makes a fresh API call every time.
 * Response caching (if needed) belongs in the route layer, not here.
 */

import { z } from 'zod';
import { anthropic, RANKER_MODEL } from './anthropic.ts';
import { RECOMMENDATION_SYSTEM_PROMPT, PROMPT_VERSION } from './prompts/recommendation.ts';
import type { RankerInput, RankerOutput, Candidate } from './types.ts';

// ── Zod validation schemas ────────────────────────────────────────────────────

export const PickSchema = z.object({
  fragrance_id: z.number(),
  rank: z.number().int().min(1).max(5),
  rationale: z.string().min(20).max(1200),
  key_notes: z.array(z.string()).min(1).max(8),
  what_to_expect: z.string().min(10).max(300),
  caveat: z.string().max(300).optional(),
});

export const ResultSchema = z.object({
  picks: z.array(PickSchema).min(1).max(5),
  explanation: z.string().min(20).max(1500),
});

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Strip markdown code fences that the model may wrap around its JSON output.
 * Mirrors the same logic used in scripts/enrichment/03_apply_results.js.
 */
function stripCodeFences(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return s.trim();
}

/** Format a single candidate for the user message payload. */
function formatCandidate(c: Candidate): string {
  const join = (arr: string[]) => (arr.length > 0 ? arr.join(', ') : 'none listed');

  const releaseYear = c.release_year ?? 'unknown';
  const longevity = c.longevity_hours != null ? `${c.longevity_hours}h` : 'unknown';
  const projection = c.projection ?? 'unknown';
  const vibeSum = c.vibe_summary ?? 'N/A';

  return [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `FRAGRANCE_ID: ${c.id}`,
    `${c.brand} / ${c.name} (${releaseYear})`,
    `Gender: ${c.gender_marketing} | Price tier: ${c.price_tier} | Rating: ${c.rating_avg.toFixed(2)}/5 (${c.rating_count} reviews)`,
    `Vibe: ${vibeSum}`,
    `Notes — top: ${join(c.notes_top)}; heart: ${join(c.notes_heart)}; base: ${join(c.notes_base)}`,
    `Accords: ${join(c.accords)}`,
    `Vibe tags: ${join(c.vibe_tags)}`,
    `Longevity: ${longevity} | Projection: ${projection}`,
    `Scores — scent_sim: ${c.scent_similarity.toFixed(2)}, occasion_fit: ${c.occasion_score.toFixed(2)}, combined_fit: ${c.fit_score.toFixed(2)}`,
  ].join('\n');
}

/**
 * Build the complete user-turn message: preferences block followed by the
 * numbered candidate list.
 */
export function buildUserMessage(input: RankerInput): string {
  const { prefs, candidates, anchor } = input;

  // Anchor description
  let anchorStr: string;
  if (anchor.type === 'catalog_match' && anchor.matched_fragrance) {
    const { brand, name } = anchor.matched_fragrance;
    anchorStr = `fragrance: ${brand} ${name}`;
  } else if (anchor.type === 'free_text' && anchor.source_text) {
    anchorStr = `text: ${anchor.source_text}`;
  } else {
    anchorStr = 'none';
  }

  const dealbreakerStr =
    prefs.dealbreakers && prefs.dealbreakers.length > 0
      ? prefs.dealbreakers.join(', ')
      : 'none';

  const prefsSection = [
    'USER PREFERENCES:',
    `- Occasion: ${prefs.occasion}`,
    `- Season: ${prefs.season}`,
    `- Gender preference: ${prefs.gender}`,
    `- Budget tier: ${prefs.budget_tier} (1=under $50, 2=$50-150, 3=$150-300, 4=$300+)`,
    `- Dealbreakers: ${dealbreakerStr}`,
    `- Anchor: ${anchorStr}`,
  ].join('\n');

  const candidateLines = candidates.map((c) => formatCandidate(c)).join('\n\n');
  const candidatesSection = `CANDIDATES (${candidates.length} total):\n\n${candidateLines}`;

  return `${prefsSection}\n\n${candidatesSection}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rerank retrieval candidates using Claude Sonnet 4.6.
 *
 * Steps:
 *  1. Format preferences + candidates into a structured user message.
 *  2. Call the model with the versioned system prompt.
 *  3. Strip fences, parse JSON, validate with Zod.
 *  4. Assert every `fragrance_id` in picks exists in the input candidates.
 *  5. Enrich each pick with the full candidate row for downstream display.
 *
 * Throws a descriptive error (including raw model output) on any failure so
 * callers can surface or log the exact reason.
 */
export async function rankCandidates(input: RankerInput): Promise<RankerOutput> {
  const { candidates } = input;
  const userMessage = buildUserMessage(input);

  // ── 1. Call the model ───────────────────────────────────────────────────────
  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: RANKER_MODEL,
    max_tokens: 2000,
    system: RECOMMENDATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });
  const latency_ms = Date.now() - t0;

  // ── 2. Extract text ─────────────────────────────────────────────────────────
  const firstContent = response.content[0];
  if (firstContent.type !== 'text') {
    throw new Error(
      `Unexpected content block type from model: "${firstContent.type}". Expected "text".`,
    );
  }
  const rawText = firstContent.text;

  // ── 3. Parse JSON ───────────────────────────────────────────────────────────
  const cleaned = stripCodeFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse model response as JSON.\n` +
        `Parse error: ${msg}\n` +
        `Raw response:\n${rawText}`,
    );
  }

  // ── 4. Validate ─────────────────────────────────────────────────────────────
  const validation = ResultSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `Model response failed schema validation.\n` +
        `Errors: ${JSON.stringify(validation.error.flatten(), null, 2)}\n` +
        `Raw response:\n${rawText}`,
    );
  }
  const validated = validation.data;

  // ── 5. Enforce candidate IDs ─────────────────────────────────────────────────
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  for (const pick of validated.picks) {
    if (!candidateMap.has(pick.fragrance_id)) {
      const validIds = [...candidateMap.keys()].join(', ');
      throw new Error(
        `Pick references unknown candidate id=${pick.fragrance_id}. ` +
          `Valid IDs in this call: ${validIds}`,
      );
    }
  }

  // ── 6. Enrich ────────────────────────────────────────────────────────────────
  const enriched_picks = validated.picks.map((pick) => ({
    ...pick,
    // candidateMap.get is guaranteed non-null by the check above
    candidate: candidateMap.get(pick.fragrance_id)!,
  }));

  // ── 7. Return ────────────────────────────────────────────────────────────────
  return {
    result: validated,
    enriched_picks,
    meta: {
      model: RANKER_MODEL,
      prompt_version: PROMPT_VERSION,
      latency_ms,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
