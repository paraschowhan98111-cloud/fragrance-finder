import type { UserPreferences, Occasion, Season, Gender } from './types';

export interface QuizAnswers {
  anchor?: string;
  occasion?: Occasion;
  season?: Season;
  gender?: Gender;
  budget_tier?: 1 | 2 | 3 | 4;
}

export type QuestionType = 'text' | 'single_select';

export interface OptionConfig {
  value: string;
  label: string;
  subtitle?: string;
}

export interface QuestionConfig {
  id: keyof QuizAnswers;
  type: QuestionType;
  title: string;
  subtitle?: string;
  placeholder?: string;
  options?: OptionConfig[];
  optional?: boolean;
}

export function answersToPreferences(answers: QuizAnswers): UserPreferences {
  return {
    anchor: answers.anchor || undefined,
    occasion: answers.occasion!,
    season: answers.season!,
    gender: answers.gender!,
    budget_tier: answers.budget_tier!,
    dealbreakers: [],
  };
}
