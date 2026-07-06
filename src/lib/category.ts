
export function categoryAge(category: string): number | null {
  const match = category.match(/(\d+)/);
  if (match) return Number.parseInt(match[1], 10);
  if (/(JNR|JUN(IOR)?|U(NDER)?)/i.test(category)) return 23;
  if (/(V(VET)?)/i.test(category))
    return /S(EN(IOR)?)?/i.test(category) ? 50 : 40;
  return null;
}

export function parseEligibilityAgeCap(eligibility: string): number | null {
  const match = eligibility.trim().match(/^U(?:NDER)?\s*(\d+)$/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}
