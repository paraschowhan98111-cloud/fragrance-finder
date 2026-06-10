import type { Metadata } from "next";
import { QuizFlow } from '@/components/quiz/QuizFlow';

export const metadata: Metadata = {
  title: "The quiz",
  description: "Five questions about what you like, where you'll wear it, and what budget you have in mind.",
};

export default function QuizPage() {
  return <QuizFlow />;
}
