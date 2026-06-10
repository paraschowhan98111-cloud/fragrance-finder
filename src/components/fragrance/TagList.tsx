interface TagListProps {
  label: string;
  tags?: string[] | null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function TagList({ label, tags }: TagListProps) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr] gap-4 items-baseline max-w-2xl mb-6">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)]">
        {label}
      </div>
      <div className="text-sm md:text-base text-[var(--color-ink-muted)] leading-[1.6]">
        {tags.map(capitalize).join(', ')}
      </div>
    </div>
  );
}
