import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/editorial/Container";
import { Body } from "@/components/editorial/Body";
import { FragranceHeader } from "@/components/fragrance/FragranceHeader";
import { NotesPyramid } from "@/components/fragrance/NotesPyramid";
import { TagList } from "@/components/fragrance/TagList";
import { PerformanceBlock } from "@/components/fragrance/PerformanceBlock";
import { SimilarFragrances } from "@/components/fragrance/SimilarFragrances";
import { DecantPlaceholder } from "@/components/fragrance/DecantPlaceholder";
import { getFragranceById, getSimilarFragrances } from "@/lib/fragrance-data";

function formatBrand(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function formatName(slug: string): string {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (isNaN(id)) return { title: "Fragrance" };

  const fragrance = await getFragranceById(id);
  if (!fragrance) return { title: "Fragrance not found" };

  const brand = formatBrand(fragrance.brand);
  const name = formatName(fragrance.name);

  return {
    title: `${name} · ${brand}`,
    description: fragrance.vibe_summary ?? `Full details for ${name} by ${brand}.`,
  };
}

export default async function FragrancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);

  if (isNaN(id)) {
    notFound();
  }

  const [fragrance, similar] = await Promise.all([
    getFragranceById(id),
    getSimilarFragrances(id, 6),
  ]);

  if (!fragrance) {
    notFound();
  }

  return (
    <main className="py-16 md:py-24">
      <Container size="default">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors mb-12"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
          <span>Home</span>
        </Link>

        <FragranceHeader
          brand={fragrance.brand}
          name={fragrance.name}
          release_year={fragrance.release_year}
          gender_marketing={fragrance.gender_marketing}
        />

        {fragrance.vibe_summary && (
          <div className="max-w-2xl mb-16">
            <Body size="lg" className="leading-[1.7]">
              {fragrance.vibe_summary}
            </Body>
          </div>
        )}

        <NotesPyramid
          top={fragrance.notes_top}
          heart={fragrance.notes_heart}
          base={fragrance.notes_base}
        />

        <section className="mb-16">
          <TagList label="Accords" tags={fragrance.accords} />
          <TagList label="Vibe" tags={fragrance.vibe_tags} />
        </section>

        <PerformanceBlock
          longevity_hours={fragrance.longevity_hours}
          projection={fragrance.projection}
          price_tier={fragrance.price_tier}
          rating_avg={fragrance.rating_avg}
          rating_count={fragrance.rating_count}
        />

        <DecantPlaceholder />

        <SimilarFragrances items={similar} />
      </Container>
    </main>
  );
}
