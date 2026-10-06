// Local recovery copies of in-progress markdown editor content, in case the
// user accidentally presses ESC, closes a dialog, or navigates away before
// saving. Best-effort only — never blocks or throws on storage failures.
const STORAGE_PREFIX = 'shr-mdx-draft:';
const INDEX_KEY = 'shr-mdx-draft-index';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 30;

interface IndexEntry {
  key: string;
  updatedAt: number;
}

interface DraftRecord {
  content: string;
  updatedAt: number;
}

// Simple FNV-style string hash (mirrors the approach in runner-name.ts's
// surnameHash, generalized to arbitrary input), returned as base36.
function hashParts(parts: string[]): string {
  const input = parts.join('\u0000');
  let h = 9;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 9 ** 9);
  }
  return Math.abs(h ^ (h >>> 9)).toString(36);
}

export function computeDraftKey(
  pathname: string,
  placeholder: string | undefined,
  initialMarkdown: string
): string {
  return STORAGE_PREFIX + hashParts([pathname, placeholder ?? '', initialMarkdown]);
}

function readIndex(): IndexEntry[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is IndexEntry =>
        entry && typeof entry.key === 'string' && typeof entry.updatedAt === 'number'
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: IndexEntry[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota/availability errors (e.g. private browsing).
  }
}

// Removes expired/evicted draft entries so the index never grows unbounded.
function pruneIndex(entries: IndexEntry[]): IndexEntry[] {
  const now = Date.now();
  const fresh = entries.filter((entry) => now - entry.updatedAt <= TTL_MS);
  const kept = fresh.slice(-MAX_DRAFTS);
  const dropped = entries.filter((entry) => !kept.includes(entry));
  for (const entry of dropped) {
    try {
      localStorage.removeItem(entry.key);
    } catch {
      // Ignore.
    }
  }
  return kept;
}

export function loadDraft(key: string): DraftRecord | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.content !== 'string' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null;
    }
    if (Date.now() - parsed.updatedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed as DraftRecord;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, content: string, updatedAt = Date.now()): void {
  try {
    localStorage.setItem(key, JSON.stringify({ content, updatedAt } satisfies DraftRecord));
    const index = pruneIndex(readIndex().filter((entry) => entry.key !== key));
    writeIndex([...index, { key, updatedAt }]);
  } catch {
    // Ignore quota/availability errors — this is a best-effort safety net.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key);
    writeIndex(readIndex().filter((entry) => entry.key !== key));
  } catch {
    // Ignore.
  }
}
