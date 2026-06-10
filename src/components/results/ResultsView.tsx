'use client';

import { useEffect, useState, useRef } from 'react';
import { Container } from '@/components/editorial/Container';
import { Heading } from '@/components/editorial/Heading';
import { Body } from '@/components/editorial/Body';
import { LoadingProse } from './LoadingProse';
import { PickCard } from './PickCard';
import { ExplanationBlock } from './ExplanationBlock';
import { ResultsError } from './ResultsError';
import { loadPrefs, loadResults, saveResults } from '@/lib/quiz-storage';
import { consumeSSE } from '@/lib/sse-client';
import type { Candidate, RecommendationPick, UserPreferences } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PickWithCandidate {
  rank: number;
  pick: RecommendationPick;
  candidate: Candidate;
}

interface CachedResults {
  picks: PickWithCandidate[];
  explanation: string;
}

// Shape of the raw SSE pick event data (mirrors PickEvent in streamingRanker)
interface RawPickData {
  type: 'pick';
  rank: number;
  fragrance_id: number;
  rationale: string;
  key_notes: string[];
  what_to_expect: string;
  caveat?: string;
  candidate: Candidate;
}

type Phase = 'loading-prefs' | 'streaming' | 'done' | 'cached' | 'error' | 'no-prefs';

interface ResultsViewProps {
  hash: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResultsView({ hash }: ResultsViewProps) {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [picks, setPicks] = useState<PickWithCandidate[]>([]);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading-prefs');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Prevents double-streaming under React Strict Mode's double-effect invocation
  const startedRef = useRef(false);

  // ── Phase 1: load from localStorage ──────────────────────────────────────────
  useEffect(() => {
    const cached = loadResults(hash) as CachedResults | null;
    if (cached?.picks?.length) {
      setPicks(cached.picks);
      setExplanation(cached.explanation);
      setPhase('cached');
      return;
    }

    const loadedPrefs = loadPrefs(hash);
    if (!loadedPrefs) {
      setPhase('no-prefs');
      return;
    }

    setPrefs(loadedPrefs);
    setPhase('streaming');
  }, [hash]);

  // ── Phase 2: stream ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'streaming' || !prefs) return;
    if (startedRef.current) return;
    startedRef.current = true;

    const controller = new AbortController();
    const collectedPicks: PickWithCandidate[] = [];
    let collectedExplanation = '';

    (async () => {
      try {
        for await (const event of consumeSSE('/api/recommend', prefs, controller.signal)) {
          if (event.event === 'pick') {
            const d = event.data as RawPickData;
            const newPick: PickWithCandidate = {
              rank: d.rank,
              pick: {
                fragrance_id: d.fragrance_id,
                rank: d.rank,
                rationale: d.rationale,
                key_notes: d.key_notes,
                what_to_expect: d.what_to_expect,
                caveat: d.caveat,
              },
              candidate: d.candidate,
            };
            collectedPicks.push(newPick);
            setPicks([...collectedPicks]);
          } else if (event.event === 'explanation') {
            const d = event.data as { explanation: string };
            collectedExplanation = d.explanation;
            setExplanation(collectedExplanation);
          } else if (event.event === 'done') {
            saveResults(hash, { picks: collectedPicks, explanation: collectedExplanation });
            setPhase('done');
          } else if (event.event === 'error') {
            const d = event.data as { message: string };
            setErrorMessage(d.message);
            setPhase('error');
          }
          // 'meta' events are intentionally ignored on the client
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setErrorMessage((err as Error).message);
        setPhase('error');
      }
    })();

    return () => {
      controller.abort();
    };
  }, [phase, prefs, hash]);

  // ── Render ────────────────────────────────────────────────────────────────────

  // Very brief initial tick — no flash
  if (phase === 'loading-prefs') return null;

  if (phase === 'no-prefs') {
    return (
      <main className="min-h-screen flex flex-col justify-center py-24">
        <Container size="default">
          <Heading level={2} className="mb-6">
            This result link has expired.
          </Heading>
          <Body size="lg" tone="muted" className="mb-8 max-w-xl">
            We don&apos;t keep your preferences once you close the tab. Take the quiz again to see
            fresh recommendations.
          </Body>
          <a
            href="/quiz"
            className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-[var(--color-ink)] border-b border-[var(--color-ink)] pb-1 hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
          >
            Take the quiz
          </a>
        </Container>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="min-h-screen flex flex-col justify-center py-24">
        <Container size="default">
          <ResultsError message={errorMessage ?? undefined} />
        </Container>
      </main>
    );
  }

  const showLoadingProse = phase === 'streaming' && picks.length === 0;
  const isStreaming = phase === 'streaming';
  const isDone = phase === 'done' || phase === 'cached';

  return (
    <main className="py-24 md:py-32">
      <Container size="default">
        {/* Page header */}
        <div className="mb-24">
          <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-4">
            Your picks
          </div>
          <Heading level={1}>
            {prefs?.anchor ? `For “${prefs.anchor}”.` : 'For your preferences.'}
          </Heading>
        </div>

        {/* Cycling loading prose until first pick arrives */}
        {showLoadingProse && <LoadingProse />}

        {/* Pick cards — appear as stream delivers them */}
        {picks.map((p, idx) => (
          <PickCard
            key={p.candidate.id}
            rank={p.rank}
            pick={p.pick}
            candidate={p.candidate}
            streaming={isStreaming && idx === picks.length - 1}
          />
        ))}

        {/* Explanation paragraph */}
        {explanation && <ExplanationBlock text={explanation} />}

        {/* Re-take CTA — only when all results are present */}
        {isDone && (
          <div className="mt-16 mb-16">
            <a
              href="/quiz"
              className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-[var(--color-ink-muted)] border-b border-[var(--color-rule)] pb-1 hover:text-[var(--color-ink)] hover:border-[var(--color-ink)] transition-colors"
            >
              Try different preferences
            </a>
          </div>
        )}
      </Container>
    </main>
  );
}
