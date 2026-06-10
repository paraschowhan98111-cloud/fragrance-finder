#!/usr/bin/env node
/**
 * test_10_profiles.js
 *
 * Runs 10 recommendation profiles sequentially against
 * http://localhost:3000/api/recommend, collects SSE events, and writes:
 *
 *   data/processed/profile_test_results.json   — structured data
 *   data/processed/profile_test_results.md     — human-readable markdown
 *
 * Usage (dev server must already be running):
 *   node --env-file=.env.local scripts/test_10_profiles.js
 */

import dotenv from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

dotenv.config({ path: join(ROOT, '.env.local') });

const BASE_URL = 'http://localhost:3000';
const OUT_DIR  = join(ROOT, 'data', 'processed');

// ── ANSI helpers ───────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  cyan:    '\x1b[36m',
};
const c = (col, t) => `${C[col]}${t}${C.reset}`;
const hr = (ch = '─', w = 62) => ch.repeat(w);

// ── Profiles ───────────────────────────────────────────────────────────────────

const profiles = [
  { id: 1, label: 'Niche enthusiast anchor / signature', prefs: { anchor: 'le labo santal 33', occasion: 'signature', season: 'versatile', gender: 'unisex', budget_tier: 4, dealbreakers: ['aquatic'] } },
  { id: 2, label: 'Common designer feminine / date', prefs: { anchor: 'coco mademoiselle', occasion: 'date', season: 'warm', gender: 'any', budget_tier: 4, dealbreakers: [] } },
  { id: 3, label: 'Niche luxury / signature', prefs: { anchor: 'aventus', occasion: 'signature', season: 'versatile', gender: 'masculine', budget_tier: 4, dealbreakers: [] } },
  { id: 4, label: 'Free-text descriptor (object)', prefs: { anchor: 'old leather library', occasion: 'casual', season: 'cold', gender: 'any', budget_tier: 3, dealbreakers: [] } },
  { id: 5, label: 'Heavily misspelled fragrance name', prefs: { anchor: 'akwa di gio', occasion: 'office', season: 'warm', gender: 'masculine', budget_tier: 3, dealbreakers: [] } },
  { id: 6, label: 'No anchor, low budget', prefs: { occasion: 'casual', season: 'warm', gender: 'feminine', budget_tier: 1, dealbreakers: [] } },
  { id: 7, label: 'Strong dealbreakers, niche taste', prefs: { anchor: 'incense and smoke', occasion: 'formal', season: 'cold', gender: 'any', budget_tier: 4, dealbreakers: ['sweet', 'aquatic', 'gourmand'] } },
  { id: 8, label: 'Gym context (unusual)', prefs: { anchor: 'sauvage', occasion: 'gym', season: 'warm', gender: 'masculine', budget_tier: 2, dealbreakers: [] } },
  { id: 9, label: 'Older fragrance reference', prefs: { anchor: 'habit rouge', occasion: 'signature', season: 'cold', gender: 'masculine', budget_tier: 3, dealbreakers: [] } },
  { id: 10, label: 'Unisex anchor, conflicting dealbreakers', prefs: { anchor: 'by the fireplace', occasion: 'casual', season: 'cold', gender: 'unisex', budget_tier: 3, dealbreakers: ['floral', 'citrus'] } },
];

// ── SSE parser ─────────────────────────────────────────────────────────────────

/**
 * Parses a Server-Sent Events stream from a fetch Response.
 * Yields { event, data } objects as they arrive.
 *
 * @param {Response} response
 * @returns {AsyncGenerator<{event: string, data: string}>}
 */
async function* parseSse(response) {
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on double-newline (SSE message boundary)
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = 'message';
      let dataLine  = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice('event: '.length).trim();
        } else if (line.startsWith('data: ')) {
          dataLine = line.slice('data: '.length).trim();
        }
      }

      if (dataLine) yield { event: eventType, data: dataLine };
    }
  }
}

// ── Single profile runner ──────────────────────────────────────────────────────

/**
 * Calls the API for one profile and collects all SSE events into a result object.
 *
 * @param {{ id: number, label: string, prefs: object }} profile
 * @returns {Promise<ProfileResult>}
 */
async function runProfile(profile) {
  const t0 = performance.now();

  /** @type {ProfileResult} */
  const result = {
    id:          profile.id,
    label:       profile.label,
    prefs:       profile.prefs,
    meta:        null,
    picks:       [],
    explanation: null,
    done:        null,
    errors:      [],
    wall_ms:     0,
  };

  // ── Fetch ────────────────────────────────────────────────────────────────────
  let response;
  try {
    response = await fetch(`${BASE_URL}/api/recommend`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(profile.prefs),
    });
  } catch (err) {
    result.errors.push(`Connection failed: ${err.message}`);
    result.wall_ms = Math.round(performance.now() - t0);
    return result;
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '(no body)');
    result.errors.push(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    result.wall_ms = Math.round(performance.now() - t0);
    return result;
  }

  // ── Consume SSE events ───────────────────────────────────────────────────────
  for await (const { event, data: rawData } of parseSse(response)) {
    let data;
    try {
      data = JSON.parse(rawData);
    } catch (err) {
      console.error(c('red', `  [SSE parse error] ${err.message}: ${rawData.slice(0, 80)}`));
      continue;
    }

    switch (event) {
      case 'meta':
        result.meta = {
          model:          data.model,
          prompt_version: data.prompt_version,
        };
        break;

      case 'pick':
        result.picks.push({
          rank:           data.rank,
          fragrance_id:   data.fragrance_id,
          brand:          data.candidate?.brand ?? '?',
          name:           data.candidate?.name  ?? '?',
          rationale:      data.rationale         ?? '',
          key_notes:      data.key_notes         ?? [],
          what_to_expect: data.what_to_expect    ?? '',
          caveat:         data.caveat            ?? null,
        });
        break;

      case 'explanation':
        result.explanation = data.explanation ?? null;
        break;

      case 'done':
        result.done = {
          latency_ms:        data.latency_ms,
          input_tokens:      data.input_tokens,
          output_tokens:     data.output_tokens,
          estimated_cost_usd: data.estimated_cost_usd,
        };
        break; // stream should close after done, but force-exit the loop

      case 'error':
        result.errors.push(data.message ?? 'unknown error');
        break;
    }

    if (event === 'done') break;
  }

  result.wall_ms = Math.round(performance.now() - t0);
  return result;
}

// ── Markdown builder ───────────────────────────────────────────────────────────

function fmtMs(ms) {
  return ms != null ? ms.toLocaleString('en-US') + 'ms' : '?ms';
}

function fmtCost(usd) {
  return usd != null ? `~$${usd.toFixed(3)}` : 'n/a';
}

function buildMarkdown(results) {
  const date  = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`# Profile Test Results — ${date}`, '');

  for (const r of results) {
    lines.push(`## Profile ${r.id}: ${r.label}`, '');

    // Prefs summary
    const p          = r.prefs;
    const anchorPart = p.anchor ? `anchor="${p.anchor}" · ` : 'no anchor · ';
    const dbPart     = p.dealbreakers?.length
      ? p.dealbreakers.join(', ')
      : 'no dealbreakers';
    lines.push(
      `**Prefs:** ${anchorPart}${p.occasion} · ${p.season} · ${p.gender} · tier ${p.budget_tier} · ${dbPart}`,
      '',
    );

    // Latency / cost
    const latencyStr = r.done ? fmtMs(r.done.latency_ms) : `wall: ${fmtMs(r.wall_ms)}`;
    const costStr    = r.done ? fmtCost(r.done.estimated_cost_usd) : 'n/a';
    lines.push(`**Latency:** ${latencyStr} · **Cost:** ${costStr}`, '');

    // Errors
    if (r.errors.length > 0) {
      lines.push('**Errors:**');
      for (const e of r.errors) lines.push(`- ${e}`);
      lines.push('');
    }

    // Picks
    if (r.picks.length === 0) {
      lines.push('_No picks returned._', '');
    } else {
      lines.push('### Picks', '');
      for (const pick of r.picks) {
        lines.push(`**#${pick.rank} — ${pick.brand} / ${pick.name}**`, '');
        lines.push(`> ${pick.rationale}`, '');
        lines.push(`Key notes: ${pick.key_notes.length ? pick.key_notes.join(', ') : 'n/a'}`);
        lines.push(`What to expect: ${pick.what_to_expect || 'n/a'}`);
        lines.push(`Caveat: ${pick.caveat || 'none'}`, '');
        lines.push('---', '');
      }
    }

    // Overall explanation
    lines.push('### Overall explanation', '');
    lines.push(
      r.explanation ? `> ${r.explanation}` : '_No explanation provided._',
      '',
      '',
    );
  }

  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────────────

const total    = profiles.length;
const runStart = performance.now();
const allResults = [];

console.log('');
console.log(c('bold', `Running ${total} profiles against ${BASE_URL}/api/recommend`));
console.log(hr());

for (const profile of profiles) {
  process.stdout.write(`[${profile.id}/${total}] running ${c('cyan', `"${profile.label}"`)}... `);

  const result = await runProfile(profile);
  allResults.push(result);

  const secs     = (result.wall_ms / 1000).toFixed(1);
  const pickStr  = `${result.picks.length} pick${result.picks.length !== 1 ? 's' : ''}`;
  const errTag   = result.errors.length > 0
    ? c('red', ` ⚠ ${result.errors.length} error(s)`)
    : '';

  console.log(c('green', `done`) + ` in ${secs}s (${pickStr})${errTag}`);
}

const totalMs = Math.round(performance.now() - runStart);

// ── Write outputs ──────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });

// JSON — structured data only (no markdown blob)
const jsonPath = join(OUT_DIR, 'profile_test_results_v2.json');
writeFileSync(jsonPath, JSON.stringify(allResults, null, 2), 'utf-8');

// Markdown — human-readable
const mdPath = join(OUT_DIR, 'profile_test_results_v2.md');
writeFileSync(mdPath, buildMarkdown(allResults), 'utf-8');

console.log('');
console.log(`JSON saved → ${c('dim', jsonPath)}`);
console.log(`MD   saved → ${c('dim', mdPath)}`);

// ── Summary stats ──────────────────────────────────────────────────────────────

const succeeded  = allResults.filter(r => r.picks.length > 0).length;
const failed     = total - succeeded;
const totalCost  = allResults.reduce((sum, r) => sum + (r.done?.estimated_cost_usd ?? 0), 0);

const latencies = allResults
  .filter(r => r.done?.latency_ms != null)
  .map(r => r.done.latency_ms);
const avgLatency = latencies.length
  ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
  : 0;
const minLatency = latencies.length ? Math.min(...latencies) : 0;
const maxLatency = latencies.length ? Math.max(...latencies) : 0;

const allErrors = allResults.flatMap(r =>
  r.errors.map(e => `Profile ${r.id} (${r.label}): ${e}`),
);

console.log('');
console.log(c('bold', hr('═')));
console.log(c('bold', 'SUMMARY'));
console.log(c('bold', hr('═')));
console.log(`Total time    : ${(totalMs / 1000).toFixed(1)}s`);
console.log(`Total cost    : ~$${totalCost.toFixed(4)}`);
console.log(`Succeeded     : ${c('green', String(succeeded))}/${total}  (${failed} failed)`);
console.log(`Latency avg   : ${avgLatency.toLocaleString('en-US')}ms`);
console.log(`Latency min   : ${minLatency.toLocaleString('en-US')}ms`);
console.log(`Latency max   : ${maxLatency.toLocaleString('en-US')}ms`);

if (allErrors.length > 0) {
  console.log('');
  console.log(c('red', `Errors (${allErrors.length}):`));
  for (const e of allErrors) console.log(c('red', `  • ${e}`));
}

console.log(hr('═'));
console.log('');
