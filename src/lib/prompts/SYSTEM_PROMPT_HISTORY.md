# Recommendation System Prompt — Version History

## v1.1
- Date: 2026-05-24
- Changes:
  - Removed positional rank brackets from candidate format
  - Renamed `id=N` to `FRAGRANCE_ID: N` on its own line
  - Updated prompt instruction to emphasize copying FRAGRANCE_ID exactly
- Reason: Claude was sometimes using positional ranks (e.g., 9 for the 9th candidate) as the fragrance_id, causing picks to be dropped during candidate matching.

## v1.0 (initial)
- Date: 2026-05-23
- Notes: First version. Prescriptive on format and tone. May be too prescriptive — will tune after testing.
