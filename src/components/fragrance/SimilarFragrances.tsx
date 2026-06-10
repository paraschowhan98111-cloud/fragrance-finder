import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Heading } from "@/components/editorial/Heading";
import type { SimilarFragrance } from "@/lib/fragrance-data";

function formatBrand(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function formatName(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface SimilarFragrancesProps {
  items: SimilarFragrance[];
}

export function SimilarFragrances({ items }: SimilarFragrancesProps) {
  if (items.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-rule)] pt-16 mb-24">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-3">
        If you like this
      </div>
      <Heading level={2} className="mb-12">
        Try one of these next.
      </Heading>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/fragrance/${item.id}`}
            className="group block py-6 border-t border-[var(--color-rule)] hover:border-[var(--color-ink)] transition-colors"
          >
            <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-2">
              {formatBrand(item.brand)}
            </div>
            <h3 className="font-serif text-xl md:text-2xl leading-tight mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
              {formatName(item.name)}
            </h3>
            {item.release_year && (
              <div className="text-sm italic text-[var(--color-ink-muted)] mb-3">
                {item.release_year}
              </div>
            )}
            {item.vibe_summary && (
              <p className="text-sm text-[var(--color-ink-muted)] leading-[1.6] line-clamp-2 mb-4">
                {item.vibe_summary}
              </p>
            )}
            <div className="inline-flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)] transition-colors">
              <span>Read more</span>
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" strokeWidth={1.5} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
