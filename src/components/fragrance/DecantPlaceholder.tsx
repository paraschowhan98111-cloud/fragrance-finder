export function DecantPlaceholder() {
  return (
    <section className="border-t border-[var(--color-rule)] pt-16 mb-24 max-w-2xl">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-4">
        Where to try
      </div>
      <p
        className="text-base leading-[1.65] text-[var(--color-ink-muted)] italic font-serif"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        Decant sourcing is on its way. The plan is to link you to a small set of trusted decant sellers so you can sample before committing to a full bottle.
      </p>
    </section>
  );
}
