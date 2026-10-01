// Local recovery copies of outgoing emails, in case the user's mail client
// doesn't open correctly or they lose the draft before sending (e.g. by using
// smart-mailto's "Copy Address" button, which discards the composed body).
const STORAGE_KEY = 'shr-saved-email-drafts';
const MAX_DRAFTS = 20;

export interface SavedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
}

function readAll(): SavedEmail[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SavedEmail =>
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.to === 'string' &&
        typeof entry.subject === 'string' &&
        typeof entry.body === 'string' &&
        typeof entry.createdAt === 'string'
    );
  } catch {
    return [];
  }
}

function writeAll(entries: SavedEmail[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota/availability errors (e.g. private browsing) — this is a
    // best-effort safety net, not a required part of the send flow.
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveEmailDraft({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body: string;
}): void {
  const entry: SavedEmail = { id: newId(), to, subject, body, createdAt: new Date().toISOString() };
  writeAll([entry, ...readAll()].slice(0, MAX_DRAFTS));
}

export function getSavedEmails(): SavedEmail[] {
  return readAll();
}

export function deleteSavedEmail(id: string): void {
  writeAll(readAll().filter((entry) => entry.id !== id));
}

export function clearSavedEmails(): void {
  writeAll([]);
}
