import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { estimatedCategory, renderCalendar } from '../src/app/calendar/calendar-pdf';

function pdfText(pdf: Buffer): string[] {
  const contents = pdf.toString('latin1');
  const lines: string[] = [];
  for (const stream of contents.matchAll(/<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    if (!stream[1].includes('/FlateDecode')) continue;
    const data = inflateSync(Buffer.from(stream[2], 'latin1')).toString('latin1');
    for (const command of data.matchAll(/\[(.*?)\] TJ/g)) {
      const bytes = [...command[1].matchAll(/<([0-9a-f]+)>/g)]
        .map((part) => Buffer.from(part[1], 'hex'));
      lines.push(new TextDecoder('windows-1252').decode(Buffer.concat(bytes)));
    }
  }
  return lines;
}

test('estimates categories using calendar distance and ascent bands', () => {
  assert.equal(estimatedCategory(9.4, 470), 'AS');
  assert.equal(estimatedCategory(9.5, 475), 'AM');
  assert.equal(estimatedCategory(20, 500), 'BL');
  assert.equal(estimatedCategory(10, 200), 'CM');
  assert.equal(estimatedCategory(10, 199), undefined);
  assert.equal(estimatedCategory(0, 100), undefined);
  assert.equal(estimatedCategory(10), undefined);
});

test('renders selected races with records and branding across pages', async () => {
  const entries = [
    ...Array.from({ length: 30 }, (_, i) => ({
      Date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      raceName: `Hill Race ${i + 1}`,
      raceId: 'Hill',
      distance: 12,
      climb: 600,
      championships: { one: 'First Series', two: 'Second Series' },
    })),
    { Date: '2026-04-01', raceName: 'Unknown Race' },
  ];
  const races = {
    Hill: {
      title: 'Hill Race',
      venue: 'Village Hall',
      distance: 12,
      organiser: Buffer.from('Race Organiser <organiser@example.org>').toString('base64'),
      web: 'https://example.org/race',
      maleRecord: 'John Runner, 40:00',
      femaleRecord: 'Jane Runner, 45:00',
    },
  };
  const logo = `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), 'src/app/calendar/shr-logo.jpg')).toString('base64')}`;
  const result = await renderCalendar('2026', entries, races, logo, 'Whole year | Filters: First Series');
  assert.equal(result.type, 'application/pdf');
  const pdf = Buffer.from(await result.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  assert.ok(pages > 1);
  const lines = pdfText(pdf);
  assert.equal(lines.filter((line) => line === 'SCOTTISH HILL RUNNERS').length, pages);
  assert.ok(lines.includes(`${pages} / ${pages}`));
  assert.ok(lines.includes('Sun 1 Mar  |  Hill Race 1'));
  assert.ok(lines.includes('Mon 30 Mar  |  Hill Race 30'));
  assert.ok(lines.includes('Venue: Village Hall'));
  assert.ok(lines.includes('12 km  |  600 m ascent  |  Category: AM'));
  assert.ok(lines.includes('Organiser: Race Organiser <organiser@example.org>'));
  assert.ok(lines.includes('Website: https://example.org/race'));
  assert.ok(lines.includes("Men's record: John Runner, 40:00"));
  assert.ok(lines.includes("Women's record: Jane Runner, 45:00"));
  assert.ok(lines.includes('Series: First Series, Second Series'));
  assert.ok(lines.includes('Whole year | Filters: First Series'));
  assert.ok(pdf.toString('latin1').includes('/Subtype /Image'));
  assert.ok(lines.includes('Venue: Not listed'));
  assert.ok(lines.includes('Organiser: Not listed'));
  assert.ok(lines.includes("Men's record: Not listed"));
  assert.ok(lines.includes("Women's record: Not listed"));
  assert.ok(lines.includes('distance not listed  |  ascent not listed  |  Category: not available'));
});
