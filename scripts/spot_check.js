import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const checks = [
  'mugler-alien',
  'dior-sauvage',
  'chanel-bleu-de-chanel',
  'creed-aventus',
  'tom-ford-tobacco-vanille',
  'yves-saint-laurent-libre',
  'chanel-coco-mademoiselle',
  'jean-paul-gaultier-le-male',
  'maison-margiela-replica-by-the-fireplace',
  'guerlain-shalimar'
];

for (const id of checks) {
  const { data } = await sb.from('fragrances')
    .select('brand, name, gender_marketing, vibe_summary, occasion_office, occasion_date, occasion_gym, season_summer, season_winter, vibe_tags, longevity_hours, projection, price_tier')
    .eq('external_id', id)
    .single();
  if (!data) { console.log('NOT FOUND: ' + id + '\n'); continue; }
  console.log('━━━ ' + data.brand + ' / ' + data.name + ' (' + data.gender_marketing + ') ━━━');
  console.log('Vibe:    ' + data.vibe_summary);
  console.log('Occasion: office=' + data.occasion_office + ' date=' + data.occasion_date + ' gym=' + data.occasion_gym);
  console.log('Season:   summer=' + data.season_summer + ' winter=' + data.season_winter);
  console.log('Tags:     ' + JSON.stringify(data.vibe_tags));
  console.log('Wear:     ' + data.longevity_hours + 'h, projection=' + data.projection + ', tier=' + data.price_tier);
  console.log();
}
