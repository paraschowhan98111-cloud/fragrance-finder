import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Container } from '@/components/editorial/Container';
import { Heading } from '@/components/editorial/Heading';
import { Body } from '@/components/editorial/Body';
import { ProgressIndicator } from './ProgressIndicator';

interface QuestionScreenProps {
  title: string;
  subtitle?: string;
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  children: ReactNode;
}

export function QuestionScreen({
  title,
  subtitle,
  currentStep,
  totalSteps,
  onBack,
  children,
}: QuestionScreenProps) {
  return (
    <motion.div
      key={currentStep}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="min-h-screen flex flex-col justify-center py-24"
    >
      <ProgressIndicator current={currentStep} total={totalSteps} />
      <Container size="default">
        <Heading level={1}>{title}</Heading>
        {subtitle && (
          <Body tone="muted" size="base" className="mt-3 italic">
            {subtitle}
          </Body>
        )}
        {children}
        {currentStep > 0 && onBack && (
          <div className="mt-16">
            <button
              onClick={onBack}
              className="text-sm text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)] transition-colors tracking-wide"
            >
              ← Back
            </button>
          </div>
        )}
      </Container>
    </motion.div>
  );
}
