/**
 * generate_embeddings.js
 *
 * Generates TWO vector embeddings for all recommendable-tier fragrances that
 * don't yet have one, using OpenAI's text-embedding-3-small model (1536 dims):
 *   - scent embedding (vibe + notes + accords + tags) -> `embedding` column
 *   - brand embedding (brand name only)               -> `embedding_brand` column
 * Both columns are pgvector(1536) in Supabase and are written in one update/row.
 *
 * NOTE: this requires an `embedding_brand` vector(1536) column to exist on the
 * fragrances table. Add it before running (e.g. ALTER TABLE fragrances ADD
 * COLUMN embedding_brand vector(1536);) if it isn't there yet.
 *
 * Idempotent: only fetches rows where embedding IS NULL, so re-running picks up
 * where it left off (including any rows that failed previously).
 *
 * Prerequisites:
 *   - .env.local with SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY
 *   - npm packages: @supabase/supabase-js, openai, dotenv
 *
 * Run: node scripts/generate_embeddings.js
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createInterface } from 'readline';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ── env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !OPENAI_API_KEY) {
  console.error('Fatal: SUPABASE_URL, SUPABASE_SERVICE_KEY, and OPENAI_API_KEY must be set in .env.local');
  process.exit(1);
}

// ── constants ─────────────────────────────────────────────────────────────────

const MODEL = 'text-embedding-3-small';
const EMBED_DIM = 1536;
const PAGE_SIZE = 1000;          // Supabase default cap per request
const EMBED_BATCH_SIZE = 100;    // fragrances per OpenAI embeddings call
const DB_CONCURRENCY = 10;       // parallel Supabase updates
const PROGRESS_INTERVAL = 100;
const COST_PER_FRAGRANCE = 0.000003; // rough, for habit
const MAX_RETRIES = 3;
const BACKOFF_START_MS = 2000;
const BACKOFF_MAX_MS = 30000;

// ── clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── helpers ───────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Join an array field into ", "-separated text, or return null if empty. */
function joinField(arr) {
  if (!arr) return null;
  if (Array.isArray(arr)) {
    const cleaned = arr.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
    return cleaned.length ? cleaned.join(', ') : null;
  }
  const s = String(arr).trim();
  return s || null;
}

function cleanScalar(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Build the SCENT embedding input string (no brand or name), skipping any
 * null/empty parts so we never emit "undefined" or "null". Format mirrors the
 * spec exactly.
 */
function buildScentString(f) {
  const vibeSummary = cleanScalar(f.vibe_summary);
  const top = joinField(f.notes_top);
  const heart = joinField(f.notes_heart);
  const base = joinField(f.notes_base);
  const accords = joinField(f.accords);
  const tags = joinField(f.vibe_tags);

  let out = '';

  // "{vibe_summary}"
  if (vibeSummary) out += vibeSummary;

  // " Notes: top — ...; heart — ...; base — ...."
  const noteParts = [];
  if (top) noteParts.push(`top — ${top}`);
  if (heart) noteParts.push(`heart — ${heart}`);
  if (base) noteParts.push(`base — ${base}`);
  if (noteParts.length) out += ` Notes: ${noteParts.join('; ')}.`;

  // " Accords: ...."
  if (accords) out += ` Accords: ${accords}.`;

  // " Tags: ...."
  if (tags) out += ` Tags: ${tags}.`;

  return out.trim();
}

/**
 * Build the BRAND embedding input string: just the brand name, with dashes
 * replaced by spaces (e.g. "tom-ford" -> "tom ford"). Empty if no brand.
 */
function buildBrandString(f) {
  const brand = cleanScalar(f.brand);
  if (!brand) return '';
  return brand.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Run async tasks with a max concurrency limit (matches enrichment script 3). */
async function runWithConcurrency(items, limit, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/** Call OpenAI embeddings with exponential backoff on rate-limit errors. */
async function embedBatchWithRetry(inputs) {
  let attempt = 0;
  let delay = BACKOFF_START_MS;

  while (true) {
    try {
      const resp = await openai.embeddings.create({ model: MODEL, input: inputs });
      // Preserve input ordering; OpenAI returns data with `index` fields.
      const sorted = resp.data.slice().sort((a, b) => a.index - b.index);
      return sorted.map((d) => d.embedding);
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      const isRateLimit = status === 429 || status === 503;

      if (isRateLimit && attempt < MAX_RETRIES) {
        attempt++;
        console.warn(`[${ts()}] Rate-limited (status ${status}). Retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
        await sleep(delay);
        delay = Math.min(delay * 2, BACKOFF_MAX_MS);
        continue;
      }
      throw err;
    }
  }
}

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchAllNeedingEmbedding() {
  const cols = 'id, brand, name, vibe_summary, vibe_tags, notes_top, notes_heart, notes_base, accords';
  const all = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('fragrances')
      .select(cols)
      .eq('tier', 'recommendable')
      .is('embedding', null)
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error(`[${ts()}] Supabase fetch error:`, error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) break;
    all.push(...data);
    console.log(`[${ts()}] Fetched ${all.length} rows so far...`);

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

// ── main ──────────────────────────────────────────────────────────────────────

let interrupted = false;
process.on('SIGINT', () => {
  console.log(`\n[${ts()}] Interrupted — finishing in-flight work then stopping.`);
  interrupted = true;
});

async function main() {
  const startTime = Date.now();
  console.log(`[${ts()}] Starting embedding generation`);

  // 1. Fetch fragrances needing embeddings
  console.log(`[${ts()}] Fetching recommendable fragrances with no embedding...`);
  const fragrances = await fetchAllNeedingEmbedding();

  if (fragrances.length === 0) {
    console.log(`[${ts()}] Nothing to embed — all recommendable rows already have embeddings.`);
    process.exit(0);
  }

  // 2. Confirmation (two embeddings per fragrance, hence ~2x)
  const estCost = (fragrances.length * COST_PER_FRAGRANCE * 2).toFixed(4);
  console.log(`\n  Model:           ${MODEL}`);
  console.log(`  Fragrances:      ${fragrances.length}`);
  console.log(`  Embeddings:      ${fragrances.length * 2} (scent + brand)`);
  console.log(`  Estimated cost:  ~$${estCost} USD\n`);

  const answer = await askConfirmation('Proceed? (yes/no): ');
  if (answer !== 'yes' && answer !== 'y') {
    console.log('Cancelled — nothing embedded.');
    process.exit(0);
  }

  // 3. Process in batches of EMBED_BATCH_SIZE
  const counters = {
    succeeded: 0,
    failedEmbed: 0,
    failedDb: 0,
  };
  const failures = []; // { id, stage, error }
  let processed = 0;

  function logProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[${ts()}] Progress: ${processed}/${fragrances.length} — ` +
      `ok=${counters.succeeded} embed_err=${counters.failedEmbed} db_err=${counters.failedDb} ` +
      `elapsed=${elapsed}s`
    );
  }

  for (let i = 0; i < fragrances.length; i += EMBED_BATCH_SIZE) {
    if (interrupted) break;

    const batch = fragrances.slice(i, i + EMBED_BATCH_SIZE);

    // Interleave scent + brand strings into one input array:
    // [scent_1, brand_1, scent_2, brand_2, ...]. One API call returns 2N
    // vectors in the same order: even index = scent, odd index = brand.
    const inputs = [];
    for (const f of batch) {
      inputs.push(buildScentString(f));
      inputs.push(buildBrandString(f));
    }

    // 3a. Embed the batch (with retry/backoff)
    let vectors;
    try {
      vectors = await embedBatchWithRetry(inputs);
    } catch (err) {
      // Whole batch failed embedding — record each fragrance as failed and continue.
      console.error(`[${ts()}] Embedding batch starting at index ${i} failed:`, err.message);
      for (const f of batch) {
        counters.failedEmbed++;
        failures.push({ id: f.id, stage: 'embed', error: err.message });
      }
      processed += batch.length;
      if (processed % PROGRESS_INTERVAL < EMBED_BATCH_SIZE) logProgress();
      continue;
    }

    if (vectors.length !== inputs.length) {
      console.error(`[${ts()}] Embedding count mismatch (got ${vectors.length}, expected ${inputs.length}) at index ${i}.`);
      for (const f of batch) {
        counters.failedEmbed++;
        failures.push({ id: f.id, stage: 'embed', error: 'count mismatch' });
      }
      processed += batch.length;
      continue;
    }

    // 3b. Write both embeddings to Supabase in parallel (concurrency limit).
    const updateItems = batch.map((f, idx) => ({
      fragrance: f,
      embedding: vectors[idx * 2],          // even = scent
      embedding_brand: vectors[idx * 2 + 1], // odd  = brand
    }));

    await runWithConcurrency(updateItems, DB_CONCURRENCY, async ({ fragrance, embedding, embedding_brand }) => {
      if (embedding.length !== EMBED_DIM || embedding_brand.length !== EMBED_DIM) {
        counters.failedDb++;
        failures.push({
          id: fragrance.id,
          stage: 'db',
          error: `unexpected dim (scent ${embedding.length}, brand ${embedding_brand.length})`,
        });
        return;
      }

      // pgvector via supabase-js: a JS number array is accepted directly.
      // Both columns written in a single update.
      const { error } = await supabase
        .from('fragrances')
        .update({ embedding, embedding_brand })
        .eq('id', fragrance.id);

      if (error) {
        counters.failedDb++;
        failures.push({ id: fragrance.id, stage: 'db', error: error.message });
      } else {
        counters.succeeded++;
      }
    });

    // 3c. Progress
    const before = processed;
    processed += batch.length;
    if (Math.floor(before / PROGRESS_INTERVAL) !== Math.floor(processed / PROGRESS_INTERVAL)) {
      logProgress();
    }
  }

  // 4. Final report
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalFailed = counters.failedEmbed + counters.failedDb;

  console.log(`\n[${ts()}] Embedding pass complete${interrupted ? ' (interrupted)' : ''}.`);
  console.log(`  Total processed:  ${processed}`);
  console.log(`  Succeeded:        ${counters.succeeded}`);
  console.log(`  Failed (total):   ${totalFailed}`);
  console.log(`    Embedding errors: ${counters.failedEmbed}`);
  console.log(`    DB errors:        ${counters.failedDb}`);
  console.log(`  Elapsed:          ${elapsed}s`);

  if (failures.length) {
    console.log(`\n  Failed fragrance IDs (id — stage — error):`);
    for (const f of failures.slice(0, 50)) {
      console.log(`    ${f.id} — ${f.stage} — ${f.error}`);
    }
    if (failures.length > 50) {
      console.log(`    ...and ${failures.length - 50} more.`);
    }
    console.log(`  Re-run the script to retry failed rows (they remain embedding IS NULL).`);
  }

  // 5. Verification
  console.log(`\n[${ts()}] Verifying embedded count in Supabase...`);
  const { count, error: verifyErr } = await supabase
    .from('fragrances')
    .select('id', { count: 'exact', head: true })
    .eq('tier', 'recommendable')
    .not('embedding', 'is', null)
    .not('embedding_brand', 'is', null);

  if (verifyErr) {
    console.error(`[${ts()}] Verification query failed:`, verifyErr.message);
  } else {
    console.log(`  recommendable rows WITH both embeddings: ${count}`);
    console.log(`  (Should equal the total count of recommendable fragrances.)`);
  }
}

main().catch((err) => {
  console.error(`[${ts()}] Unhandled error:`, err);
  process.exit(1);
});
