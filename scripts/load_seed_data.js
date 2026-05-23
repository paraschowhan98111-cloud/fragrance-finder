import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';

// ── env / config ──────────────────────────────────────────────────────────────

// dotenv/config loads .env by default; we need .env.local
const envPath = join(dirname(fileURLToPath(import.meta.url)), '../.env.local');
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Fatal: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH   = join(__dirname, '../data/processed/seed_fragrances.csv');
const BATCH_SIZE = 500;

// ── helpers ───────────────────────────────────────────────────────────────────

function elapsed(startMs) {
  const s = ((Date.now() - startMs) / 1000).toFixed(1);
  return `${s}s`;
}

function hr(char = '─', width = 62) { return char.repeat(width); }

function nullify(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string' && val.trim() === '') return null;
  return val;
}

function parseJsonArray(str) {
  if (!str || str.trim() === '') return null;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function parseRow(r) {
  return {
    external_id:       r.external_id,
    brand:             nullify(r.brand),
    name:              nullify(r.name),
    release_year:      r.release_year ? parseInt(r.release_year, 10) : null,
    gender_marketing:  nullify(r.gender_marketing),
    rating_avg:        r.rating_avg ? parseFloat(r.rating_avg) : null,
    rating_count:      r.rating_count ? parseInt(r.rating_count, 10) : null,
    notes_top:         parseJsonArray(r.notes_top),
    notes_heart:       parseJsonArray(r.notes_heart),
    notes_base:        parseJsonArray(r.notes_base),
    accords:           parseJsonArray(r.accords),
    tier:              nullify(r.tier),
    source:            nullify(r.source),
    source_url:        nullify(r.source_url),
    updated_at:        new Date().toISOString(),
  };
}

async function loadCSV() {
  const rows = [];
  await new Promise((resolve, reject) => {
    createReadStream(CSV_PATH, { encoding: 'utf8' })
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (r) => rows.push(parseRow(r)))
      .on('error', reject)
      .on('end', resolve);
  });
  return rows;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const globalStart = Date.now();

  console.log('\n' + hr('═'));
  console.log('  FRAGRANTICA SEED LOADER');
  console.log(hr('═'));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── safety check: current row count ────────────────────────────────────────
  console.log('\n  Checking current table state...');
  const { count: existingCount, error: countErr } = await supabase
    .from('fragrances')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error(`  Fatal: could not query fragrances table — ${countErr.message}`);
    process.exit(1);
  }

  console.log(`  Current row count in fragrances: ${(existingCount ?? 0).toLocaleString()}`);

  if (existingCount > 0) {
    const answer = await ask(
      `\n  Table has ${existingCount.toLocaleString()} existing rows. This will upsert (update existing, insert new). Continue? (yes/no) `,
    );
    if (answer !== 'yes') {
      console.log('\n  Aborted.');
      process.exit(0);
    }
  }

  // ── load CSV ────────────────────────────────────────────────────────────────
  console.log('\n  Reading CSV...');
  const rows = await loadCSV();
  console.log(`  Loaded ${rows.length.toLocaleString()} rows from seed_fragrances.csv`);

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  console.log(`  Batch size: ${BATCH_SIZE} | Total batches: ${totalBatches}\n`);
  console.log(hr('─'));

  // ── upsert in batches ───────────────────────────────────────────────────────
  let succeeded = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < totalBatches; i++) {
    const batchNum  = i + 1;
    const batch     = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const firstId   = batch[0].external_id;

    process.stdout.write(
      `  Batch ${String(batchNum).padStart(3)} / ${totalBatches}  (first: ${firstId.slice(0, 40)})  ... `,
    );

    const batchStart = Date.now();
    const { error } = await supabase
      .from('fragrances')
      .upsert(batch, { onConflict: 'external_id' });

    const batchElapsed = elapsed(batchStart);

    if (error) {
      process.stdout.write(`FAILED [${batchElapsed}]\n`);
      console.error(`    ↳ Batch ${batchNum} error (first id: ${firstId}): ${error.message}`);
      failed += batch.length;
      failures.push({ batch: batchNum, firstId, message: error.message });
    } else {
      process.stdout.write(`ok [${batchElapsed}]  total so far: ${(succeeded + batch.length).toLocaleString()}\n`);
      succeeded += batch.length;
    }
  }

  // ── final counts from DB ────────────────────────────────────────────────────
  console.log('\n' + hr('─'));
  console.log('  FINAL DB COUNTS');
  console.log(hr('─'));

  const { count: totalCount } = await supabase
    .from('fragrances')
    .select('*', { count: 'exact', head: true });

  const { count: recCount } = await supabase
    .from('fragrances')
    .select('*', { count: 'exact', head: true })
    .eq('tier', 'recommendable');

  console.log(`  SELECT count(*)                          → ${(totalCount ?? '?').toLocaleString()}`);
  console.log(`  SELECT count(*) WHERE tier='recommendable' → ${(recCount ?? '?').toLocaleString()}`);

  // ── summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + hr('─'));
  console.log('  SUMMARY');
  console.log(hr('─'));
  console.log(`  Rows attempted : ${rows.length.toLocaleString()}`);
  console.log(`  Rows succeeded : ${succeeded.toLocaleString()}`);
  console.log(`  Rows failed    : ${failed.toLocaleString()}`);
  if (failures.length) {
    console.log('\n  Failed batches:');
    for (const f of failures) {
      console.log(`    Batch ${f.batch} (first: ${f.firstId}): ${f.message}`);
    }
  }
  console.log(`  Total elapsed  : ${elapsed(globalStart)}`);
  console.log('\n' + hr('═') + '\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
