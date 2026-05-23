import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const anchors = [
  'creed-aventus',
  'tom-ford-tobacco-vanille',
  'chanel-bleu-de-chanel',
  'mugler-alien',
  'chanel-coco-mademoiselle'
];

for (const slug of anchors) {
  const { data: anchor } = await sb.from('fragrances')
    .select('id, brand, name, embedding')
    .eq('external_id', slug)
    .single();

  if (!anchor) { console.log('NOT FOUND: ' + slug + '\n'); continue; }

  const { data: similar, error } = await sb.rpc('match_fragrances', {
    query_embedding: anchor.embedding,
    match_threshold: 0.0,
    match_count: 6
  });

  if (error) {
    // Fallback: direct query if RPC doesn't exist yet
    const { data: fallback } = await sb
      .from('fragrances')
      .select('brand, name, embedding')
      .eq('tier', 'recommendable')
      .not('embedding', 'is', null)
      .limit(2000);
    
    // Compute cosine similarity in JS
    const anchorVec = typeof anchor.embedding === 'string' ? JSON.parse(anchor.embedding) : anchor.embedding;
    const scored = fallback.map(f => {
      const v = typeof f.embedding === 'string' ? JSON.parse(f.embedding) : f.embedding;
      let dot = 0, a2 = 0, b2 = 0;
      for (let i = 0; i < anchorVec.length; i++) {
        dot += anchorVec[i] * v[i];
        a2 += anchorVec[i] * anchorVec[i];
        b2 += v[i] * v[i];
      }
      const sim = dot / (Math.sqrt(a2) * Math.sqrt(b2));
      return { brand: f.brand, name: f.name, sim };
    });
    scored.sort((a, b) => b.sim - a.sim);
    
    console.log('━━━ Similar to ' + anchor.brand + ' / ' + anchor.name + ' ━━━');
    scored.slice(0, 6).forEach(s => console.log('  ' + s.sim.toFixed(3) + '  ' + s.brand + ' / ' + s.name));
    console.log();
  }
}
