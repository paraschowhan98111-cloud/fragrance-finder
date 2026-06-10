/**
 * ranker.test.ts
 *
 * End-to-end integration test: retrieval pipeline → LLM ranker.
 * Runs two user profiles and prints formatted output for inspection.
 *
 * Run:
 *   npx tsx src/lib/ranker.test.ts
 *
 * The file uses dynamic imports so dotenv.config() fires before any module
 * that checks process.env at load time (supabase.ts, openai.ts, anthropic.ts).
 */

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ── Load env vars before any module that checks process.env at import time ───
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env.local') });

// Dynamic imports so the env is set before these modules evaluate their
// top-level `if (!process.env.XXX) throw` guards.
const { getRecommendationCandidates } = await import('./recommender.ts');
const { rankCandidates } = await import('./ranker.ts');

import type { UserPreferences, RankerOutput } from './types.ts';

// ── Display helpers ───────────────────────────────────────────────────────────

function hr(char = '─', width = 66): string {
  return char.repeat(width);
}

/**
 * Estimated cost in USD using Claude Sonnet 4.6 list pricing:
 * $3.00 / M input tokens, $15.00 / M output tokens.
 */
function estimateCost(inputTokens = 0, outputTokens = 0): string {
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  return `~$${cost.toFixed(4)}`;
}

function printScenario(
  label: string,
  prefs: UserPreferences,
  output: RankerOutput,
  candidateCount: number,
): void {
  const { enriched_picks, result, meta } = output;

  console.log('\n' + hr('═'));
  console.log(`  SCENARIO: ${label}`);
  console.log(hr('═'));

  // Profile
  console.log('\n  PROFILE');
  console.log('  ' + hr());
  const anchor = prefs.anchor ? `"${prefs.anchor}"` : 'none';
  console.log(`  Anchor      : ${anchor}`);
  console.log(`  Occasion    : ${prefs.occasion}`);
  console.log(`  Season      : ${prefs.season}`);
  console.log(`  Gender      : ${prefs.gender}`);
  console.log(`  Budget tier : ${prefs.budget_tier}`);
  const db = prefs.dealbreakers?.join(', ') ?? 'none';
  console.log(`  Dealbreakers: ${db}`);

  // Top 5 candidates fed to ranker
  console.log('\n  CANDIDATE POOL (top 5 shown)');
  console.log('  ' + hr());
  // We don't have the full pool here, just the picks — show what we know
  console.log(`  ${candidateCount} candidates were passed to the ranker.`);

  // Picks
  console.log('\n  PICKS');
  console.log('  ' + hr());
  for (const ep of enriched_picks) {
    const { rank, rationale, key_notes, what_to_expect, caveat, candidate } = ep;
    const brandName = `${candidate.brand} / ${candidate.name}`;
    console.log(`\n  #${rank}  ${brandName}  (id=${candidate.id})`);
    console.log(`  Rationale   : ${rationale}`);
    console.log(`  Key notes   : ${key_notes.join(', ')}`);
    console.log(`  What to exp : ${what_to_expect}`);
    if (caveat) {
      console.log(`  Caveat      : ${caveat}`);
    }
  }

  // Explanation
  console.log('\n  EXPLANATION');
  console.log('  ' + hr());
  console.log(`  ${result.explanation}`);

  // Meta
  console.log('\n  META');
  console.log('  ' + hr());
  console.log(`  Model   : ${meta.model} (prompt ${meta.prompt_version})`);
  console.log(`  Latency : ${meta.latency_ms}ms`);
  const inTok = meta.input_tokens ?? 0;
  const outTok = meta.output_tokens ?? 0;
  console.log(`  Tokens  : ${inTok} in / ${outTok} out`);
  console.log(`  Cost    : ${estimateCost(inTok, outTok)}`);
}

// ── Scenario 1 ────────────────────────────────────────────────────────────────

const profile1: UserPreferences = {
  anchor: 'bleu de chanel',
  occasion: 'office',
  season: 'cold',
  gender: 'any',
  budget_tier: 4,
  dealbreakers: [],
};

console.log('\nRunning scenario 1 (retrieval + ranking)…');
try {
  const { candidates: cands1, anchor: anc1 } = await getRecommendationCandidates(profile1);
  const out1 = await rankCandidates({ prefs: profile1, candidates: cands1, anchor: anc1 });
  printScenario('bleu de chanel | office | cold | any | tier 4', profile1, out1, cands1.length);
} catch (err) {
  console.error('\n  Scenario 1 ERROR:', err instanceof Error ? err.message : String(err));
}

// ── Scenario 2 ────────────────────────────────────────────────────────────────

const profile2: UserPreferences = {
  anchor: 'smell of an old bookshop',
  occasion: 'casual',
  season: 'cold',
  gender: 'any',
  budget_tier: 3,
  dealbreakers: ['sweet', 'aquatic'],
};

console.log('\nRunning scenario 2 (retrieval + ranking)…');
try {
  const { candidates: cands2, anchor: anc2 } = await getRecommendationCandidates(profile2);
  const out2 = await rankCandidates({ prefs: profile2, candidates: cands2, anchor: anc2 });
  printScenario(
    'old bookshop | casual | cold | any | tier 3 | no sweet/aquatic',
    profile2,
    out2,
    cands2.length,
  );
} catch (err) {
  console.error('\n  Scenario 2 ERROR:', err instanceof Error ? err.message : String(err));
}

console.log('\n' + hr('═') + '\n');
