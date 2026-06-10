/**
 * recommender.test.ts
 *
 * Manual integration tests for the retrieval pipeline.
 * Requires a live Supabase database and OpenAI key.
 *
 * Run:
 *   node --env-file=.env.local --experimental-strip-types src/lib/recommender.test.ts
 *
 * NOTE: Anchor resolution uses the search_anchor Postgres RPC with trigram
 * indexes — expect sub-200ms per call.
 */

import { resolveAnchor, getRecommendationCandidates } from './recommender.ts';
import type { AnchorResolution } from './types.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(char = '─', width = 62): string {
  return char.repeat(width);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printAnchorResult(input: string, result: AnchorResolution): void {
  const label = input === '' ? '(empty)' : `"${input}"`;
  console.log(`\n  Input : ${label}`);
  console.log(`  type  : ${result.type}`);

  if (result.matched_fragrance) {
    const { brand, name, similarity_score } = result.matched_fragrance;
    console.log(`  match : ${brand} / ${name}`);
    console.log(`  score : ${similarity_score?.toFixed(4) ?? 'n/a'} (fuzzy confidence, 1=perfect)`);
  }

  const embLen = result.scent_embedding?.length ?? null;
  console.log(`  emb   : ${embLen !== null ? `${embLen} dims` : 'null'}`);
}

// ── Anchor resolution tests ───────────────────────────────────────────────────

const anchorInputs: string[] = [
  'bleu de chanel',        // → catalog_match for chanel/bleu-de-chanel
  'tobacco vanille',       // → catalog_match for tom-ford/tobacco-vanille
  'smell of fresh laundry', // → free_text (no catalog match)
  '',                       // → none
  'asdfkjasdf',            // → free_text or none (garbage input)
];

console.log('\n' + hr('═'));
console.log('  ANCHOR RESOLUTION TESTS');
console.log(hr('═'));

for (const input of anchorInputs) {
  try {
    const result = await resolveAnchor(input);
    printAnchorResult(input, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n  Input : "${input}"`);
    console.error(`  ERROR : ${msg}`);
  }
}

// ── Full pipeline test ────────────────────────────────────────────────────────

console.log('\n' + hr('═'));
console.log('  FULL PIPELINE TEST  (bleu de chanel / office / cold / any / tier 4)');
console.log(hr('═'));

try {
  const { anchor, candidates } = await getRecommendationCandidates({
    anchor: 'bleu de chanel',
    occasion: 'office',
    season: 'cold',
    gender: 'any',
    budget_tier: 4,
    dealbreakers: [],
  });

  console.log(`\n  Anchor type     : ${anchor.type}`);
  if (anchor.matched_fragrance) {
    console.log(`  Matched         : ${anchor.matched_fragrance.brand} / ${anchor.matched_fragrance.name}`);
    console.log(`  Similarity      : ${anchor.matched_fragrance.similarity_score?.toFixed(4) ?? 'n/a'}`);
  }
  console.log(`  Candidates      : ${candidates.length} (after filter + brand cap)`);

  console.log(`\n  Top 10 candidates:`);
  console.log(`  ${pad('#', 3)} ${pad('brand / name', 52)} fit_score`);
  console.log(`  ${hr('─', 3)} ${hr('─', 52)} ${hr('─', 9)}`);

  for (const [i, c] of candidates.slice(0, 10).entries()) {
    const label = `${c.brand} / ${c.name}`;
    console.log(`  ${pad(String(i + 1), 3)} ${pad(label, 52)} ${c.fit_score.toFixed(4)}`);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n  ERROR: ${msg}`);
}

console.log('\n' + hr('═') + '\n');
