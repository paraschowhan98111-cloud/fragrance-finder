import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, '../data/raw/fra_cleaned.csv');

function parseEuropeanFloat(str) {
  if (!str || str.trim() === '' || str.trim() === 'NA') return null;
  return parseFloat(str.trim().replace(',', '.'));
}

function parseYear(str) {
  if (!str || str.trim() === '' || str.trim() === 'NA') return null;
  const y = parseInt(str.trim(), 10);
  return isNaN(y) ? null : y;
}

function decade(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

function hr(char = '─', width = 60) {
  return char.repeat(width);
}

function printTable(rows, col1Label, col2Label, col1Width = 30) {
  const col2Width = 10;
  console.log(`  ${col1Label.padEnd(col1Width)} ${col2Label}`);
  console.log(`  ${hr('─', col1Width)} ${hr('─', col2Width)}`);
  for (const [key, val] of rows) {
    console.log(`  ${String(key).padEnd(col1Width)} ${String(val)}`);
  }
}

async function main() {
  const rows = [];

  await new Promise((resolve, reject) => {
    createReadStream(CSV_PATH)
      .pipe(parse({
        delimiter: ';',
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
      }))
      .on('data', (row) => rows.push(row))
      .on('error', reject)
      .on('end', resolve);
  });

  console.log('\n' + hr('═'));
  console.log('  FRAGRANTICA DATASET INSPECTION');
  console.log(hr('═'));

  // ── 1. Total row count ──────────────────────────────────────────────────────
  console.log(`\n  Total rows: ${rows.length.toLocaleString()}`);

  // ── 2. Gender distribution ──────────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  GENDER DISTRIBUTION\n${hr('─')}`);
  const genderMap = new Map();
  for (const row of rows) {
    const g = (row['Gender'] || '').trim().toLowerCase() || '(empty)';
    genderMap.set(g, (genderMap.get(g) ?? 0) + 1);
  }
  const genderSorted = [...genderMap.entries()].sort((a, b) => b[1] - a[1]);
  const knownGenders = new Set(['men', 'women', 'unisex', 'for women and men']);
  printTable(genderSorted, 'Value', 'Count');
  const unexpected = genderSorted.filter(([k]) => !knownGenders.has(k) && k !== '(empty)');
  if (unexpected.length) {
    console.log(`\n  ⚠  Unexpected gender values: ${unexpected.map(([k]) => JSON.stringify(k)).join(', ')}`);
  }

  // ── 3. Rating Count buckets ─────────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  RATING COUNT DISTRIBUTION\n${hr('─')}`);
  const buckets = { '<10': 0, '10-49': 0, '50-99': 0, '100-499': 0, '500-999': 0, '1000+': 0, 'missing': 0 };
  for (const row of rows) {
    const rc = parseEuropeanFloat(row['Rating Count']);
    if (rc === null) { buckets['missing']++; continue; }
    if (rc < 10)        buckets['<10']++;
    else if (rc < 50)   buckets['10-49']++;
    else if (rc < 100)  buckets['50-99']++;
    else if (rc < 500)  buckets['100-499']++;
    else if (rc < 1000) buckets['500-999']++;
    else                buckets['1000+']++;
  }
  printTable(Object.entries(buckets), 'Bucket', 'Count', 12);

  // ── 4. Top 20 brands ────────────────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  TOP 20 BRANDS BY FRAGRANCE COUNT\n${hr('─')}`);
  const brandMap = new Map();
  for (const row of rows) {
    const b = (row['Brand'] || '').trim() || '(empty)';
    brandMap.set(b, (brandMap.get(b) ?? 0) + 1);
  }
  const top20 = [...brandMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  printTable(top20.map(([k, v], i) => [`${i + 1}. ${k}`, v]), 'Brand', 'Count', 35);

  // ── 5. Release year by decade ───────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  RELEASE YEAR DISTRIBUTION BY DECADE\n${hr('─')}`);
  const decadeMap = new Map();
  let missingYear = 0;
  for (const row of rows) {
    const y = parseYear(row['Year']);
    if (y === null) { missingYear++; continue; }
    const d = decade(y);
    decadeMap.set(d, (decadeMap.get(d) ?? 0) + 1);
  }
  const decadeSorted = [...decadeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (missingYear) decadeSorted.push(['(missing)', missingYear]);
  printTable(decadeSorted, 'Decade', 'Count', 12);

  // ── 6. Non-empty Top notes ──────────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  TOP NOTES COVERAGE\n${hr('─')}`);
  let withTop = 0, withoutTop = 0;
  for (const row of rows) {
    const t = (row['Top'] || '').trim();
    if (t && t.toLowerCase() !== 'na') withTop++;
    else withoutTop++;
  }
  console.log(`  With non-empty Top notes : ${withTop.toLocaleString()}`);
  console.log(`  Empty / NA               : ${withoutTop.toLocaleString()}`);

  // ── 7. Encoding issues ──────────────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  ENCODING ISSUES (non-ASCII characters)\n${hr('─')}`);
  // eslint-disable-next-line no-control-regex
  const nonAsciiRe = /[^\x00-\x7F]/;
  let nonAsciiRows = 0;
  const nonAsciiExamples = [];
  for (const row of rows) {
    const combined = Object.values(row).join(' ');
    if (nonAsciiRe.test(combined)) {
      nonAsciiRows++;
      if (nonAsciiExamples.length < 3) {
        const field = Object.entries(row).find(([, v]) => nonAsciiRe.test(v));
        if (field) nonAsciiExamples.push(`  col=${field[0]}, value snippet: ${field[1].slice(0, 60)}`);
      }
    }
  }
  console.log(`  Rows with non-ASCII chars: ${nonAsciiRows.toLocaleString()} / ${rows.length.toLocaleString()}`);
  if (nonAsciiExamples.length) {
    console.log('  Sample problem rows:');
    nonAsciiExamples.forEach((e) => console.log(e));
  }

  // ── 8. Random sample rows ───────────────────────────────────────────────────
  console.log(`\n${hr('─')}\n  5 RANDOM SAMPLE ROWS\n${hr('─')}`);
  const sample = [...rows].sort(() => Math.random() - 0.5).slice(0, 5);
  for (const [i, row] of sample.entries()) {
    console.log(`\n  [${i + 1}] ${row['Brand']} — ${row['Perfume']} (${row['Year'] || 'n/a'})`);
    console.log(`      Gender       : ${row['Gender']}`);
    console.log(`      Country      : ${row['Country']}`);
    console.log(`      Rating       : ${row['Rating Value']} (${row['Rating Count']} votes)`);
    console.log(`      Top notes    : ${row['Top'] || '—'}`);
    console.log(`      Middle notes : ${row['Middle'] || '—'}`);
    console.log(`      Base notes   : ${row['Base'] || '—'}`);
    console.log(`      Main accords : ${[row['mainaccord1'], row['mainaccord2'], row['mainaccord3'], row['mainaccord4'], row['mainaccord5']].filter(Boolean).join(', ') || '—'}`);
    console.log(`      Perfumers    : ${[row['Perfumer1'], row['Perfumer2']].filter((p) => p && p.toLowerCase() !== 'unknown').join(', ') || 'unknown'}`);
  }

  console.log('\n' + hr('═') + '\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
