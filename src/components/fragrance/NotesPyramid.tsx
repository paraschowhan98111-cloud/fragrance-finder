import { cn } from "@/lib/utils";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface NotesPyramidProps {
  top?: string[] | null;
  heart?: string[] | null;
  base?: string[] | null;
}

export function NotesPyramid({ top, heart, base }: NotesPyramidProps) {
  const rows = [
    { label: 'Top', notes: top },
    { label: 'Heart', notes: heart },
    { label: 'Base', notes: base },
  ];

  const hasAny = rows.some(r => r.notes && r.notes.length > 0);
  if (!hasAny) return null;

  return (
    <section className="mb-16">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-6">
        Notes
      </div>
      <div className="space-y-5 max-w-2xl">
        {rows.map(({ label, notes }, idx) => (
          <div key={label} className={cn(
            "grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr] gap-4 items-baseline",
            idx < rows.length - 1 && "pb-5 border-b border-[var(--color-rule)]"
          )}>
            <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)]">
              {label}
            </div>
            <div className="text-base md:text-lg leading-[1.6]">
              {notes && notes.length > 0 ? notes.map(capitalize).join(', ') : (
                <span className="text-[var(--color-ink-faint)] italic">Not specified</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
