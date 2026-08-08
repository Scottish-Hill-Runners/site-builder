'use client';

import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

export default function ToWhomItMayConcern() {
  const recipientName = toWhomItMayConcern();

  return <span suppressHydrationWarning className="italic">{recipientName}</span>;
}