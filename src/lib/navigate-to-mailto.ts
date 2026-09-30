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
