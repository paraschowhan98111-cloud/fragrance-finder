import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/editorial/Container";
import { Heading } from "@/components/editorial/Heading";
import { AboutSection } from "@/components/about/AboutSection";

export const metadata = {
  title: "About this project",
  description: "Why I built a fragrance recommender, how it works, and what's honestly limited about it.",
};

export default function AboutPage() {
  return (
    <main className="py-16 md:py-24">
      <Container size="narrow">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors mb-16"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
          <span>Home</span>
        </Link>

        {/* Title */}
        <div className="mb-16">
          <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-4">
            About this project
          </div>
          <Heading level={1} className="leading-[1.1]">
            A fragrance recommender that takes itself seriously.
          </Heading>
        </div>

        <AboutSection label="Why I built this">
          <p>
            I like fragrance. I don&apos;t like how fragrance is sold online.
          </p>
          <p>
            Walk into any fragrance subreddit and the same questions repeat every day: what&apos;s similar to Bleu de Chanel, what should I get for the office, I tried a sample and want something like it but warmer. The answers are good but they&apos;re scattered across reviews, threads, and house-specific knowledge. There&apos;s no place that takes what you actually like, considers when you&apos;ll wear it, and gives you a curated short list with an honest reason for each pick.
          </p>
          <p>
            I wanted to see if a small, careful AI system could do that better than the noise. This project is the result.
          </p>
        </AboutSection>

        <AboutSection label="What it does">
          <p>
            You answer five questions: name a fragrance you love (or a smell, or skip it), tell me when you&apos;ll wear it, what climate, what gender direction, what budget. The app comes back with three to five recommendations. Each pick has a short rationale, the notes that matter, an honest caveat where one exists, and a path into more detail.
          </p>
          <p>
            The recommendations don&apos;t come from a model making things up. They come from a curated catalog of about two thousand fragrances that I enriched with vibe summaries, controlled-vocabulary tags, and performance estimates. A retrieval pipeline narrows the field by similarity and your stated preferences; Claude Sonnet then re-ranks the top twenty and writes the rationale.
          </p>
        </AboutSection>

        <AboutSection label="How it works">
          <p>
            There are three layers.
          </p>
          <p>
            <em>The catalog.</em> I started with roughly twenty-two thousand fragrances from Fragrantica. Most of those aren&apos;t worth recommending to anyone — they&apos;re long-tail, low-review, or obscure. I filtered to about two thousand that are commonly available, well-reviewed, and span the price range. For each one, I ran Claude Haiku in batch mode to produce a vibe summary, six occasion fit scores, four season fit scores, controlled-vocabulary tags, and rough longevity and projection numbers. Total cost for that enrichment: about $2.50.
          </p>
          <p>
            <em>The retrieval pipeline.</em> For each request, I generate two embeddings per fragrance — one for scent (notes, accords, tags) and one for brand identity — and use a weighted similarity search to find candidates. Trigram indexes handle fuzzy anchor matching (so &ldquo;akwa di gio&rdquo; still finds Acqua di Giò). All of this runs as Postgres functions on Supabase. The pipeline pulls a top-twenty candidate list in about two hundred milliseconds.
          </p>
          <p>
            <em>The ranking and rationale layer.</em> Claude Sonnet 4.6 takes those twenty candidates and the user&apos;s preferences, picks the best three to five, and writes a rationale for each. The output streams back to the browser as it&apos;s generated. Cost per recommendation: about three to four cents.
          </p>
          <p>
            The full stack: Next.js 15, Postgres on Supabase free tier, the Anthropic SDK for Claude Sonnet and Haiku, OpenAI for embeddings. The UI is built with Tailwind and Framer Motion, in an editorial style modeled on Aesop and Le Labo rather than the typical SaaS feel.
          </p>
        </AboutSection>

        <AboutSection label="Decisions worth defending">
          <p>
            A few moments where there was a real trade-off:
          </p>
          <p>
            <em>Editorial UI over decorative.</em> A typical &ldquo;AI app&rdquo; landing page would have gradients, animated bottles, social proof. This one has typography and whitespace. The product is about restraint and curation; the design should match. I cut a kicker line, three rounds of &ldquo;make it more visually interesting&rdquo; suggestions to myself, and ended up with something that takes itself seriously.
          </p>
          <p>
            <em>Progressive disclosure on the results page.</em> The first version put the full rationale on every card. Beautiful in isolation; on a real screen with four picks, you scrolled through five viewport-heights of dense text. I rebuilt it as compact cards that expand on tap — closer to a magazine table of contents. The detail lives one click away.
          </p>
          <p>
            <em>Postgres trigram over JavaScript fuzzy matching.</em> The first anchor-matching implementation loaded twenty-two thousand fragrances into a Fuse.js index in JavaScript. Cold-start request time: eighty seconds. I rebuilt it on Postgres trigram indexes, with the actual matching happening server-side. New cold-start: thirty-one seconds, almost all of which is unavoidable Claude generation time. Lesson: when you find yourself loading thousands of rows into JS to do something the database is built for, stop and use the database.
          </p>
          <p>
            <em>Client-side faked streaming for rationale text.</em> The server emits one complete pick event at a time, not character-level deltas. To get the &ldquo;text is being written&rdquo; feel users expect from AI products, I run a setInterval at fifty characters per second on the client. It&apos;s a perception decision, not authenticity — and it&apos;s the right one. ChatGPT does similar things for regenerated responses.
          </p>
        </AboutSection>

        <AboutSection label="What's honestly limited">
          <p>
            A working draft, not a finished product:
          </p>
          <ul className="space-y-4 list-none pl-0">
            <li>
              <em>The catalog is fragrance-only.</em> No body sprays, no aftershave splashes, no candles. Roughly two thousand entries, weighted toward designer and accessible niche. If you wear something obscure (the deepest cuts of MFK or Roja), it&apos;s probably not in there.
            </li>
            <li>
              <em>Sentiment data is incomplete.</em> The build plan included refreshing each fragrance with current community sentiment from Reddit. That&apos;s Phase 5 work and isn&apos;t done.
            </li>
            <li>
              <em>Sharing-with-a-friend doesn&apos;t work yet.</em> Results are cached in your browser&apos;s localStorage. If you send a friend a link, they don&apos;t have the prefs to regenerate the recommendations. There&apos;s a clean server-side fix I haven&apos;t built.
            </li>
            <li>
              <em>No real user testing.</em> I tested recommendations against ten synthetic preference profiles I constructed myself. The picks held up. But I haven&apos;t watched a real person use this and tell me where it falls short — which is the test that actually matters.
            </li>
            <li>
              <em>Decant integration is on the way, not built.</em> The goal is a small network of vetted decant sellers so you can sample before buying full bottles. The placeholder on each fragrance detail page acknowledges this.
            </li>
          </ul>
        </AboutSection>

        <AboutSection label="What's next">
          <p>
            Phase 4: decant seller integration. A small admin process for adding trusted sellers, fuzzy matching their inventory against the catalog, and showing availability on each fragrance page.
          </p>
          <p>
            Phase 5: a weekly sentiment refresh. Each fragrance gets a short summary of recent community discussion via Reddit and web search, batched through Claude Haiku for about $1.50 a week. This would surface things the catalog data can&apos;t capture — reformulation complaints, sleeper hits, batch quality issues.
          </p>
          <p>
            Phase 6: domain, deployment, an actual mobile audit, a demo video.
          </p>
        </AboutSection>

        <AboutSection label="How this was built">
          <p>
            Most of the code in this app I did not write by hand. I used Claude Code (Anthropic&apos;s command-line tool) as the primary author. I made every architectural decision and reviewed every meaningful diff, but the typing was Claude&apos;s. The Anthropic SDK powers the streaming recommendations; OpenAI&apos;s text-embedding-3-small handles the vector math; Supabase hosts the database. The build doc and changelogs are written by me, and Claude helped me draft the writing on this page.
          </p>
          <p>
            I think this is the actual job for a PM in 2026: deciding what to build, owning the architecture, and using AI tooling for the parts a human shouldn&apos;t be doing by hand. Pretending otherwise on a portfolio would be the wrong signal to send.
          </p>
        </AboutSection>

        <AboutSection label="Thanks">
          <p>
            To the Fragrantica community for the data this catalog is built on. To the small number of people who let me bounce architecture questions off them. To Claude Code for the patience.
          </p>
        </AboutSection>

        {/* Bottom navigation */}
        <div className="mt-24 pt-12 border-t border-[var(--color-rule)] flex items-center justify-between gap-6">
          <Link
            href="/"
            className="text-sm tracking-[0.15em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            ← Home
          </Link>
          <Link
            href="/quiz"
            className="text-sm tracking-[0.15em] uppercase text-[var(--color-ink)] border-b border-[var(--color-ink)] pb-1 hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
          >
            Take the quiz →
          </Link>
        </div>
      </Container>
    </main>
  );
}
