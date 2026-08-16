export const NEXT_PUBLIC_MINOR_CORRECTION_URL: string | null =
  process.env.NEXT_PUBLIC_MINOR_CORRECTION_URL?.trim() || null;

export const DOCUMENTS_API_URL: string =
  process.env.NEXT_PUBLIC_DOCUMENTS_API_URL?.trim() ||
  'https://admin.scottishhillrunners.uk/api/public/documents';

// Legacy mailto-based submissions remain available for the untouched flows.
export const CORRECTIONS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `corrections@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;

export const RESULTS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `results@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;
