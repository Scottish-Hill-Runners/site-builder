export function surnameHash(name: string): number {
  const m = name.match(/(\w+)$/);
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
