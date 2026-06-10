'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence } from 'framer-motion';
import type { QuizAnswers, QuestionConfig } from '@/lib/quiz-types';
import { answersToPreferences } from '@/lib/quiz-types';
import { hashPreferences, savePrefs } from '@/lib/quiz-storage';
import { QuestionScreen } from './QuestionScreen';
import { AnchorInput } from './AnchorInput';
import { OptionList } from './OptionList';

const QUESTIONS: QuestionConfig[] = [
  {
    id: 'anchor',
    type: 'text',
    title: 'Name a fragrance you love. Or a smell you remember.',
    subtitle: 'Coffee. Old books. Salt air. Anything that catches you. Optional.',
    placeholder: 'Bleu de Chanel, old leather, fresh laundry…',
    optional: true,
  },
  {
    id: 'occasion',
    type: 'single_select',
    title: 'When will you wear this most?',
    options: [
      { value: 'office', label: 'Office daily', subtitle: 'A scent that earns its space' },
      { value: 'date', label: 'Date night', subtitle: 'Closer than work, bolder than weekend' },
      { value: 'casual', label: 'Casual everyday', subtitle: 'Weekend, errands, second skin' },
      { value: 'formal', label: 'Formal events', subtitle: 'Black tie. Weddings. Galas.' },
      { value: 'gym', label: 'Gym and active', subtitle: 'Light, fresh, gym-bag friendly' },
      { value: 'signature', label: 'Signature for everything', subtitle: 'One fragrance, everywhere' },
    ],
  },
  {
    id: 'season',
    type: 'single_select',
    title: "What's the vibe?",
    options: [
      { value: 'cold', label: 'Cold weather', subtitle: 'Warm, resinous, close-to-skin' },
      { value: 'warm', label: 'Warm weather', subtitle: 'Fresh, citrus, breathable' },
      { value: 'versatile', label: 'Versatile, year-round', subtitle: 'Works in any season' },
    ],
  },
  {
    id: 'gender',
    type: 'single_select',
    title: 'Are you open to…',
    options: [
      { value: 'any', label: 'Anything that fits', subtitle: 'Open to all marketings' },
      { value: 'masculine', label: 'Mostly masculine', subtitle: 'Lean into masculine territory' },
      { value: 'feminine', label: 'Mostly feminine', subtitle: 'Lean into feminine territory' },
      { value: 'unisex', label: 'Specifically unisex', subtitle: 'Strictly genderless' },
    ],
  },
  {
    id: 'budget_tier',
    type: 'single_select',
    title: "What's your budget?",
    options: [
      { value: '1', label: 'Under $50', subtitle: 'Drugstore and entry designer' },
      { value: '2', label: '$50 to $150', subtitle: 'Mainstream designer' },
      { value: '3', label: '$150 to $300', subtitle: 'Premium designer and niche' },
      { value: '4', label: 'No limit', subtitle: 'Show me the best fit, any price' },
    ],
  },
];

export function QuizFlow() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});

  const question = QUESTIONS[currentStep];
  const isLast = currentStep === QUESTIONS.length - 1;

  function handleAnswer(value: string) {
    const updated: QuizAnswers = { ...answers };

    if (question.id === 'budget_tier') {
      updated.budget_tier = parseInt(value) as 1 | 2 | 3 | 4;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updated as any)[question.id] = value;
    }

    setAnswers(updated);

    if (isLast) {
      const prefs = answersToPreferences(updated);
      const hash = hashPreferences(prefs);
      savePrefs(hash, prefs);
      router.push(`/results/${hash}`);
      return;
    }

    setTimeout(() => {
      setCurrentStep((s) => s + 1);
    }, 250);
  }

  function handleAnchorContinue() {
    if (isLast) {
      const prefs = answersToPreferences(answers);
      const hash = hashPreferences(prefs);
      savePrefs(hash, prefs);
      router.push(`/results/${hash}`);
      return;
    }
    setCurrentStep((s) => s + 1);
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  const selectedValue =
    question.id === 'budget_tier'
      ? answers.budget_tier?.toString()
      : (answers[question.id] as string | undefined);

  return (
    <main>
      <AnimatePresence mode="wait">
        <QuestionScreen
          key={currentStep}
          title={question.title}
          subtitle={question.subtitle}
          currentStep={currentStep}
          totalSteps={QUESTIONS.length}
          onBack={handleBack}
        >
          {question.type === 'text' ? (
            <AnchorInput
              value={answers.anchor ?? ''}
              onChange={(val) => setAnswers((a) => ({ ...a, anchor: val }))}
              placeholder={question.placeholder}
              onContinue={handleAnchorContinue}
            />
          ) : (
            <OptionList
              options={question.options ?? []}
              selected={selectedValue}
              onSelect={handleAnswer}
            />
          )}
        </QuestionScreen>
      </AnimatePresence>
    </main>
  );
}
