interface ProgressIndicatorProps {
  current: number;
  total: number;
}

export function ProgressIndicator({ current, total }: ProgressIndicatorProps) {
  return (
    <div className="fixed top-6 right-6 md:top-8 md:right-8 text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] z-10">
      {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </div>
  );
}
