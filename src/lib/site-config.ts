export const CONTENT_WEBHOOK_URL: string | null =
  process.env.NEXT_PUBLIC_CONTENT_WEBHOOK_URL?.trim() || null;

// Legacy mailto-based submissions remain available for the untouched flows.
export const CORRECTIONS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `corrections@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;

export const RESULTS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `results@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;
