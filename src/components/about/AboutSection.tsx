import type { ReactNode } from "react";

interface AboutSectionProps {
  label: string;
  children: ReactNode;
}

export function AboutSection({ label, children }: AboutSectionProps) {
  return (
    <section className="mb-20">
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-6">
        {label}
      </div>
      <div className="space-y-5 text-base md:text-lg leading-[1.7]">
        {children}
      </div>
    </section>
  );
}
