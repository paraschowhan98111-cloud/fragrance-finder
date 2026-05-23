/**
 * 03_apply_results.js
 *
 * Downloads results from a completed Anthropic batch, validates each response
 * with Zod, and upserts enrichment fields into Supabase. Failures are logged
 * to data/processed/enrichment_failures.jsonl for manual retry.
 *
 * Prerequisites:
 *   - data/processed/enrichment_batch_state.json must exist (run steps 1 & 2 first)
 *   - Batch status must be "ended" (verified before any writes)
 *   - .env.local with SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
 *   - npm packages: @supabase/supabase-js, @anthropic-ai/sdk, dotenv, zod
 *
 * Outputs:
 *   - Updates to Supabase fragrances table
 *   - data/processed/enrichment_failures.jsonl  (failed rows, appended)
 */

import { readFileSync, appendFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

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

const STATE_PATH    = join(ROOT, 'data/processed/enrichment_batch_state.json');
const FAILURES_PATH = join(ROOT, 'data/processed/enrichment_failures.jsonl');
const CONCURRENCY   = 10;
const PROGRESS_INTERVAL = 50;

// ── clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Zod schema ────────────────────────────────────────────────────────────────

const proportion = z.number().min(0).max(1);

const EnrichmentSchema = z.object({
  vibe_summary:       z.string().min(10).max(500),
  occasion_office:    proportion,
  occasion_date:      proportion,
  occasion_casual:    proportion,
  occasion_formal:    proportion,
  occasion_gym:       proportion,
  occasion_signature: proportion,
  season_spring:      proportion,
  season_summer:      proportion,
  season_fall:        proportion,
  season_winter:      proportion,
  vibe_tags:          z.array(z.string()).min(1).max(8),
  longevity_hours:    z.number().min(0.5).max(16),
  projection:         z.enum(['intimate', 'moderate', 'beast']),
  price_tier:         z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

// ── helpers ───────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function formatElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Strip accidental markdown fences and surrounding whitespace before JSON.parse */
function cleanJson(raw) {
  let s = raw.trim();
  // Remove ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return s.trim();
}

function logFailure(entry) {
  mkdirSync(join(ROOT, 'data/processed'), { recursive: true });
  appendFileSync(FAILURES_PATH, JSON.stringify(entry) + '\n');
}

/** Run async tasks with a max concurrency limit */
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

// ── main ──────────────────────────────────────────────────────────────────────

let interrupted = false;
process.on('SIGINT', () => {
  console.log(`\n[${ts()}] Interrupted — stopping after current in-flight requests complete.`);
  interrupted = true;
});

async function main() {
  const startTime = Date.now();

  // 1. Read state file
  let state;
  try {
    state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    console.error(`Fatal: could not read state file at ${STATE_PATH}`);
    console.error('Run 01_submit_batch.js first.');
    process.exit(1);
  }

  const { batch_id, submitted_at, fragrance_count } = state;
  console.log(`[${ts()}] Applying batch results`);
  console.log(`  Batch ID:   ${batch_id}`);
  console.log(`  Submitted:  ${submitted_at}`);
  console.log(`  Total rows: ${fragrance_count}`);

  // 2. Verify batch is ended
  console.log(`[${ts()}] Verifying batch status...`);
  let batch;
  try {
    batch = await anthropic.messages.batches.retrieve(batch_id);
  } catch (err) {
    console.error(`[${ts()}] Anthropic API error:`, err.message);
    process.exit(1);
  }

  if (batch.processing_status !== 'ended') {
    console.error(`\nBatch is not complete yet (status: ${batch.processing_status}).`);
    console.error('Run 02_check_status.js to monitor progress, then retry when ended.');
    process.exit(1);
  }

  console.log(`[${ts()}] Batch status confirmed: ended`);

  // 3. Download results
  console.log(`[${ts()}] Streaming batch results from Anthropic...`);

  const allResults = [];
  try {
    for await (const result of await anthropic.messages.batches.results(batch_id)) {
      allResults.push(result);
    }
  } catch (err) {
    console.error(`[${ts()}] Error streaming results:`, err.message);
    process.exit(1);
  }

  console.log(`[${ts()}] Downloaded ${allResults.length} results.`);

  // 4. Process results with bounded concurrency
  const counters = {
    succeeded: 0,
    failedJsonParse: 0,
    failedValidation: 0,
    failedDb: 0,
    skipped: 0,
  };

  async function processResult(result) {
    if (interrupted) return;

    const fragranceId = result.custom_id;

    // Handle non-succeeded API results
    // Note: result.result.type is the actual location — `result.type` is undefined
    if (result.result?.type !== 'succeeded') {
      counters.skipped++;
      logFailure({
        fragrance_id: fragranceId,
        failure_type: 'api_error',
        error: `Result type: ${result.result?.type}`,
        raw: null,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const raw = result.result?.message?.content?.[0]?.text ?? '';

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(cleanJson(raw));
    } catch (err) {
      counters.failedJsonParse++;
      logFailure({
        fragrance_id: fragranceId,
        failure_type: 'json_parse',
        error: err.message,
        raw,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate with Zod
    const validation = EnrichmentSchema.safeParse(parsed);
    if (!validation.success) {
      counters.failedValidation++;
      logFailure({
        fragrance_id: fragranceId,
        failure_type: 'validation',
        error: JSON.stringify(validation.error.flatten()),
        raw,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = validation.data;

    // Update Supabase
    const { error: dbError } = await supabase
      .from('fragrances')
      .update({
        vibe_summary:       data.vibe_summary,
        occasion_office:    data.occasion_office,
        occasion_date:      data.occasion_date,
        occasion_casual:    data.occasion_casual,
        occasion_formal:    data.occasion_formal,
        occasion_gym:       data.occasion_gym,
        occasion_signature: data.occasion_signature,
        season_spring:      data.season_spring,
        season_summer:      data.season_summer,
        season_fall:        data.season_fall,
        season_winter:      data.season_winter,
        vibe_tags:          data.vibe_tags,
        longevity_hours:    data.longevity_hours,
        projection:         data.projection,
        price_tier:         data.price_tier,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', fragranceId);

    if (dbError) {
      counters.failedDb++;
      logFailure({
        fragrance_id: fragranceId,
        failure_type: 'db_error',
        error: dbError.message,
        raw,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    counters.succeeded++;
  }

  // Wrap with progress logging
  let processed = 0;
  async function processWithProgress(result) {
    await processResult(result);
    processed++;
    if (processed % PROGRESS_INTERVAL === 0 || processed === allResults.length) {
      const elapsed = formatElapsed(Date.now() - startTime);
      const pct = ((processed / allResults.length) * 100).toFixed(1);
      console.log(
        `[${ts()}] Progress: ${processed}/${allResults.length} (${pct}%) — ` +
        `ok=${counters.succeeded} parse_err=${counters.failedJsonParse} ` +
        `val_err=${counters.failedValidation} db_err=${counters.failedDb} ` +
        `skipped=${counters.skipped} elapsed=${elapsed}`
      );
    }
  }

  console.log(`[${ts()}] Applying updates with concurrency=${CONCURRENCY}...`);
  await runWithConcurrency(allResults, CONCURRENCY, processWithProgress);

  // 5. Final summary
  const totalElapsed = formatElapsed(Date.now() - startTime);
  const totalFailed = counters.failedJsonParse + counters.failedValidation + counters.failedDb + counters.skipped;

  console.log(`\n[${ts()}] Done.`);
  console.log(`  Total processed:    ${allResults.length}`);
  console.log(`  Succeeded:          ${counters.succeeded}`);
  console.log(`  Failed (total):     ${totalFailed}`);
  console.log(`    JSON parse errors:  ${counters.failedJsonParse}`);
  console.log(`    Validation errors:  ${counters.failedValidation}`);
  console.log(`    DB errors:          ${counters.failedDb}`);
  console.log(`    API/skipped:        ${counters.skipped}`);
  console.log(`  Total elapsed:      ${totalElapsed}`);

  if (totalFailed > 0) {
    console.log(`\n  Failures logged to: ${FAILURES_PATH}`);
  }
}

main().catch((err) => {
  console.error(`[${ts()}] Unhandled error:`, err);
  process.exit(1);
});
