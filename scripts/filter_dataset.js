import { createReadStream, mkdirSync } from 'fs';
import { createWriteStream } from 'fs';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH  = join(__dirname, '../data/raw/fra_cleaned.csv');
const OUTPUT_DIR  = join(__dirname, '../data/processed');
const OUTPUT_PATH = join(OUTPUT_DIR, 'seed_fragrances.csv');

const MIN_RATING_COUNT_ELIGIBLE     = 25;
const MIN_RATING_COUNT_RECOMMENDABLE = 100;
const BRAND_CAP                     = 30;
const RECOMMENDABLE_LIMIT           = 2000;

const OUTPUT_COLUMNS = [
  'external_id', 'brand', 'name', 'release_year', 'gender_marketing',
  'rating_avg', 'rating_count', 'notes_top', 'notes_heart', 'notes_base',
  'accords', 'tier', 'source', 'source_url',
];

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFloat_(str) {
  if (!str || str.trim() === '' || str.trim().toLowerCase() === 'na') return null;
  return parseFloat(str.trim().replace(',', '.'));
}

function parseInt_(str) {
  if (!str || str.trim() === '' || str.trim().toLowerCase() === 'na') return null;
  const n = parseInt(str.trim().replace(',', ''), 10);
  return isNaN(n) ? null : n;
}

function splitNotes(str) {
  if (!str || str.trim() === '' || str.trim().toLowerCase() === 'na') return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapGender(raw) {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'men')    return 'masculine';
  if (v === 'women')  return 'feminine';
  return 'unisex';
}

function transform(r, tier) {
  const brand  = r['Brand'].trim().toLowerCase();
  const name   = r['Perfume'].trim();
  const accords = [
    r['mainaccord1'], r['mainaccord2'], r['mainaccord3'],
    r['mainaccord4'], r['mainaccord5'],
  ].map((s) => (s || '').trim()).filter(Boolean);

  return {
    external_id:      `${slugify(brand)}-${slugify(name)}`,
    brand,
    name,
    release_year:     parseInt_(r['Year']),
    gender_marketing: mapGender(r['Gender']),
    rating_avg:       parseFloat_(r['Rating Value']),
    rating_count:     parseInt_(r['Rating Count']),
    notes_top:        JSON.stringify(splitNotes(r['Top'])),
    notes_heart:      JSON.stringify(splitNotes(r['Middle'])),
    notes_base:       JSON.stringify(splitNotes(r['Base'])),
    accords:          JSON.stringify(accords),
    tier,
    source:           'fragrantica',
    source_url:       (r['url'] || '').trim(),
  };
}

function hr(char = '─', width = 62) { return char.repeat(width); }

function funnel(label, before, after) {
  const dropped = before - after;
  const pct = before > 0 ? ((dropped / before) * 100).toFixed(1) : '0.0';
  console.log(
    `  ${label.padEnd(40)} ${String(after).padStart(6)} rows` +
    (dropped > 0 ? `  (−${dropped}, ${pct}% dropped)` : ''),
  );
}

function printTable(rows, col1, col2, w1 = 30) {
  console.log(`  ${col1.padEnd(w1)} ${col2}`);
  console.log(`  ${hr('─', w1)} ${hr('─', 8)}`);
  for (const [k, v] of rows) {
    console.log(`  ${String(k).padEnd(w1)} ${String(v)}`);
  }
}

function topBrands(rows, n = 10) {
  const m = new Map();
  for (const r of rows) m.set(r.brand, (m.get(r.brand) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ── I/O ───────────────────────────────────────────────────────────────────────

async function loadRaw() {
  const rows = [];
  await new Promise((resolve, reject) => {
    createReadStream(INPUT_PATH, { encoding: 'latin1' })
      .pipe(parse({
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }))
      .on('data', (r) => rows.push(r))
      .on('error', reject)
      .on('end', resolve);
  });
  return rows;
}

async function writeOutput(rows) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  await new Promise((resolve, reject) => {
    const out = createWriteStream(OUTPUT_PATH, { encoding: 'utf8' });
    const s   = stringify({ header: true, columns: OUTPUT_COLUMNS });
    s.on('error', reject);
    out.on('finish', resolve);
    out.on('error', reject);
    s.pipe(out);
    for (const row of rows) s.write(row);
    s.end();
  });
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + hr('═'));
  console.log('  FRAGRANTICA DATASET FILTER  (tiered)');
  console.log(hr('═'));

  const raw = await loadRaw();
  console.log(`\n  Loaded ${raw.length.toLocaleString()} rows from input.\n`);

  // ── eligibility filters ───────────────────────────────────────────────────
  console.log(hr('─'));
  console.log('  FILTER FUNNEL');
  console.log(hr('─'));

  let stage = raw;
  const start = stage.length;

  stage = stage.filter((r) => {
    const rc = parseInt_(r['Rating Count']);
    return rc !== null && rc >= MIN_RATING_COUNT_ELIGIBLE;
  });
  funnel(`After Rating Count ≥ ${MIN_RATING_COUNT_ELIGIBLE}`, start, stage.length);
  const after1 = stage.length;

  stage = stage.filter((r) => {
    const y = parseInt_(r['Year']);
    return y !== null && y >= 1900;
  });
  funnel('After Year ≥ 1900 & numeric', after1, stage.length);
  const after2 = stage.length;

  stage = stage.filter((r) => {
    const top = (r['Top'] || '').trim();
    return top !== '' && top.toLowerCase() !== 'na';
  });
  funnel('After non-empty Top notes', after2, stage.length);
  const after3 = stage.length;

  stage = stage.filter((r) => {
    return (r['Perfume'] || '').trim() !== '' && (r['Brand'] || '').trim() !== '';
  });
  funnel('After non-empty Perfume & Brand', after3, stage.length);

  const eligible = stage;
  console.log(`\n  Eligible total: ${eligible.length.toLocaleString()} rows`);

  // ── tier assignment ───────────────────────────────────────────────────────
  //
  // 1. Candidate pool for recommendable: rating count ≥ 100.
  // 2. Apply brand cap (top 30 per brand by rating count).
  // 3. Top 2000 from that pool → recommendable.
  // 4. Everything else → searchable.

  const recommendableIds = new Set();

  const candidates = eligible
    .filter((r) => (parseInt_(r['Rating Count']) ?? 0) >= MIN_RATING_COUNT_RECOMMENDABLE)
    .sort((a, b) => (parseInt_(b['Rating Count']) ?? 0) - (parseInt_(a['Rating Count']) ?? 0));

  // brand cap — process in rating-count order so the best ones fill slots first
  const brandSlots = new Map();
  const cappedPool = [];
  for (const r of candidates) {
    const b = r['Brand'].trim().toLowerCase();
    const used = brandSlots.get(b) ?? 0;
    if (used < BRAND_CAP) {
      brandSlots.set(b, used + 1);
      cappedPool.push(r);
    }
  }

  // top 2000 from capped pool (already sorted by rating count)
  const recommendableRaw = cappedPool.slice(0, RECOMMENDABLE_LIMIT);

  // build a lookup key identical to external_id logic so we can match later
  const key = (r) => `${slugify(r['Brand'].trim().toLowerCase())}-${slugify(r['Perfume'].trim())}`;
  for (const r of recommendableRaw) recommendableIds.add(key(r));

  // ── transform all eligible rows ───────────────────────────────────────────
  const output = eligible.map((r) => {
    const tier = recommendableIds.has(key(r)) ? 'recommendable' : 'searchable';
    return transform(r, tier);
  });

  // sort: recommendable first (by rating_count desc), then searchable (by rating_count desc)
  output.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === 'recommendable' ? -1 : 1;
    return (b.rating_count ?? 0) - (a.rating_count ?? 0);
  });

  await writeOutput(output);

  // ── reporting ─────────────────────────────────────────────────────────────
  const recommendable = output.filter((r) => r.tier === 'recommendable');
  const searchable    = output.filter((r) => r.tier === 'searchable');

  console.log('\n' + hr('─'));
  console.log('  TIER COUNTS');
  console.log(hr('─'));
  console.log(`  recommendable : ${recommendable.length.toLocaleString()}`);
  console.log(`  searchable    : ${searchable.length.toLocaleString()}`);
  console.log(`  total         : ${output.length.toLocaleString()}`);

  console.log('\n' + hr('─'));
  console.log('  TOP 10 BRANDS — recommendable');
  console.log(hr('─'));
  printTable(topBrands(recommendable).map(([k, v], i) => [`${i + 1}. ${k}`, v]), 'Brand', 'Count', 34);

  console.log('\n' + hr('─'));
  console.log('  TOP 10 BRANDS — searchable');
  console.log(hr('─'));
  printTable(topBrands(searchable).map(([k, v], i) => [`${i + 1}. ${k}`, v]), 'Brand', 'Count', 34);

  console.log('\n' + hr('─'));
  console.log('  SAMPLE ROWS');
  console.log(hr('─'));

  const samples = [
    ['recommendable', recommendable[0], recommendable[Math.floor(recommendable.length / 2)]],
    ['searchable',    searchable[0],    searchable[Math.floor(searchable.length / 2)]],
  ];

  for (const [tierLabel, ...tierSamples] of samples) {
    console.log(`\n  ── ${tierLabel} ──`);
    for (const [i, r] of tierSamples.entries()) {
      console.log(`\n  [${i + 1}] ${r.external_id}`);
      console.log(`      brand         : ${r.brand}`);
      console.log(`      name          : ${r.name}`);
      console.log(`      release_year  : ${r.release_year}`);
      console.log(`      gender        : ${r.gender_marketing}`);
      console.log(`      rating_avg    : ${r.rating_avg}`);
      console.log(`      rating_count  : ${r.rating_count}`);
      console.log(`      notes_top     : ${r.notes_top}`);
      console.log(`      notes_heart   : ${r.notes_heart}`);
      console.log(`      notes_base    : ${r.notes_base}`);
      console.log(`      accords       : ${r.accords}`);
      console.log(`      tier          : ${r.tier}`);
    }
  }

  console.log(`\n  Output written to: ${OUTPUT_PATH}`);
  console.log('\n' + hr('═') + '\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
