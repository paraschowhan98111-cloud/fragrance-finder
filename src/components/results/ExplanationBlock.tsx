import { motion } from 'framer-motion';

interface ExplanationBlockProps {
  text: string;
}

export function ExplanationBlock({ text }: ExplanationBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="border-t border-[var(--color-rule)] pt-16 pb-32 max-w-2xl"
    >
      <div className="text-xs tracking-[0.2em] uppercase text-[var(--color-ink-faint)] mb-4">
        The curation
      </div>
      <p
        className="text-lg leading-[1.7] text-[var(--color-ink-muted)] italic font-serif"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {text}
      </p>
    </motion.div>
  );
}
