interface PerformanceBlockProps {
  longevity_hours?: number | null;
  projection?: string | null;
  price_tier?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
}

const priceTierLabel: Record<number, string> = {
  1: 'Under $50',
  2: '$50–$150',
  3: '$150–$300',
  4: '$300+',
};

export function PerformanceBlock({
  longevity_hours,
  projection,
  price_tier,
  rating_avg,
  rating_count,
}: PerformanceBlockProps) {
  const items = [
    {
      label: 'Longevity',
      value: longevity_hours ? `${longevity_hours} hours` : null,
    },
    {
      label: 'Projection',
      value: projection ? projection.charAt(0).toUpperCase() + projection.slice(1) : null,
    },
    {
      label: 'Price',
      value: price_tier ? priceTierLabel[price_tier] : null,
    },
    {
      label: 'Rating',
      value: rating_avg
        ? `${rating_avg.toFixed(2)} / 5${rating_count ? ` · ${rating_count.toLocaleString()} reviews` : ''}`
        : null,
    },
  ].filter(item => item.value !== null);

  if (items.length === 0) return null;

  return (
    <section className="mb-16">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-6">
        Performance
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        {items.map(({ label, value }) => (
          <div key={label}>
            <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-2">
              {label}
            </div>
            <div className="text-base md:text-lg">
              {value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
