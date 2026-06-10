import Link from "next/link";
import { Container } from "@/components/editorial/Container";
import { Heading } from "@/components/editorial/Heading";
import { Body } from "@/components/editorial/Body";
import { PrimaryLink } from "@/components/editorial/PrimaryLink";

// ── Shared caption style ──────────────────────────────────────────────────────

function Caption({ children }: { children: string }) {
  return (
    <p className="text-xs tracking-[0.18em] uppercase text-[var(--color-ink-faint)]">
      {children}
    </p>
  );
}

// ── How-it-works step card ────────────────────────────────────────────────────

interface StepProps {
  index: string;
  title: string;
  body: string;
}

function Step({ index, title, body }: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <span
        className="text-3xl font-normal leading-none text-[var(--color-accent)]"
        style={{ fontFamily: "var(--font-serif)" }}
        aria-hidden="true"
      >
        {index}
      </span>
      <Heading level={3}>{title}</Heading>
      <Body size="sm" tone="muted">
        {body}
      </Body>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col justify-center py-24">
        <Container size="default">
          {/* Headline */}
          <Heading
            level={1}
            className="text-balance"
          >
            A fragrance that&rsquo;s yours.
          </Heading>

          {/* Sub-headline */}
          <div className="mt-6 max-w-[42ch]">
            <Body size="lg" tone="muted">
              Tell us five things. We&rsquo;ll suggest scents worth your skin.
            </Body>
          </div>

          {/* CTA */}
          <div className="mt-12">
            <PrimaryLink href="/quiz">Find your fragrance</PrimaryLink>
          </div>

          {/* Settle point */}
          <div className="mt-20 md:mt-32 text-center">
            <Body size="sm" tone="faint">
              Five questions. Three to five fragrances. About a minute.
            </Body>
          </div>
        </Container>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section className="py-24 md:py-32">
        <Container size="default">
          <hr className="mb-16 border-[var(--color-rule)]" />

          {/* Section header */}
          <Caption>How it works</Caption>
          <div className="mt-6 mb-16">
            <Heading level={2} className="text-balance">
              Five questions. Three to five recommendations.
            </Heading>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            <Step
              index="01"
              title="Tell us what you like."
              body="A fragrance you love. Or a scent you remember. Or a mood. Five questions, takes about thirty seconds."
            />
            <Step
              index="02"
              title="We narrow the field."
              body="We weigh notes, occasion, season, and how a fragrance actually wears. Two thousand scents become twenty."
            />
            <Step
              index="03"
              title="Read why each one fits you."
              body="Every pick comes with a short rationale, an honest caveat, and the notes that matter. No salesmanship."
            />
          </div>
        </Container>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="py-16 md:py-20">
        <Container size="default">
          <hr className="mb-12 border-[var(--color-rule)]" />

          <div className="flex items-center justify-between">
            <span
              className="text-sm italic text-[var(--color-ink-muted)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Fragrance project
            </span>
            <Link
              href="/about"
              className="text-sm tracking-wide uppercase text-[var(--color-ink-muted)] transition-colors duration-200 hover:text-[var(--color-ink)]"
            >
              About this project
            </Link>
          </div>

          <div className="mt-6">
            <Body size="sm" tone="faint">
              A personal project. Not affiliated with any house or retailer.
            </Body>
          </div>
        </Container>
      </footer>
    </>
  );
}
