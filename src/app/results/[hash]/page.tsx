import type { Metadata } from "next";
import { ResultsView } from '@/components/results/ResultsView';

export const metadata: Metadata = {
  title: "Your picks",
  description: "A short list of fragrances chosen for the preferences you gave us, with a reason for each.",
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  return <ResultsView hash={hash} />;
}
