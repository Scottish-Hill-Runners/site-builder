'use client';

import Link from 'next/link';
import type { ChallengeQuestion } from '@/lib/challenge-questions';

export interface ChallengeQuestionBlockProps {
  question: ChallengeQuestion;
  value: string;
  onChange: (value: string) => void;
}

export default function ChallengeQuestionBlock({
  question,
  value,
  onChange,
}: ChallengeQuestionBlockProps) {
  const hintLink = question.hintUrl ? (
    <Link
      href={question.hintUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-1 underline decoration-amber-300 underline-offset-2 hover:decoration-amber-500 dark:decoration-amber-500"
    >
      (need more help?)
    </Link>
  ) : null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="font-semibold">Challenge question</div>
      <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
        Sadly, the web is full of bad actors. Before continuing, we need some evidence that you are
        a real person who knows at least a little about Scottish hill running.
      </p>
      <p className="mt-2 font-medium text-amber-950 dark:text-amber-100">{question.prompt}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {question.options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-gray-800 transition hover:border-amber-400 dark:border-amber-900 dark:bg-slate-900 dark:text-slate-100"
          >
            <input
              type="radio"
              name={`challenge-${question.id}`}
              value={option.value}
              checked={value === option.value}
              onChange={(e) => onChange(e.target.value)}
              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/90">
        Hint: {question.hint}
        {hintLink ? hintLink : null}
      </p>
    </div>
  );
}