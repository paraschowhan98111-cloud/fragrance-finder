/**
 * 01_submit_batch.js
 *
 * Fetches all recommendable-tier fragrances that haven't been enriched yet
 * (vibe_summary IS NULL), builds a structured-metadata prompt for each, and
 * submits them to the Anthropic Message Batches API using claude-haiku-4-5.
 *
 * Prerequisites:
 *   - .env.local with SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
 *   - npm packages: @supabase/supabase-js, @anthropic-ai/sdk, dotenv
 *
 * Output:
 *   - data/processed/enrichment_batch_state.json  (batch ID + fragrance IDs)
 *
 * Run next: node scripts/enrichment/02_check_status.js
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// ── env ──────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function loadEnv() {
  const envPath = join(ROOT, '.env.local');
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.error(`Fatal: could not read .env.local at ${envPath}`);
    process.exit(1);
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ANTHROPIC_API_KEY) {
  console.error('Fatal: SUPABASE_URL, SUPABASE_SERVICE_KEY, and ANTHROPIC_API_KEY must be set in .env.local');
  process.exit(1);
}

// ── constants ─────────────────────────────────────────────────────────────────

const STATE_PATH = join(ROOT, 'data/processed/enrichment_batch_state.json');
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 600;
const COST_PER_REQUEST = 0.000925; // approximate, input + output at Haiku rates

// ── clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── helpers ───────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function joinNotes(arr) {
  if (!arr || arr.length === 0) return 'unknown';
  return Array.isArray(arr) ? arr.join(', ') : String(arr);
}

function buildPrompt(f) {
  return `You are a fragrance expert generating structured metadata for a recommendation database.

FRAGRANCE:
Brand: ${f.brand ?? 'Unknown'}
Name: ${f.name ?? 'Unknown'}
Release year: ${f.release_year ?? 'Unknown'}
Gender marketing: ${f.gender_marketing ?? 'Unisex'}
Top notes: ${joinNotes(f.notes_top)}
Heart notes: ${joinNotes(f.notes_heart)}
Base notes: ${joinNotes(f.notes_base)}
Main accords: ${joinNotes(f.accords)}
Average rating: ${f.rating_avg ?? 'N/A'} from ${f.rating_count ?? 0} reviews

Based on your training knowledge of this fragrance and the data above, output a JSON object. If you don't recognize this specific fragrance, infer from notes/accords/rating signals. Don't fabricate specific reviews or claims you can't support.

Output strictly this JSON shape (no other text, no markdown fences):

{
  "vibe_summary": "2 sentences max, evocative but not flowery. Concrete, not generic.",
  "occasion_office": 0.0-1.0,
  "occasion_date": 0.0-1.0,
  "occasion_casual": 0.0-1.0,
  "occasion_formal": 0.0-1.0,
  "occasion_gym": 0.0-1.0,
  "occasion_signature": 0.0-1.0,
  "season_spring": 0.0-1.0,
  "season_summer": 0.0-1.0,
  "season_fall": 0.0-1.0,
  "season_winter": 0.0-1.0,
  "vibe_tags": ["pick 3-5 from this controlled vocabulary: mature, youthful, playful, sophisticated, sexy, clean, weird, comforting, fresh, dark, sweet, dry, powdery, animalic, gourmand, aquatic, smoky, green, spicy, leathery, floral, woody"],
  "longevity_hours": number between 1.0 and 14.0,
  "projection": "intimate" | "moderate" | "beast",
  "price_tier": 1 | 2 | 3 | 4
}`;
}

// ── confirmation prompt ───────────────────────────────────────────────────────

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${ts()}] Starting batch submission script`);

  // Ctrl+C handler
  process.on('SIGINT', () => {
    console.log('\nInterrupted — no batch was submitted (state file not written).');
    process.exit(0);
  });

  // 1. Fetch fragrances
  console.log(`[${ts()}] Fetching recommendable-tier fragrances with no vibe_summary...`);

  // Paginate to bypass Supabase's default 1000-row response cap
  const fragrances = [];
  const PAGE_SIZE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('fragrances')
      .select('id, external_id, brand, name, release_year, gender_marketing, rating_avg, rating_count, notes_top, notes_heart, notes_base, accords')
      .eq('tier', 'recommendable')
      .is('vibe_summary', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`[${ts()}] Supabase error:`, error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    fragrances.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  if (!fragrances || fragrances.length === 0) {
    console.log(`[${ts()}] No fragrances to enrich — all recommendable rows already have vibe_summary.`);
    process.exit(0);
  }

  console.log(`[${ts()}] Found ${fragrances.length} fragrances to enrich.`);

  // 2. Estimate cost and ask for confirmation
  const estimatedCost = (fragrances.length * COST_PER_REQUEST).toFixed(2);
  console.log(`\n  Model:           ${MODEL}`);
  console.log(`  Fragrances:      ${fragrances.length}`);
  console.log(`  Estimated cost:  ~$${estimatedCost} USD\n`);

  const answer = await askConfirmation('Submit batch? (yes/no): ');
  if (answer !== 'yes' && answer !== 'y') {
    console.log('Cancelled — nothing submitted.');
    process.exit(0);
  }

  // 3. Build batch requests
  console.log(`[${ts()}] Building ${fragrances.length} batch requests...`);

  const requests = fragrances.map((f) => ({
    custom_id: String(f.id),
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: buildPrompt(f) }],
    },
  }));

  // 4. Submit batch
  console.log(`[${ts()}] Submitting batch to Anthropic...`);

  let batch;
  try {
    batch = await anthropic.messages.batches.create({ requests });
  } catch (err) {
    console.error(`[${ts()}] Anthropic API error:`, err.message);
    process.exit(1);
  }

  console.log(`[${ts()}] Batch submitted successfully.`);
  console.log(`  Batch ID: ${batch.id}`);

  // 5. Save state file
  const state = {
    batch_id: batch.id,
    submitted_at: new Date().toISOString(),
    fragrance_count: fragrances.length,
    fragrance_ids: fragrances.map((f) => f.id),
  };

  mkdirSync(join(ROOT, 'data/processed'), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

  console.log(`[${ts()}] State saved to ${STATE_PATH}`);
  console.log(`\n  Batch ID:        ${batch.id}`);
  console.log(`  Fragrances:      ${fragrances.length}`);
  console.log(`  Estimated cost:  ~$${estimatedCost} USD`);
  console.log(`\nNext step: node scripts/enrichment/02_check_status.js`);
}

main().catch((err) => {
  console.error(`[${ts()}] Unhandled error:`, err);
  process.exit(1);
});
