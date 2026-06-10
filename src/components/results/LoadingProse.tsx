'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const stages = [
  'Reading two thousand fragrances',
  'Considering your notes',
  'Narrowing to your style',
  'Writing your picks',
];

export function LoadingProse() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % stages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="py-32 text-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4 }}
          className="text-base md:text-lg font-serif italic text-[var(--color-ink-muted)]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {stages[index]}…
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
