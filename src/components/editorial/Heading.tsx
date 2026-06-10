import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface HeadingProps {
  level?: 1 | 2 | 3;
  children: ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'div';
}

const styles = {
  1: 'text-4xl md:text-6xl leading-[1.05] tracking-tight font-normal',
  2: 'text-3xl md:text-4xl leading-[1.15] tracking-tight font-normal',
  3: 'text-xl md:text-2xl leading-tight tracking-tight font-normal',
} as const;

export function Heading({ level = 1, children, className, as }: HeadingProps) {
  const Tag = (as ?? `h${level}`) as 'h1' | 'h2' | 'h3' | 'div';
  return (
    <Tag
      className={cn(
        'font-serif',
        styles[level],
        className,
      )}
      style={{ fontFamily: 'var(--font-serif)' }}
    >
      {children}
    </Tag>
  );
}
