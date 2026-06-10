import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('Missing ANTHROPIC_API_KEY in env');
}

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Model used for the LLM reranking step. */
export const RANKER_MODEL = 'claude-sonnet-4-6';
