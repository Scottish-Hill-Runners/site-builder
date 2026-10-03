import { saveEmailDraft } from '@/lib/saved-emails';
import { foldEmailBody } from '@/lib/email-line-fold';

// Navigates to a mailto: URL via a synthetic anchor click (not window.location.href)
// so document-level click interceptors, like smart-mailto's picker, can catch it.
export function navigateToMailto(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// Saves a recovery copy of the draft, then opens it in the user's mail client.
// The body is line-folded so mail clients can't mangle embedded CSV/markdown.
export function sendMailto({ to, subject, body }: { to: string; subject: string; body: string }) {
  const foldedBody = foldEmailBody(body);
  saveEmailDraft({ to, subject, body: foldedBody });
  navigateToMailto(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(foldedBody)}`);
}


