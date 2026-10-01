import { saveEmailDraft } from '@/lib/saved-emails';

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
export function sendMailto({ to, subject, body }: { to: string; subject: string; body: string }) {
  saveEmailDraft({ to, subject, body });
  navigateToMailto(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}


