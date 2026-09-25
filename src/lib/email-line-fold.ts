/**
 * Some email clients hard-wrap plain-text bodies at ~72-78 characters,
 * inserting a newline mid-line. That can corrupt CSV rows or markdown
 * prose embedded in the results-submission `mailto:` body before
 * shr-admin2 parses it back out.
 *
 * This folds long logical lines into shorter physical lines terminated by
 * a single trailing `^` continuation marker, so any re-wrapping performed
 * by a mail client (at any width) can't lose information: shr-admin2's
 * `unfoldEmailBody()` simply rejoins lines ending in a marker.
 *
 * Every literal `^` in the original text is escaped to `^^` first, which
 * guarantees genuine content always ends in an *even* number of trailing
 * carets. The fold marker always makes a physical line end in an *odd*
 * number of trailing carets. That parity is what lets the unfold step
 * unambiguously tell a fold marker apart from real trailing carets, even
 * when a cut lands right next to one.
 */
export function foldEmailBody(body: string, maxLineLength = 70): string {
  const escaped = body.replace(/\r\n?/g, '\n').replace(/\^/g, '^^');
  return escaped
    .split('\n')
    .map((line) => foldLine(line, maxLineLength))
    .join('\n');
}

function foldLine(line: string, maxLineLength: number): string {
  const chars = Array.from(line);
  if (chars.length <= maxLineLength) return line;

  const physicalLines: string[] = [];
  let rest = chars;
  while (rest.length > maxLineLength) {
    let cut = maxLineLength;
    // Never split an escaped `^^` pair: a slice must end in an even number
    // of trailing carets before we append our own (odd-making) marker.
    if (trailingCaretCount(rest, cut) % 2 !== 0) cut -= 1;
    physicalLines.push(rest.slice(0, cut).join('') + '^');
    rest = rest.slice(cut);
  }
  physicalLines.push(rest.join(''));
  return physicalLines.join('\n');
}

function trailingCaretCount(chars: string[], upTo: number): number {
  let count = 0;
  for (let i = upTo - 1; i >= 0 && chars[i] === '^'; i--) count++;
  return count;
}
