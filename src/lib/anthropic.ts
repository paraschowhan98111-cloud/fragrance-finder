import Anthropic from '@anthropic-ai/sdk';

// Lazy-initialise the client so the module can be imported during the Edge
// runtime build-time evaluation phase (where process.env isn't populated).
// The missing-key check fires on first actual use at request time.
let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Missing ANTHROPIC_API_KEY in env');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop: string | symbol) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

/** Model used for the LLM reranking step. */
export const RANKER_MODEL = 'claude-sonnet-4-6';
