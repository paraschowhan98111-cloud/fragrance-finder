import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = 'default' | 'muted' | 'faint';

interface BodyProps {
  children: ReactNode;
  className?: string;
  tone?: Tone;
  size?: 'sm' | 'base' | 'lg';
}

const tones: Record<Tone, string> = {
  default: 'text-[var(--color-ink)]',
  muted: 'text-[var(--color-ink-muted)]',
  faint: 'text-[var(--color-ink-faint)]',
};

const sizes = {
  sm: 'text-sm leading-[1.55]',
  base: 'text-base leading-[1.65]',
  lg: 'text-lg leading-[1.6]',
} as const;

export function Body({ children, className, tone = 'default', size = 'base' }: BodyProps) {
  return (
    <p className={cn(sizes[size], tones[tone], className)}>
      {children}
    </p>
  );
}
