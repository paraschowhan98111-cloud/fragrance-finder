import Link from 'next/link';
import { Heading } from '@/components/editorial/Heading';
import { Body } from '@/components/editorial/Body';

interface ResultsErrorProps {
  kind?: 'generic' | 'rate_limited';
  message?: string;
}

export function ResultsError({ kind = 'generic', message }: ResultsErrorProps) {
  if (kind === 'rate_limited') {
    return (
      <div className="py-32">
        <Heading level={2} className="mb-6">
          You&apos;re moving fast.
        </Heading>
        <Body size="lg" tone="muted" className="mb-8 max-w-xl">
          We&apos;ve capped requests at ten per hour to keep this affordable for everyone. Take a
          break and come back in a bit — your last results are still saved.
        </Body>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-[var(--color-ink)] border-b border-[var(--color-ink)] pb-1 hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="py-32">
      <Heading level={2} className="mb-6">
        A clean match wasn&apos;t found.
      </Heading>
      <Body size="lg" tone="muted" className="mb-2 max-w-xl">
        The catalog can be particular. Try the quiz again with a different anchor, or loosen one of
        your constraints.
      </Body>
      {message && (
        <Body size="sm" tone="faint" className="mb-8 max-w-xl">
          Detail: {message}
        </Body>
      )}
      <Link
        href="/quiz"
        className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-[var(--color-ink)] border-b border-[var(--color-ink)] pb-1 hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
      >
        Try the quiz again
      </Link>
    </div>
  );
}
