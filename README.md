# Fragrance Finder

A small, careful AI fragrance recommender. Tell it five things about what you like and where you'll wear it; get back three to five thoughtful recommendations with an honest reason for each.

> 🚧 **Demo URL coming soon.** Currently runs locally. Will deploy to Vercel.

## What this is

A personal project exploring whether AI can do fragrance recommendations meaningfully better than the typical sales-driven approach. Built on a curated catalog of ~2,000 fragrances, enriched with Claude-generated vibe summaries and performance estimates, retrieved with vector similarity, ranked and rationalized by Claude Sonnet.

See the [about page](./src/app/about/page.tsx) for the full project narrative — why I built it, decisions worth defending, and what's honestly limited.

## How it works

Three layers:

**The catalog.** ~22,000 fragrances from Fragrantica, filtered to ~2,000 that are commonly available and well-reviewed. Each enriched via Claude Haiku batch with vibe summary, occasion fit scores, season fit scores, vibe tags, longevity, and projection.

**The retrieval pipeline.** Dual embeddings per fragrance (scent + brand identity), weighted similarity search, trigram-based fuzzy anchor matching. All as Postgres functions on Supabase. Pulls a top-20 candidate list in ~200ms.

**The ranking layer.** Claude Sonnet 4.6 takes the 20 candidates and the user's preferences, picks the best 3-5, writes a rationale for each. Streams back to the browser as it's generated. Cost: ~$0.03-0.04 per recommendation.

## Tech stack

- **Frontend:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · Framer Motion
- **Backend:** Next.js API routes · Server-Sent Events for streaming
- **Database:** Supabase (Postgres + pgvector) — free tier
- **AI:** Claude Sonnet 4.6 (ranking + rationale), Claude Haiku 4.5 (catalog enrichment, batch)
- **Embeddings:** OpenAI text-embedding-3-small (1536-dim)
- **Design:** Editorial, inspired by Aesop and Le Labo. Fraunces serif, Inter sans, warm cream palette.

## Running locally

```bash
# Clone
git clone https://github.com/<your-username>/fragrance-finder.git
cd fragrance-finder

# Install
npm install

# Set up environment variables (see below)
cp .env.example .env.local
# Then edit .env.local with your real keys

# Run
npm run dev
```

Then open http://localhost:3000.

## Environment variables

Create a `.env.local` file with:

```bash
# Anthropic — get from https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI — get from https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Supabase — get from your Supabase project settings → API
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service role key (server-side only)

# Optional: for OpenGraph image generation
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

The Supabase database needs to be set up with the catalog tables, embeddings, and RPC functions. That setup is documented in the build doc (not in this repo for brevity).

## Project structure

```
src/
├── app/                          # Next.js App Router pages
│   ├── api/recommend/            # SSE streaming recommendation endpoint
│   ├── about/                    # Project narrative
│   ├── quiz/                     # 5-question quiz
│   ├── results/[hash]/           # Streaming results page
│   ├── fragrance/[id]/           # Per-fragrance detail page
│   ├── icon.tsx                  # Auto-generated favicon
│   ├── opengraph-image.tsx       # Auto-generated OG image
│   ├── not-found.tsx             # Custom 404
│   ├── layout.tsx                # Root layout with fonts and metadata
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Editorial palette + Tailwind v4 theme
├── components/
│   ├── editorial/                # Reusable layout + typography primitives
│   ├── quiz/                     # Quiz state, screens, options
│   ├── results/                  # Results streaming UI
│   ├── fragrance/                # Fragrance detail components
│   └── about/                    # About page sections
└── lib/                          # Server-side helpers + types
    ├── anthropic.ts              # Claude SDK client
    ├── openai.ts                 # OpenAI SDK client
    ├── supabase.ts               # Supabase client (service role)
    ├── ranker.ts                 # Claude Sonnet ranker + Zod schemas
    ├── streamingRanker.ts        # SSE generator for /api/recommend
    ├── recommender.ts            # Retrieval pipeline orchestrator
    ├── logging.ts                # Best-effort session logging
    ├── prompts/                  # System prompts (versioned)
    ├── fragrance-data.ts         # Server-side fragrance fetching
    ├── quiz-storage.ts           # localStorage helpers for prefs/results cache
    ├── sse-client.ts             # Browser SSE consumer
    └── types.ts                  # Shared type definitions
```

## Honest limitations

- Catalog is fragrance-only, ~2,000 entries. Obscure niche fragrances may not be present.
- Sentiment data refresh from Reddit is planned (Phase 5) but not built.
- Results are cached in browser localStorage. Sharing a results URL with a friend won't work — they don't have the prefs to regenerate.
- Decant seller integration is planned (Phase 4). The placeholder on each detail page acknowledges this.

## Building this

Most of the code in this app I did not write by hand. I used Claude Code as the primary author, while making every architectural decision and reviewing every meaningful diff. The build doc and changelogs are written by me.

## License

Personal project. All rights reserved for now. If you want to use parts of this for your own work, open an issue and let's talk.

## Acknowledgments

To the Fragrantica community for the data this catalog is built on. To Claude Code for the patience.
