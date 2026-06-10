import { cn } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';
import type { OptionConfig } from '@/lib/quiz-types';

interface OptionListProps {
  options: OptionConfig[];
  selected?: string;
  onSelect: (value: string) => void;
}

export function OptionList({ options, selected, onSelect }: OptionListProps) {
  return (
    <div className="mt-10">
      {options.map((option, i) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            'group w-full text-left py-5 border-b border-[var(--color-rule)]',
            'transition-colors duration-200',
            'hover:bg-[var(--color-paper-deep)]',
            'focus-visible:outline-none focus-visible:bg-[var(--color-paper-deep)]',
            i === 0 && 'border-t',
            selected === option.value && 'bg-[var(--color-accent-soft)] border-[var(--color-accent)]',
          )}
        >
          <div className="flex items-baseline justify-between gap-6 px-2">
            <div>
              <div className="text-lg md:text-xl font-serif" style={{ fontFamily: 'var(--font-serif)' }}>
                {option.label}
              </div>
              {option.subtitle && (
                <div className="text-sm text-[var(--color-ink-faint)] italic mt-1">
                  {option.subtitle}
                </div>
              )}
            </div>
            <ArrowRight
              className={cn(
                'h-4 w-4 mt-2 flex-shrink-0 transition-all duration-200',
                'text-[var(--color-ink-faint)] opacity-0 -translate-x-2',
                'group-hover:opacity-100 group-hover:translate-x-0',
                selected === option.value && 'opacity-100 translate-x-0 text-[var(--color-accent)]',
              )}
              strokeWidth={1.5}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
