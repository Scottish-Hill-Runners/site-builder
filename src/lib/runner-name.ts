export function surnameHash(name: string): number {
  // Strip diacritics so e.g. "Óldham" and "Oldham" hash to the same batch.
  const stripped = name.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, '');
  const m = stripped.match(/(\w+)$/);
  const last = m ? m[1] : '';
  let h = 9;
  for (let i = 0; i < last.length; i++) {
    h = Math.imul(h ^ last.charCodeAt(i), 9 ** 9);
  }
  return Math.abs(h ^ (h >>> 9));
}

function normalizeNameToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z]/g, '');
}

// Accent/case-insensitive identity key for a full name, used to group the
// same person across spelling variants (e.g. "Véronica" vs "Veronica")
// without altering the name as displayed anywhere.
// Cached because callers (e.g. championship standings) re-normalize the
// same names/clubs repeatedly across many sort comparisons.
const normalizeFullNameCache = new Map<string, string>();
export function normalizeFullName(name: string): string {
  const cached = normalizeFullNameCache.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const result = name
    .trim()
    .split(/\s+/)
    .map(normalizeNameToken)
    .filter(Boolean)
    .join(' ');
  normalizeFullNameCache.set(name, result);
  return result;
}

function splitRunnerName(name: string): { first: string; surname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: '', surname: '' };
  }

  const surname = parts[parts.length - 1];
  const first = parts[0];
  return { first, surname };
}

function firstNameApproximateMatch(
  queryFirst: string,
  candidateFirst: string
): boolean {
  const q = normalizeNameToken(queryFirst);
  const c = normalizeNameToken(candidateFirst);

  if (q.length === 0 || c.length === 0) {
    return q === c;
  }

  if (q === c) {
    return true;
  }

  // Handles cases like Kris vs Kristopher and Chris vs Christopher.
  if (q.startsWith(c) || c.startsWith(q)) {
    return true;
  }

  return false;
}

export function runnerNameMatches(
  searchName: string,
  candidateName: string
): boolean {
  const search = splitRunnerName(searchName);
  const candidate = splitRunnerName(candidateName);

  if (!search.surname || !candidate.surname) {
    return false;
  }

  const surnameMatches =
    normalizeNameToken(search.surname) ===
    normalizeNameToken(candidate.surname);
  if (!surnameMatches) {
    return false;
  }

  return firstNameApproximateMatch(search.first, candidate.first);
}
