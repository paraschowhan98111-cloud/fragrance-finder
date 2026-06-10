import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

interface PrimaryLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function PrimaryLink({ href, children, className }: PrimaryLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-3",
        "px-7 py-4",
        "bg-[var(--color-ink)] text-[var(--color-paper)]",
        "text-sm tracking-wide uppercase",
        "transition-colors duration-300",
        "hover:bg-[var(--color-accent)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-paper)]",
        className,
      )}
    >
      <span>{children}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.5} />
    </Link>
  );
}
