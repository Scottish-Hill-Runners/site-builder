export const CORRECTIONS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `corrections@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;

export const RESULTS_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `results@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;

export const UPDATES_EMAIL: string | null =
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN
    ? `updates@${process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN.trim()}`
    : null;

export const CLOUDINARY_CLOUD_NAME: string | null =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    ? process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME.trim()
    : "dkrldlz3n";

export const ADMIN_HOST: string =
  process.env.NEXT_PUBLIC_ADMIN_HOST?.trim() || "https://shr-admin2.vercel.app";

