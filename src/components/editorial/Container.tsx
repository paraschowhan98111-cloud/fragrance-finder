import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Size = 'narrow' | 'default' | 'wide';

const sizes: Record<Size, string> = {
  narrow: 'max-w-2xl',   // 672px — reading-width prose
  default: 'max-w-4xl',  // 896px — most page content
  wide: 'max-w-6xl',     // 1152px — landing, results grid
};

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: Size;
}

export function Container({ size = 'default', className, children, ...props }: ContainerProps) {
  return (
    <div className={cn('mx-auto w-full px-6 md:px-10', sizes[size], className)} {...props}>
      {children}
    </div>
  );
}
