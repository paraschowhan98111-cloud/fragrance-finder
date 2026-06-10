import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OPENAI_API_KEY in env');
}

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Embed a single text string using text-embedding-3-small (1536 dims).
 */
export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}
