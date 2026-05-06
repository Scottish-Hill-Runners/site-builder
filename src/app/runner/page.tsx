import { Suspense } from 'react';
import RunnerPageClient from '@/app/runner/runner-page-client';
import { loadRunnerNames, type RunnerNameEntry } from '@/lib/results-data';

export default async function RunnerPage() {
  const runnerNames = await loadRunnerNames().catch(
    () => [] as RunnerNameEntry[]
  );

  return (
    <Suspense fallback={null}>
      <RunnerPageClient runnerNames={runnerNames} />
    </Suspense>
  );
}
