/**
 * recommender.ts
 *
 * Retrieval pipeline for fragrance recommendations.
 *
 * Given user quiz preferences, runs a five-step pipeline:
 *   1. resolveAnchor  — trigram-match the user's anchor text against the full
 *                       catalog via Postgres RPC or embed it as free text
 *   2. getCandidates  — call the match_fragrances Postgres RPC
 *   3. filterAnchorVariants — strip out name-variants of the anchor
 *   4. applyBrandCap  — enforce per-brand diversity
 *   5. slice to 20    — return the final candidate list
 *
 * The module is intentionally silent (no console.log). All logging lives in
 * the test / API layer.
 */

import { supabase } from './supabase.ts';
import { embedText } from './openai.ts';
import type { UserPreferences, AnchorResolution, Candidate } from './types.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fallback text to embed when the user provided no anchor at all. */
const NEUTRAL_ANCHOR_TEXT = 'well-regarded versatile fragrance';

// ── Private helpers ───────────────────────────────────────────────────────────

function describeEmbedding(emb: unknown): string {
  if (emb === null) return 'null';
  if (emb === undefined) return 'undefined';
  if (Array.isArray(emb)) return `array[${emb.length}], first=${emb[0]}, last=${emb[emb.length - 1]}`;
  if (typeof emb === 'string') return `string[${(emb as string).length}], preview=${(emb as string).slice(0, 50)}`;
  return `unknown type: ${typeof emb}`;
}

/**
 * Safely parse a pgvector value returned by Supabase.
 * Newer client versions return a JS number[]; older ones may return a JSON
 * string representation. Returns null for null/undefined inputs.
 */
function parseEmbedding(emb: unknown): number[] | null {
  if (emb === null || emb === undefined) return null;
  if (Array.isArray(emb)) return emb as number[];
  if (typeof emb === 'string') {
    try {
      return JSON.parse(emb) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Lowercase and replace dashes with spaces for flexible name-variant matching.
 * e.g. "Bleu de Chanel" → "bleu de chanel"
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/-/g, ' ');
}

// ── Exported pipeline functions ───────────────────────────────────────────────

/**
 * Resolve a free-text anchor string to either a catalog match (with stored
 * embeddings reused directly) or an on-the-fly OpenAI embedding.
 *
 * Resolution logic:
 *  - Empty / blank input  →  type: 'none', both embeddings null
 *  - search_anchor RPC similarity ≥ 0.35 AND row has a scent embedding
 *                         →  type: 'catalog_match', returns stored embeddings
 *  - Everything else      →  type: 'free_text', calls embedText() via OpenAI
 */
export async function resolveAnchor(text: string): Promise<AnchorResolution> {
  const t0 = performance.now();
  const trimmed = (text ?? '').trim();

  console.log('[debug] resolveAnchor start, trimmed:', JSON.stringify(trimmed));

  if (!trimmed) {
    console.log('[debug] resolveAnchor: empty anchor, returning none');
    return { type: 'none', scent_embedding: null, brand_embedding: null };
  }

  // Call the search_anchor RPC
  console.log('[debug] resolveAnchor: about to call search_anchor RPC');
  const tRpc = performance.now();
  let data: unknown, error: unknown;
  try {
    ({ data, error } = await supabase.rpc('search_anchor', {
      query_text: trimmed,
      match_count: 1,
    }));
    console.log('[debug] resolveAnchor: search_anchor RPC returned, error:', error ? JSON.stringify(error) : 'null', 'rows:', Array.isArray(data) ? data.length : 'non-array');
  } catch (err) {
    console.error('[debug] resolveAnchor: search_anchor RPC THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }
  const rpcMs = performance.now() - tRpc;

  if (error) {
    console.error('[anchor] search_anchor RPC failed:', (error as { message?: string }).message ?? String(error));
    // Fall through to free_text as a fallback
  }

  const top = (Array.isArray(data) && data.length > 0) ? data[0] : null;

  // Threshold: 0.35 trigram similarity is the cutoff for "good enough catalog match"
  // Below that we treat as free text. (Empirically: 'bleu de chanel' → 1.0,
  //  'aqua di gio' → 0.54, garbage → < 0.2 so the function returns no rows.)
  const CATALOG_MATCH_THRESHOLD = 0.35;

  console.log('[debug] resolveAnchor: top match:', top ? JSON.stringify({ id: top.id, similarity: top.similarity, has_embedding: !!top.embedding }) : 'null');

  if (top && top.similarity >= CATALOG_MATCH_THRESHOLD && top.embedding) {
    console.log(
      `[timing] resolveAnchor: rpc=${rpcMs.toFixed(0)}ms text_embed=0ms total=${(performance.now() - t0).toFixed(0)}ms`,
    );
    console.log('[debug] resolveAnchor: returning catalog_match');
    return {
      type: 'catalog_match',
      matched_fragrance: {
        id: top.id,
        external_id: top.external_id,
        brand: top.brand,
        name: top.name,
        similarity_score: top.similarity,
      },
      scent_embedding: parseEmbedding(top.embedding),
      brand_embedding: parseEmbedding(top.embedding_brand),
      source_text: trimmed,
    };
  }

  // Free-text path: embed the user's text on the fly
  console.log('[debug] resolveAnchor: falling through to free_text embed');
  const tEmbed = performance.now();
  let embedding: number[];
  try {
    embedding = await embedText(trimmed);
    console.log('[debug] resolveAnchor: embedText returned, dims:', embedding.length);
  } catch (err) {
    console.error('[debug] resolveAnchor: embedText THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }
  const embedMs = performance.now() - tEmbed;
  console.log(
    `[timing] resolveAnchor: rpc=${rpcMs.toFixed(0)}ms text_embed=${embedMs.toFixed(0)}ms total=${(performance.now() - t0).toFixed(0)}ms`,
  );
  console.log('[debug] resolveAnchor: returning free_text');
  return {
    type: 'free_text',
    scent_embedding: embedding,
    brand_embedding: null,
    source_text: trimmed,
  };
}

/**
 * Call the `match_fragrances` Postgres RPC and return typed candidate rows.
 *
 * Over-fetches 30 results so that downstream filtering (variant removal,
 * brand cap) can still yield a final pool of ≥ 20 candidates.
 *
 * When the anchor carries no scent embedding (type: 'none'), falls back to
 * a neutral placeholder string embedded via OpenAI rather than sending a
 * zero/null vector to the RPC.
 */
export async function getCandidates(
  prefs: UserPreferences,
  anchor: AnchorResolution,
): Promise<Candidate[]> {
  const t0 = performance.now();

  console.log('[debug] getCandidates start, anchor.type:', anchor.type);

  // For type:'none' the scent_embedding is null — embed a neutral phrase
  let scentEmbedding = anchor.scent_embedding;
  let neutralEmbedMs = 0;
  if (!scentEmbedding) {
    console.log('[debug] getCandidates: no scent embedding, embedding neutral phrase');
    const tEmbed = performance.now();
    try {
      scentEmbedding = await embedText(NEUTRAL_ANCHOR_TEXT);
      console.log('[debug] getCandidates: neutral embed returned, dims:', scentEmbedding.length);
    } catch (err) {
      console.error('[debug] getCandidates: neutral embedText THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
      throw err;
    }
    neutralEmbedMs = performance.now() - tEmbed;
  }

  console.log('[debug] getCandidates: about to call match_fragrances RPC');
  console.log('[debug] getCandidates: scent_embedding =', describeEmbedding(scentEmbedding));
  console.log('[debug] getCandidates: brand_embedding =', describeEmbedding(anchor.brand_embedding));
  const tRpc = performance.now();
  let data: unknown, error: unknown;
  try {
    ({ data, error } = await supabase.rpc('match_fragrances', {
      query_scent_embedding: scentEmbedding,
      query_brand_embedding: anchor.brand_embedding,   // null → RPC uses scent only
      user_gender: prefs.gender,
      user_max_price_tier: prefs.budget_tier,
      user_dealbreakers: prefs.dealbreakers ?? [],
      user_occasion: prefs.occasion,
      match_count: 30,
    }));
    console.log('[debug] getCandidates: match_fragrances RPC returned, error:', error ? JSON.stringify(error) : 'null', 'rows:', Array.isArray(data) ? data.length : 'non-array');
  } catch (err) {
    console.error('[debug] getCandidates: match_fragrances RPC THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }
  const rpcMs = performance.now() - tRpc;
  console.log(
    `[timing] getCandidates:${neutralEmbedMs > 0 ? ` neutral_embed=${neutralEmbedMs.toFixed(0)}ms` : ''}` +
    ` rpc=${rpcMs.toFixed(0)}ms total=${(performance.now() - t0).toFixed(0)}ms`,
  );

  if (error) throw new Error(`match_fragrances RPC failed: ${(error as { message?: string }).message ?? String(error)}`);

  return (data ?? []) as Candidate[];
}

/**
 * Remove candidates that are name-variants of the catalog-matched anchor.
 *
 * A candidate is excluded when any of the following hold:
 *  - Its id equals the anchor's id (the anchor itself)
 *  - Its normalized name CONTAINS the anchor's normalized name
 *    (catches longer variants: "Bleu de Chanel Eau de Parfum")
 *  - The anchor's normalized name CONTAINS the candidate's normalized name
 *    (catches shorter fragments: edge case where anchor is the longer string)
 *
 * Returns candidates unchanged when anchor is not a catalog_match.
 */
export function filterAnchorVariants(
  candidates: Candidate[],
  anchor: AnchorResolution,
): Candidate[] {
  if (anchor.type !== 'catalog_match' || !anchor.matched_fragrance) {
    return candidates;
  }

  const anchorId = anchor.matched_fragrance.id;
  const anchorName = normalizeName(anchor.matched_fragrance.name);

  return candidates.filter((c) => {
    if (c.id === anchorId) return false;
    const cName = normalizeName(c.name);
    if (cName.includes(anchorName)) return false;   // candidate is a longer variant
    if (anchorName.includes(cName)) return false;   // candidate is a shorter variant
    return true;
  });
}

/**
 * Enforce brand diversity by capping the number of candidates from any single
 * brand.
 *
 * Iterates the candidates in their existing order (assumed to be fit_score
 * descending, as returned by the RPC). The first `maxPerBrand` candidates
 * per brand are kept; additional ones from the same brand are dropped.
 */
export function applyBrandCap(
  candidates: Candidate[],
  maxPerBrand = 2,
): Candidate[] {
  const brandCount = new Map<string, number>();
  const result: Candidate[] = [];

  for (const candidate of candidates) {
    const count = brandCount.get(candidate.brand) ?? 0;
    if (count >= maxPerBrand) continue;
    brandCount.set(candidate.brand, count + 1);
    result.push(candidate);
  }

  return result;
}

/**
 * Orchestrator: chain the full retrieval pipeline and return the top 20
 * candidates together with the resolved anchor (for LLM reranker context).
 *
 *   resolveAnchor → getCandidates → filterAnchorVariants → applyBrandCap → slice(20)
 */
export async function getRecommendationCandidates(
  prefs: UserPreferences,
): Promise<{ candidates: Candidate[]; anchor: AnchorResolution }> {
  const t0 = performance.now();

  console.log('[debug] orchestrator start, prefs:', JSON.stringify(prefs));

  console.log('[debug] about to call resolveAnchor');
  let anchor: AnchorResolution;
  try {
    anchor = await resolveAnchor(prefs.anchor ?? '');
    console.log('[debug] resolveAnchor returned:', JSON.stringify({
      type: anchor.type,
      has_scent_embedding: anchor.scent_embedding !== null && anchor.scent_embedding !== undefined,
      has_brand_embedding: anchor.brand_embedding !== null && anchor.brand_embedding !== undefined,
    }));
  } catch (err) {
    console.error('[debug] resolveAnchor THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }

  console.log('[debug] about to call getCandidates');
  let candidates: Candidate[];
  try {
    candidates = await getCandidates(prefs, anchor);
    console.log('[debug] getCandidates returned, count:', candidates.length);
  } catch (err) {
    console.error('[debug] getCandidates THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }

  console.log('[debug] about to call filterAnchorVariants');
  const tFilter = performance.now();
  let filtered: Candidate[];
  try {
    filtered = filterAnchorVariants(candidates, anchor);
    console.log('[debug] filterAnchorVariants returned, count:', filtered.length);
  } catch (err) {
    console.error('[debug] filterAnchorVariants THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }
  console.log(`[timing] filterAnchorVariants: ${(performance.now() - tFilter).toFixed(0)}ms`);

  console.log('[debug] about to call applyBrandCap');
  const tBrand = performance.now();
  let diverse: Candidate[];
  try {
    diverse = applyBrandCap(filtered, 2);
    console.log('[debug] applyBrandCap returned, count:', diverse.length);
  } catch (err) {
    console.error('[debug] applyBrandCap THREW:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    throw err;
  }
  console.log(`[timing] applyBrandCap: ${(performance.now() - tBrand).toFixed(0)}ms`);

  console.log(`[timing] getRecommendationCandidates total: ${(performance.now() - t0).toFixed(0)}ms`);

  const result = diverse.slice(0, 20);
  console.log('[debug] orchestrator returning, final candidate count:', result.length);

  return { candidates: result, anchor };
}
