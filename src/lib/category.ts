
export function categoryAge(category: string): number | null {
  const match = category.match(/(\d+)/);
  if (match) return Number.parseInt(match[1], 10);
  if (/(JNR|J(UN(IOR))?|U(NDER)?)/i.test(category)) return 23;
  if (/(V(VET)?)/i.test(category))
    return /S(EN(IOR)?)?/i.test(category) ? 50 : 40;
  return null;
}

export function parseEligibilityAgeCap(eligibility: string): number | null {
  const match = eligibility.trim().match(/^U(?:NDER)?\s*(\d+)$/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

export function likelySex(category: string): string {
  if (/W(OM[EA]N)?|F(EMALE)?|L(ADY)?|G(IRL)?/i.test(category)) return 'F';
  if (/(A|NB?|NON[-\s]?BINARY)/i.test(category)) return 'NB';
  return 'M';
}

/**
 * Guesses a canonical `M|F|NB` + optional two-digit age category from a raw,
 * unrecognised category string (e.g. "MJ" -> "M18", "LADY VET" -> "F40").
 */
export function suggestCanonicalCategory(rawCategory: string): string | null {
  const raw = rawCategory.trim();
  if (!raw) return null;

  const sex = likelySex(raw);
  const digitMatch = raw.match(/(\d+)/);
  if (digitMatch) return `${sex}${digitMatch[1]}`;

  if (/(JNR|J(UN(IOR))?|U(NDER)?)/i.test(raw)) return `${sex}18`;
  if (/(V(VET)?)/i.test(raw))
    return /S(EN(IOR)?)?/i.test(raw) ? `${sex}50` : `${sex}40`;

  return sex;
}
