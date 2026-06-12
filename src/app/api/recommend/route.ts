/**
 * POST /api/recommend
 *
 * Accepts a JSON body of user preferences, runs the retrieval pipeline +
 * streaming LLM ranker, and returns an SSE stream of RankerEvents.
 *
 * Runtime: Edge (avoids Vercel Hobby's 10 s serverless timeout for long SSE streams).
 * Streaming: ReadableStream with SSE framing.
 */

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { NextRequest } from 'next/server';
import { getRecommendationCandidates } from '@/lib/recommender';
import { streamRankCandidates } from '@/lib/streamingRanker';
import type { RankerEvent } from '@/lib/streamingRanker';

// ── Request validation ────────────────────────────────────────────────────────

const UserPreferencesSchema = z.object({
  anchor: z.string().optional(),
  occasion: z.enum(['office', 'date', 'casual', 'formal', 'gym', 'signature']),
  season: z.enum(['cold', 'warm', 'versatile']),
  gender: z.enum(['masculine', 'feminine', 'unisex', 'any']),
  budget_tier: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  dealbreakers: z.array(z.string()).optional(),
});

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseFrame(event: RankerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  const t0 = performance.now();

  // 1. Parse + validate body
  const tParse = performance.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = UserPreferencesSchema.safeParse(body);
  console.log(`[timing] parse+validate: ${(performance.now() - tParse).toFixed(0)}ms`);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid preferences', details: parsed.error.flatten() }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const prefs = parsed.data;

  // 2. Retrieval — outside the stream so we can return 422 synchronously
  let candidates: Awaited<ReturnType<typeof getRecommendationCandidates>>['candidates'];
  let anchor: Awaited<ReturnType<typeof getRecommendationCandidates>>['anchor'];
  const tRetrieval = performance.now();
  try {
    const result = await getRecommendationCandidates(prefs);
    candidates = result.candidates;
    anchor = result.anchor;
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Retrieval failed',
        message: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
  console.log(`[timing] getRecommendationCandidates (route): ${(performance.now() - tRetrieval).toFixed(0)}ms`);

  if (candidates.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No candidates found for the given preferences.' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Build SSE stream
  const rankerInput = { prefs, candidates, anchor };
  let firstEventLogged = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function enqueue(event: RankerEvent) {
        if (!firstEventLogged) {
          console.log(`[timing] first SSE event emitted: ${(performance.now() - t0).toFixed(0)}ms from request start`);
          firstEventLogged = true;
        }
        controller.enqueue(encoder.encode(sseFrame(event)));
      }

      try {
        for await (const event of streamRankCandidates(rankerInput)) {
          enqueue(event);
        }
      } catch (err) {
        enqueue({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        console.log(`[timing] total request: ${(performance.now() - t0).toFixed(0)}ms`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
