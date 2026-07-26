// NEXT_PUBLIC_ prefix is required so this value is inlined into client bundles.
// The email domain is not sensitive — it is a functional address, not a secret.
export const CORRECTIONS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `corrections@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;

export const RESULTS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `results@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;
