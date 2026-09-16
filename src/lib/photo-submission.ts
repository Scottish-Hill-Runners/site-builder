import { PHOTOS_EMAIL } from '@/lib/site-config';
import { toWhomItMayConcern } from '@/lib/to-whom-it-may-concern';

/** Opens the user's email client to submit race photos, tagged with the current year only. */
export function openPhotoSubmissionEmail(raceId: string, raceTitle: string) {
  if (!PHOTOS_EMAIL) return;

  const year = String(new Date().getFullYear());
  const subject = `Image submission for ${raceTitle} (${raceId})`;
  const body =
    `To ${toWhomItMayConcern()}:\n\n` +
    `Please find attached image(s) for ${raceTitle} (${raceId}) ${year}.\n\n` +
    `I confirm that:\n\n` +
    `[ ] I am licensing Scottish Hill Runners to display the attached image(s) on its website.\n` +
    `[ ] If the attached image(s) depict identifiable individuals, I have obtained their permission for SHR to publish them.\n\n` +
    `I understand that I need to actually attach the image(s) before sending.\n\n` +
    `!-- If you edit below this line, please be careful, as the formatting is important --\n` +
    `Path: races/${raceId}\n` +
    `Tags: ${year}\n` +
    `License: Licensed for display by SHR\n` +
    `!-- END OF SENSITIVE SECTION\n`;

  window.location.href = `mailto:${PHOTOS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
