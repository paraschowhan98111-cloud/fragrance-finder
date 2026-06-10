import { ArrowRight } from 'lucide-react';

interface AnchorInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onContinue: () => void;
}

export function AnchorInput({ value, onChange, placeholder, onContinue }: AnchorInputProps) {
  return (
    <div className="mt-10">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
        rows={2}
        className="w-full bg-transparent border-0 border-b border-[var(--color-rule)] focus:border-[var(--color-ink)] outline-none text-2xl md:text-3xl font-serif placeholder:text-[var(--color-ink-faint)] py-4 resize-none transition-colors"
        style={{ fontFamily: 'var(--font-serif)' }}
      />
      <div className="flex items-center gap-6 mt-6">
        <button
          onClick={onContinue}
          className="group inline-flex items-center gap-2 text-sm tracking-wide uppercase text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent)]"
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.5} />
        </button>
        {!value && (
          <button
            onClick={onContinue}
            className="text-sm text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)] transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
