/**
 * 02_check_status.js
 *
 * Reads the batch state written by 01_submit_batch.js, polls Anthropic for
 * the current batch status, and prints a progress summary. Safe to run as
 * many times as you like — it has no side effects.
 *
 * Prerequisites:
 *   - data/processed/enrichment_batch_state.json must exist (run step 1 first)
 *   - .env.local with ANTHROPIC_API_KEY
 *
 * Run next when status is "ended": node scripts/enrichment/03_apply_results.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Fatal: ANTHROPIC_API_KEY must be set in .env.local');
  process.exit(1);
}

// ── constants ─────────────────────────────────────────────────────────────────

const STATE_PATH = join(ROOT, 'data/processed/enrichment_batch_state.json');

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

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  process.on('SIGINT', () => {
    console.log('\nInterrupted.');
    process.exit(0);
  });

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
  const elapsedMs = Date.now() - new Date(submitted_at).getTime();

  console.log(`[${ts()}] Checking batch status`);
  console.log(`  Batch ID:     ${batch_id}`);
  console.log(`  Submitted at: ${submitted_at}`);
  console.log(`  Elapsed:      ${formatElapsed(elapsedMs)}`);
  console.log(`  Total rows:   ${fragrance_count}`);

  // 2. Retrieve batch from Anthropic
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let batch;
  try {
    batch = await anthropic.messages.batches.retrieve(batch_id);
  } catch (err) {
    console.error(`[${ts()}] Anthropic API error:`, err.message);
    process.exit(1);
  }

  // 3. Print status
  const counts = batch.request_counts ?? {};
  const processing  = counts.processing  ?? 0;
  const succeeded   = counts.succeeded   ?? 0;
  const errored     = counts.errored     ?? 0;
  const canceled    = counts.canceled    ?? 0;
  const expired     = counts.expired     ?? 0;
  const total       = processing + succeeded + errored + canceled + expired;
  const done        = succeeded + errored + canceled + expired;
  const pct         = total > 0 ? ((done / total) * 100).toFixed(1) : '0.0';

  console.log(`\n  Status:       ${batch.processing_status}`);
  console.log(`  Progress:     ${done}/${total} (${pct}%)`);
  console.log(`  ├ processing: ${processing}`);
  console.log(`  ├ succeeded:  ${succeeded}`);
  console.log(`  ├ errored:    ${errored}`);
  console.log(`  ├ canceled:   ${canceled}`);
  console.log(`  └ expired:    ${expired}`);

  if (batch.ends_at) {
    console.log(`\n  Ends at:      ${batch.ends_at}`);
  }

  if (batch.processing_status === 'ended') {
    console.log(`\n  Batch is complete.`);
    console.log(`  Next step: node scripts/enrichment/03_apply_results.js`);
  } else {
    console.log(`\n  Batch is still processing. Run this script again to check progress.`);
  }
}

main().catch((err) => {
  console.error(`[${ts()}] Unhandled error:`, err);
  process.exit(1);
});
