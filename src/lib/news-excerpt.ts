/** Falls back to the first sentence of the body when no excerpt is given. */
export function firstSentence(markdown: string) {
  const plainText = markdown
    .replace(/[#*_`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = plainText.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : plainText).trim();
}
