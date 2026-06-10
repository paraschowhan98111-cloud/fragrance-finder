import { supabase } from './supabase';

export interface FragranceDetail {
  id: number;
  external_id: string;
  brand: string;
  name: string;
  release_year: number | null;
  gender_marketing: string | null;
  vibe_summary: string | null;
  vibe_tags: string[] | null;
  accords: string[] | null;
  notes_top: string[] | null;
  notes_heart: string[] | null;
  notes_base: string[] | null;
  longevity_hours: number | null;
  projection: string | null;
  price_tier: number | null;
  rating_avg: number | null;
  rating_count: number | null;
}

export interface SimilarFragrance {
  id: number;
  brand: string;
  name: string;
  release_year: number | null;
  gender_marketing: string | null;
  vibe_summary: string | null;
  vibe_tags: string[] | null;
  accords: string[] | null;
  notes_top: string[] | null;
  notes_heart: string[] | null;
  notes_base: string[] | null;
  longevity_hours: number | null;
  projection: string | null;
  price_tier: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  similarity: number;
}

/**
 * Fetch a single fragrance by ID from the recommendable tier.
 * Returns null if not found (caller should trigger notFound()).
 */
export async function getFragranceById(id: number): Promise<FragranceDetail | null> {
  const { data, error } = await supabase
    .from('fragrances')
    .select(`
      id, external_id, brand, name, release_year, gender_marketing,
      vibe_summary, vibe_tags, accords,
      notes_top, notes_heart, notes_base,
      longevity_hours, projection, price_tier,
      rating_avg, rating_count
    `)
    .eq('id', id)
    .eq('tier', 'recommendable')
    .maybeSingle();

  if (error) {
    console.error('[fragrance-data] getFragranceById error:', error.message);
    return null;
  }
  return data as FragranceDetail | null;
}

/**
 * Fetch top N most-similar fragrances from cross-brand recommendable tier.
 */
export async function getSimilarFragrances(id: number, count = 6): Promise<SimilarFragrance[]> {
  const { data, error } = await supabase.rpc('find_similar_fragrances', {
    target_id: id,
    match_count: count,
  });

  if (error) {
    console.error('[fragrance-data] getSimilarFragrances error:', error.message);
    return [];
  }
  return (data ?? []) as SimilarFragrance[];
}
