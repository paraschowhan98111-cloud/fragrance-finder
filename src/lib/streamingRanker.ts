/**
 * streamingRanker.ts
 *
 * Streaming variant of the LLM ranker. Yields typed RankerEvents as Claude
 * produces them, using partial-json to detect completed picks incrementally.
 *
 * Consumers iterate with `for await (const event of streamRankCandidates(...))`.
 */

import { parse as parsePartial } from 'partial-json';
import { anthropic, RANKER_MODEL } from './anthropic.ts';
import { RECOMMENDATION_SYSTEM_PROMPT, PROMPT_VERSION } from './prompts/recommendation.ts';
import { buildUserMessage, PickSchema, ResultSchema } from './ranker.ts';
import { logRecommendationSession } from './logging.ts';
import type { RankerInput, Candidate } from './types.ts';

// ── Event types ───────────────────────────────────────────────────────────────

export interface MetaEvent {
  type: 'meta';
  model: string;
  prompt_version: string;
}

export interface PickEvent {
  type: 'pick';
  rank: number;
  fragrance_id: number;
  rationale: string;
  key_notes: string[];
  what_to_expect: string;
  caveat?: string;
  candidate: Candidate;
}

export interface ExplanationEvent {
  type: 'explanation';
  explanation: string;
}

export interface DoneEvent {
  type: 'done';
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  /** Estimated cost in USD */
  estimated_cost_usd: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type RankerEvent =
  | MetaEvent
  | PickEvent
  | ExplanationEvent
  | DoneEvent
  | ErrorEvent;

// ── Helpers ───────────────────────────────────────────────────────────────────

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Stream fragrance recommendations from Claude Sonnet 4.6.
 *
 * Emits events in order:
 *   meta → pick (×1-5) → explanation → done
 *
 * On any unrecoverable error emits an error event and returns.
 * Logging is fire-and-forget and does not affect the event stream.
 */
export async function* streamRankCandidates(
  input: RankerInput,
): AsyncGenerator<RankerEvent> {
  const { candidates } = input;
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  // ── 1. meta ─────────────────────────────────────────────────────────────────
  yield { type: 'meta', model: RANKER_MODEL, prompt_version: PROMPT_VERSION };

  const userMessage = buildUserMessage(input);
  const t0 = Date.now();

  // ── 2. Open streaming connection ─────────────────────────────────────────────
  let stream: Awaited<ReturnType<typeof anthropic.messages.stream>>;
  try {
    stream = anthropic.messages.stream({
      model: RANKER_MODEL,
      max_tokens: 2000,
      system: RECOMMENDATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    yield {
      type: 'error',
      message: `Failed to open stream: ${err instanceof Error ? err.message : String(err)}`,
    };
    return;
  }

  // ── 3. Accumulate text + detect completed picks ───────────────────────────────
  let accumulated = '';
  let sealedPickCount = 0;
  const pendingEvents: RankerEvent[] = [];

  /**
   * Process newly-arrived text. Parses the in-progress JSON, detects completed
   * picks, and queues events to be yielded outside the SDK callback.
   */
  function processChunk(textDelta: string): void {
    accumulated += textDelta;

    // Strip markdown code fences if Claude wrapped the JSON in them.
    let toParse = accumulated.trim();
    if (toParse.startsWith('```')) {
      toParse = toParse.replace(/^```(?:json)?\s*/i, '');
      toParse = toParse.replace(/\s*```\s*$/, '');
    }

    let partial: unknown;
    try {
      partial = parsePartial(toParse);
    } catch {
      return;
    }

    if (partial === null || typeof partial !== 'object' || Array.isArray(partial)) {
      return;
    }

    const obj = partial as Record<string, unknown>;
    const rawPicks = obj['picks'];
    const rawExplanation = obj['explanation'];

    // A pick is "sealed" only when there's another pick after it in the array,
    // OR when the explanation field has BOTH started AND has substantial content
    // (at least 20 chars — guards against the moment partial-json returns "T"
    // when Claude has only typed the opening quote of explanation).
    const explanationComplete =
      typeof rawExplanation === 'string' && rawExplanation.length >= 20;

    const currentCount = Array.isArray(rawPicks) ? rawPicks.length : 0;
    // Emit up to (count - 1) picks — the last one is still being written.
    // If explanation is substantively present, the last pick is done too.
    const emittableCount = explanationComplete ? currentCount : Math.max(currentCount - 1, 0);

    while (sealedPickCount < emittableCount) {
      const rawPick = (rawPicks as unknown[])[sealedPickCount];
      const validation = PickSchema.safeParse(rawPick);
      if (!validation.success) {
        // Pick not fully formed yet — stop, will retry on next chunk
        break;
      }
      const pick = validation.data;
      const candidate = candidateMap.get(pick.fragrance_id);
      if (!candidate) {
        console.warn(`[stream] Pick rank ${pick.rank} has unknown fragrance_id ${pick.fragrance_id} — skipping`);
        sealedPickCount++;
        continue;
      }
      pendingEvents.push({
        type: 'pick',
        rank: pick.rank,
        fragrance_id: pick.fragrance_id,
        rationale: pick.rationale,
        key_notes: pick.key_notes,
        what_to_expect: pick.what_to_expect,
        caveat: pick.caveat,
        candidate,
      });
      sealedPickCount++;
    }

    // Don't emit explanation from mid-stream parses — only emit once final
    // parse succeeds in the finalize step (see code after stream completes).
  }

  // Wire up the SDK's text event — this fires for each token.
  stream.on('text', (text: string) => {
    processChunk(text);
  });

  try {
    // Walk the stream. We use the SDK's async iterator just to keep the connection
    // alive until completion; the actual chunk handling happens in the .on('text') above.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of stream) {
      // Drain any pending events that the text handler queued during this iteration
      while (pendingEvents.length > 0) {
        const ev = pendingEvents.shift();
        if (ev) yield ev;
      }
    }
    // Final drain after stream completes
    while (pendingEvents.length > 0) {
      const ev = pendingEvents.shift();
      if (ev) yield ev;
    }
  } catch (err) {
    yield {
      type: 'error',
      message: `Stream error: ${err instanceof Error ? err.message : String(err)}`,
    };
    return;
  }

  // ── 4. Finalise — grab token counts from the completed message ────────────────
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const finalMsg = await stream.finalMessage();
    inputTokens = finalMsg.usage.input_tokens;
    outputTokens = finalMsg.usage.output_tokens;
  } catch {
    // Non-fatal — cost estimate will just be 0
  }

  // ── 4.5. Final parse — emit explanation and any remaining picks ────────────
  let finalText = accumulated.trim();
  if (finalText.startsWith('```')) {
    finalText = finalText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  }
  try {
    const final = JSON.parse(finalText);
const validation = ResultSchema.safeParse(final);
    if (validation.success) {
      const allPicks = validation.data.picks;
      // Emit any picks we didn't catch mid-stream (handles the last pick)
      while (sealedPickCount < allPicks.length) {
        const pick = allPicks[sealedPickCount];
        const candidate = candidateMap.get(pick.fragrance_id);
        if (candidate) {
          yield {
            type: 'pick',
            rank: pick.rank,
            fragrance_id: pick.fragrance_id,
            rationale: pick.rationale,
            key_notes: pick.key_notes,
            what_to_expect: pick.what_to_expect,
            caveat: pick.caveat,
            candidate,
          };
        }
        sealedPickCount++;
      }
      yield {
        type: 'explanation',
        explanation: validation.data.explanation,
      };
    } else {
      yield {
        type: 'error',
        message: `Final JSON validation failed: ${JSON.stringify(validation.error.flatten())}`,
      };
    }
  } catch (err) {
    yield {
      type: 'error',
      message: `Final JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const latency_ms = Date.now() - t0;

  // ── 5. done ──────────────────────────────────────────────────────────────────
  yield {
    type: 'done',
    latency_ms,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimateCost(inputTokens, outputTokens),
  };

  // ── 6. Fire-and-forget logging ────────────────────────────────────────────────
  const recommendedIds = Array.from({ length: sealedPickCount }, (_, i) => {
    const rawPicks = (() => {
      try {
        const obj = parsePartial(accumulated) as Record<string, unknown>;
        return obj['picks'] as unknown[];
      } catch {
        return [];
      }
    })();
    const pick = rawPicks[i] as { fragrance_id?: number } | undefined;
    return pick?.fragrance_id ?? -1;
  }).filter((id) => id !== -1);

  void logRecommendationSession(input.prefs, recommendedIds);
}
