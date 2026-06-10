"use client";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ChevronDown, ArrowRight } from "lucide-react";
import { Heading } from "@/components/editorial/Heading";
import type { Candidate, RecommendationPick } from "@/lib/types";

interface PickCardProps {
  rank: number;
  pick: RecommendationPick;
  candidate: Candidate;
  streaming?: boolean;
}

// ── Configuration ────────────────────────────────────────────────────────────
const TYPING_SPEED_CHARS_PER_SEC = 50;
const TYPING_INTERVAL_MS = 1000 / TYPING_SPEED_CHARS_PER_SEC;

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBrand(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function formatName(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  if (match) return match[0];
  return text.length > 150 ? text.slice(0, 150) + '…' : text;
}

// ── Component ────────────────────────────────────────────────────────────────
export function PickCard({ rank, pick, candidate, streaming }: PickCardProps) {
  // Auto-expanded when streaming; user can override
  const [userToggled, setUserToggled] = useState(false);
  const [userExpandedValue, setUserExpandedValue] = useState(false);

  // Effective expanded state: user's choice if they've touched it, else follows streaming
  const expanded = userToggled ? userExpandedValue : !!streaming;

  // Typing animation state
  const [typedText, setTypedText] = useState('');
  const wasEverStreamingRef = useRef(false);

  // Mark whether this card ever entered the streaming state
  useEffect(() => {
    if (streaming) wasEverStreamingRef.current = true;
  }, [streaming]);

  // Typed animation effect: while streaming, type the rationale char-by-char
  useEffect(() => {
    if (streaming) {
      // Start (or continue) typing the rationale
      let i = typedText.length;
      const fullText = pick.rationale;
      if (i >= fullText.length) return; // already fully typed

      const interval = setInterval(() => {
        i++;
        if (i >= fullText.length) {
          setTypedText(fullText);
          clearInterval(interval);
        } else {
          setTypedText(fullText.slice(0, i));
        }
      }, TYPING_INTERVAL_MS);

      return () => clearInterval(interval);
    } else if (wasEverStreamingRef.current) {
      // Was streaming, now complete — snap to full text
      setTypedText(pick.rationale);
    } else {
      // Loaded from cache — show full text immediately, no animation
      setTypedText(pick.rationale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, pick.rationale]);

  // Effective rationale text to display
  const displayedRationale = streaming || wasEverStreamingRef.current
    ? typedText
    : pick.rationale;

  const handleToggle = () => {
    setUserToggled(true);
    setUserExpandedValue(!expanded);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="border-t border-[var(--color-rule)] py-10"
    >
      {/* Header — clickable to toggle expand */}
      <button
        onClick={handleToggle}
        className="w-full text-left group"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-6 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-2 flex items-center gap-3">
              <span>{formatBrand(candidate.brand)}</span>
              <span className="text-[var(--color-rule)]">·</span>
              <span className="font-serif text-[var(--color-accent)] text-base" style={{ fontFamily: 'var(--font-serif)' }}>
                {String(rank).padStart(2, '0')}
              </span>
            </div>
            <Heading level={2} as="h2" className="leading-tight">
              {formatName(candidate.name)}
            </Heading>
            {candidate.release_year && (
              <div className="text-sm italic text-[var(--color-ink-muted)] mt-1">
                {candidate.release_year}
              </div>
            )}
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="mt-2 flex-shrink-0"
          >
            <ChevronDown
              className="h-5 w-5 text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)] transition-colors"
              strokeWidth={1.5}
            />
          </motion.div>
        </div>

        {/* Teaser line — shown when collapsed */}
        {!expanded && (
          <p className="text-base leading-[1.65] text-[var(--color-ink-muted)] max-w-2xl">
            {firstSentence(pick.rationale)}
          </p>
        )}
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-2">
              {/* Full rationale (with typed animation when streaming) */}
              <p className="text-base md:text-lg leading-[1.7] max-w-2xl mb-8">
                {displayedRationale}
                {streaming && typedText.length < pick.rationale.length && (
                  <span className="inline-block w-[2px] h-[1em] bg-[var(--color-ink)] align-baseline ml-0.5 animate-pulse" />
                )}
              </p>

              {/* Meta sections — visible only after typing completes or on cache load */}
              {(!streaming || typedText.length >= pick.rationale.length) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="space-y-6 max-w-2xl"
                >
                  <MetaSection label="Notes">
                    {pick.key_notes.join(', ')}
                  </MetaSection>
                  <MetaSection label="Wear">
                    {pick.what_to_expect}
                  </MetaSection>
                  {pick.caveat && (
                    <MetaSection label="Caveat">
                      {pick.caveat}
                    </MetaSection>
                  )}

                  <div className="pt-2">
                    <Link
                      href={`/fragrance/${candidate.id}`}
                      className="group inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
                    >
                      <span>Read full detail</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" strokeWidth={1.5} />
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function MetaSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr] gap-4 items-baseline">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)]">
        {label}
      </div>
      <p className="text-sm md:text-base leading-[1.65] text-[var(--color-ink-muted)]">
        {children}
      </p>
    </div>
  );
}
