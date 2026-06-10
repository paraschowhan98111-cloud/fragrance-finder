export type Gender = 'masculine' | 'feminine' | 'unisex' | 'any';
export type Occasion = 'office' | 'date' | 'casual' | 'formal' | 'gym' | 'signature';
export type Season = 'cold' | 'warm' | 'versatile';

export interface UserPreferences {
  anchor?: string;           // user's free text — fragrance name or description
  occasion: Occasion;
  season: Season;
  gender: Gender;
  budget_tier: 1 | 2 | 3 | 4;
  dealbreakers?: string[];   // accords or vibe_tags to exclude
}

export interface AnchorResolution {
  type: 'catalog_match' | 'free_text' | 'none';
  matched_fragrance?: {
    id: number;
    external_id: string;
    brand: string;
    name: string;
    similarity_score?: number;  // fuzzy match confidence (if catalog_match)
  };
  scent_embedding: number[] | null;
  brand_embedding: number[] | null;
  source_text?: string;  // what the user typed
}

export interface Candidate {
  id: number;
  external_id: string;
  brand: string;
  name: string;
  release_year: number | null;
  gender_marketing: string;
  vibe_summary: string | null;
  vibe_tags: string[];
  notes_top: string[];
  notes_heart: string[];
  notes_base: string[];
  accords: string[];
  longevity_hours: number | null;
  projection: string | null;
  price_tier: number;
  rating_avg: number;
  rating_count: number;
  scent_similarity: number;
  brand_similarity: number;
  combined_similarity: number;
  occasion_score: number;
  fit_score: number;
}

// ── Ranker types ──────────────────────────────────────────────────────────────

export interface RecommendationPick {
  fragrance_id: number;
  rank: number;
  rationale: string;
  key_notes: string[];
  what_to_expect: string;
  caveat?: string;
}

export interface RankingResult {
  picks: RecommendationPick[];
  explanation: string;
}

export interface RankerInput {
  prefs: UserPreferences;
  candidates: Candidate[];
  anchor: AnchorResolution;
}

export interface RankerOutput {
  result: RankingResult;
  /** Each pick joined with the full candidate row for display. */
  enriched_picks: (RecommendationPick & { candidate: Candidate })[];
  meta: {
    model: string;
    prompt_version: string;
    latency_ms: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}
