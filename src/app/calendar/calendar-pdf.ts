import PDFDocument from 'pdfkit/js/pdfkit.standalone';
import type { CalendarEntry } from '@/lib/results-data';
import type { RaceInfo } from '@/types/datatable';

const margin = 44;
const ink = '#17304a';
const blue = '#235b83';
const muted = '#526575';

export function estimatedCategory(distance?: number, climb?: number): string | undefined {
  if (
    distance === undefined || !Number.isFinite(distance) || distance <= 0 ||
    climb === undefined || !Number.isFinite(climb) || climb < 0
  ) return undefined;
  const ratio = climb / distance;
  const ascent = ratio >= 50 ? 'A' : ratio >= 25 ? 'B' : ratio >= 20 ? 'C' : undefined;
  if (!ascent) return undefined;
  const roundedDistance = Math.round(distance);
  const length = roundedDistance < 10 ? 'S' : roundedDistance < 20 ? 'M' : 'L';
  return ascent + length;
}

export function renderCalendar(
  year: string,
  entries: CalendarEntry[],
  races: Record<string, RaceInfo>,
  logo: string,
  selection: string,
): Promise<Blob> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 100, bottom: 52, left: margin, right: margin },
    bufferPages: true,
    autoFirstPage: false,
    info: { Title: `Scottish Hill Runners ${year} Race Calendar` },
  });
  const chunks: ArrayBuffer[] = [];
  const finished = new Promise<Blob>((resolve, reject) => {
    doc.on('data', (chunk: Uint8Array) => chunks.push(Uint8Array.from(chunk).buffer));
    doc.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' })));
    doc.on('error', reject);
  });

  const pageHeader = () => {
    const width = doc.page.width - margin * 2;
    doc.image(logo, margin, 24, { fit: [54, 54], align: 'center', valign: 'center' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(blue)
      .text('SCOTTISH HILL RUNNERS', margin + 67, 29, { width: width - 67 });
    doc.font('Helvetica-Bold').fontSize(21).fillColor(ink)
      .text(`${year} race calendar`, margin + 67, 44, { width: width - 67 });
    doc.moveTo(margin, 87).lineTo(doc.page.width - margin, 87).strokeColor('#bed1de').lineWidth(0.7).stroke();
    doc.x = margin;
    doc.y = 101;
  };
  doc.on('pageAdded', pageHeader);
  doc.addPage();

  const width = doc.page.width - margin * 2;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensureSpace = (height: number) => {
    if (doc.y + height > bottom() && doc.y > 101) doc.addPage();
  };
  const text = (value: string, bold = false, size = 9, color = muted) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
    doc.text(value, margin, doc.y, { width, lineGap: 2 });
  };

  text('Dates and details may change. Always confirm with the race organiser. Records are current.', false, 9);
  text(selection, false, 9);
  doc.moveDown(0.6);

  let month = '';
  for (const entry of entries) {
    const entryMonth = entry.Date.slice(0, 7);
    const info = entry.raceId ? races[entry.raceId] : undefined;
    const organiser = info?.organiser
      ? new TextDecoder().decode(Uint8Array.from(atob(info.organiser), (char) => char.charCodeAt(0))).trim()
      : '';
    const date = new Date(`${entry.Date}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    });
    const distance = entry.distance !== undefined && Number.isFinite(entry.distance)
      ? `${entry.distance} km` : 'distance not listed';
    const climb = entry.climb !== undefined && Number.isFinite(entry.climb)
      ? `${entry.climb} m ascent` : 'ascent not listed';
    const category = estimatedCategory(entry.distance, entry.climb);
    const lines = [
      { value: `${date}  |  ${entry.raceName}`, bold: true, size: 10, color: ink },
      { value: `Venue: ${info?.venue?.trim() || 'Not listed'}` },
      { value: `${distance}  |  ${climb}  |  Category: ${category ?? 'not available'}` },
      { value: `Organiser: ${organiser || 'Not listed'}` },
      ...(info?.web ? [{ value: `Website: ${info.web}` }] : []),
      { value: `Men's record: ${info?.maleRecord?.trim() || 'Not listed'}` },
      { value: `Women's record: ${info?.femaleRecord?.trim() || 'Not listed'}` },
      ...(entry.championships && Object.keys(entry.championships).length
        ? [{ value: `Series: ${Object.values(entry.championships).join(', ')}` }]
        : []),
    ];
    const height = lines.reduce((total, line) => {
      doc.font(line.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(line.size ?? 9);
      return total + doc.heightOfString(line.value, { width, lineGap: 2 });
    }, 9);
    if (entryMonth !== month) {
      month = entryMonth;
      ensureSpace(height + 35);
      const monthName = new Date(`${entryMonth}-01T00:00:00Z`).toLocaleDateString('en-GB', {
        month: 'long', timeZone: 'UTC',
      });
      doc.moveDown(0.4);
      text(monthName.toUpperCase(), true, 12, blue);
      doc.moveTo(margin, doc.y + 2).lineTo(doc.page.width - margin, doc.y + 2)
        .strokeColor('#dce6ec').lineWidth(0.6).stroke();
      doc.y += 9;
    } else {
      ensureSpace(height);
    }
    for (const line of lines) text(line.value, line.bold, line.size, line.color);
    doc.y += 9;
  }

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(muted)
      .text(`Scottish Hill Runners  |  ${year} race calendar`, margin, doc.page.height - 35, {
        width: width - 80, lineBreak: false,
      })
      .text(`${i + 1} / ${pages.count}`, doc.page.width - margin - 80, doc.page.height - 35, {
        width: 80, align: 'right', lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return finished;
}
