import { Heading } from "@/components/editorial/Heading";

function formatBrand(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function formatName(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

interface FragranceHeaderProps {
  brand: string;
  name: string;
  release_year?: number | null;
  gender_marketing?: string | null;
}

export function FragranceHeader({ brand, name, release_year, gender_marketing }: FragranceHeaderProps) {
  return (
    <header className="mb-16">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-4">
        {formatBrand(brand)}
      </div>
      <Heading level={1} className="leading-[1.1]">
        {formatName(name)}
      </Heading>
      {(release_year || gender_marketing) && (
        <div className="mt-4 flex items-center gap-3 text-sm italic text-[var(--color-ink-muted)]">
          {release_year && <span>{release_year}</span>}
          {release_year && gender_marketing && <span className="text-[var(--color-rule)]">·</span>}
          {gender_marketing && <span className="capitalize">{gender_marketing}</span>}
        </div>
      )}
    </header>
  );
}
