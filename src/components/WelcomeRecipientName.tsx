'use client';

import { useMemo } from 'react';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

export default function WelcomeRecipientName() {
  const recipientName = useMemo(() => toWhomItMayConcern(), []);
  return <>{recipientName}</>;
}