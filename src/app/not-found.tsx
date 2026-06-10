import Link from "next/link";
import { Container } from "@/components/editorial/Container";
import { Heading } from "@/components/editorial/Heading";
import { Body } from "@/components/editorial/Body";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col justify-center py-24">
      <Container size="default">
        <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-4">
          404
        </div>
        <Heading level={1} className="mb-6">
          The page you&apos;re looking for isn&apos;t here.
        </Heading>
        <Body size="lg" tone="muted" className="mb-10 max-w-xl">
          It might have moved, or it might never have existed. Either way, we&apos;re sorry to send you away empty-handed.
        </Body>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-[var(--color-ink)] border-b border-[var(--color-ink)] pb-1 hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
        >
          Back to home
        </Link>
      </Container>
    </main>
  );
}
