#!/usr/bin/env node
/**
 * test_api_streaming.js
 *
 * End-to-end test for POST /api/recommend (SSE streaming).
 * Starts the Next.js dev server externally — run this after `npm run dev`.
 *
 * Usage:
 *   node scripts/test_api_streaming.js
 *
 * Expects the server at http://localhost:3000.
 */

// ── ANSI colour helpers ───────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

function c(color, text) {
  return `${C[color]}${text}${C.reset}`;
}

function hr(char = '─', width = 66) {
  return char.repeat(width);
}

const BASE_URL = 'http://localhost:3000';

// ── SSE parser ────────────────────────────────────────────────────────────────

/**
 * Parses a Server-Sent Events stream from a fetch Response.
 * Yields { event, data } objects as they arrive.
 *
 * @param {Response} response
 * @returns {AsyncGenerator<{event: string, data: string}>}
 */
async function* parseSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on double-newline (SSE message boundary)
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? ''; // keep the incomplete tail

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = 'message';
      let dataLine = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice('event: '.length).trim();
        } else if (line.startsWith('data: ')) {
          dataLine = line.slice('data: '.length).trim();
        }
      }

      if (dataLine) {
        yield { event: eventType, data: dataLine };
      }
    }
  }
}

// ── Event printer ─────────────────────────────────────────────────────────────

function printEvent(event, data) {
  switch (event) {
    case 'meta':
      console.log(
        c('dim', `  [meta] model=${data.model}  prompt=${data.prompt_version}`),
      );
      break;

    case 'pick': {
      const { rank, candidate, rationale, key_notes, what_to_expect, caveat } = data;
      const brandName = `${candidate.brand} / ${candidate.name}`;
      console.log(`\n  ${c('bold', `#${rank}`)}  ${c('cyan', brandName)}  ${c('dim', `id=${candidate.id}`)}`);
      console.log(`  ${c('yellow', 'Rationale')}   : ${rationale}`);
      console.log(`  ${c('yellow', 'Key notes')}   : ${key_notes.join(', ')}`);
      console.log(`  ${c('yellow', 'What to exp')} : ${what_to_expect}`);
      if (caveat) {
        console.log(`  ${c('yellow', 'Caveat')}      : ${caveat}`);
      }
      break;
    }

    case 'explanation':
      console.log(`\n  ${c('green', 'Explanation')}: ${data.explanation}`);
      break;

    case 'done': {
      const { latency_ms, input_tokens, output_tokens, estimated_cost_usd } = data;
      console.log(`\n  ${c('dim', hr())}`);
      console.log(
        `  ${c('dim', `Latency: ${latency_ms}ms  |  Tokens: ${input_tokens} in / ${output_tokens} out  |  Cost: ~$${estimated_cost_usd.toFixed(4)}`)}`,
      );
      break;
    }

    case 'error':
      console.error(`\n  ${c('red', '✗ ERROR')}: ${data.message}`);
      break;

    default:
      console.log(c('dim', `  [${event}] ${JSON.stringify(data)}`));
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runScenario(label, prefs) {
  console.log('\n' + c('bold', hr('═')));
  console.log(`  ${c('bold', 'SCENARIO')}: ${label}`);
  console.log(c('bold', hr('═')));

  const t0 = performance.now();

  let response;
  try {
    response = await fetch(`${BASE_URL}/api/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
  } catch (err) {
    console.error(
      c('red', `\n  ✗ Could not connect to ${BASE_URL} — is the dev server running?`),
    );
    console.error(c('red', `  ${err.message}`));
    return;
  }

  if (!response.ok || !response.body) {
    const text = await response.text();
    console.error(c('red', `\n  ✗ HTTP ${response.status}: ${text}`));
    return;
  }

  console.log(
    c('dim', `\n  Connected — streaming events…  (HTTP ${response.status})`),
  );
  console.log('  ' + hr());

  for await (const { event, data: rawData } of parseSse(response)) {
    let data;
    try {
      data = JSON.parse(rawData);
    } catch {
      console.error(c('red', `  [parse error] ${rawData}`));
      continue;
    }
    printEvent(event, data);

    if (event === 'done' || event === 'error') break;
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(c('dim', `\n  Wall time: ${elapsed}s`));
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

await runScenario('bleu de chanel | office | cold | any | tier 4', {
  anchor: 'bleu de chanel',
  occasion: 'office',
  season: 'cold',
  gender: 'any',
  budget_tier: 4,
  dealbreakers: [],
});

await runScenario(
  'old bookshop | casual | cold | any | tier 3 | no sweet/aquatic',
  {
    anchor: 'smell of an old bookshop',
    occasion: 'casual',
    season: 'cold',
    gender: 'any',
    budget_tier: 3,
    dealbreakers: ['sweet', 'aquatic'],
  },
);

console.log('\n' + hr('═') + '\n');
