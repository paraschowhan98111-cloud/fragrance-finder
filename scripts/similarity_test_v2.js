import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SCENT_WEIGHT = 0.85;
const BRAND_WEIGHT = 0.15;

const anchors = [
  'creed-aventus',
  'tom-ford-tobacco-vanille',
  'chanel-bleu-de-chanel',
  'mugler-alien',
  'chanel-coco-mademoiselle'
];

function parseVec(v) {
  return typeof v === 'string' ? JSON.parse(v) : v;
}

function cosine(a, b) {
  let dot = 0, a2 = 0, b2 = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    a2 += a[i] * a[i];
    b2 += b[i] * b[i];
  }
  return dot / (Math.sqrt(a2) * Math.sqrt(b2));
}

// Paginate to load ALL recommendable rows (Supabase caps at 1000 per query)
const all = [];
const PAGE_SIZE = 1000;
let from = 0;
while (true) {
  const { data, error } = await sb
    .from('fragrances')
    .select('id, external_id, brand, name, embedding, embedding_brand')
    .eq('tier', 'recommendable')
    .not('embedding', 'is', null)
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (error) { console.error('Error:', error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE_SIZE) break;
  from += PAGE_SIZE;
}

console.log('Loaded ' + all.length + ' rows for similarity comparison.\n');
console.log('Weights: scent=' + SCENT_WEIGHT + ', brand=' + BRAND_WEIGHT + '\n');

for (const slug of anchors) {
  const anchor = all.find(r => r.external_id === slug);
  if (!anchor) { console.log('NOT FOUND: ' + slug + '\n'); continue; }

  const aScent = parseVec(anchor.embedding);
  const aBrand = parseVec(anchor.embedding_brand);

  const scored = all
    .filter(r => r.id !== anchor.id)
    .map(r => {
      const scentSim = cosine(aScent, parseVec(r.embedding));
      const brandSim = cosine(aBrand, parseVec(r.embedding_brand));
      const final = SCENT_WEIGHT * scentSim + BRAND_WEIGHT * brandSim;
      return { brand: r.brand, name: r.name, scentSim, brandSim, final };
    });
  scored.sort((a, b) => b.final - a.final);

  console.log('━━━ Similar to ' + anchor.brand + ' / ' + anchor.name + ' ━━━');
  console.log('  final  scent  brand   fragrance');
  scored.slice(0, 6).forEach(s => {
    console.log('  ' + s.final.toFixed(3) + '  ' + s.scentSim.toFixed(3) + '  ' + s.brandSim.toFixed(3) + '   ' + s.brand + ' / ' + s.name);
  });
  console.log();
}
