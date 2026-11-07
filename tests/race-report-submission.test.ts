import assert from 'node:assert/strict';
import { test } from 'node:test';
import matter from 'gray-matter';
import { createRaceReportEmail, raceReportSubmissionError } from '../src/lib/race-report-submission';

const report = {
  raceId: 'Ben-Nevis',
  raceTitle: 'Ben Nevis',
  year: '2024',
  title: 'The race: a report',
  author: 'A Runner',
  excerpt: 'A memorable day.',
  body: '# Report\n\nThe **race** was great.\n\nSecond paragraph.',
};

test('creates a new report payload with a unique year-prefixed path and markdown', () => {
  const email = createRaceReportEmail(report, '12345-abc');
  assert.match(email.subject, /Ben Nevis.*2024/);
  const section = email.body.split('\n').slice(
    email.body.split('\n').findIndex((line) => line.startsWith('File:')),
    -2
  );
  assert.equal(section.shift(), 'File: races/Ben-Nevis/2024-12345-abc.md');
  const parsed = matter(section.join('\n'));
  assert.deepEqual(parsed.data, {
    title: report.title,
    author: report.author,
    excerpt: report.excerpt,
  });
  assert.equal(parsed.content, report.body);
  assert.match(createRaceReportEmail(report, '12345-def').body, /2024-12345-def\.md/);
});

test('supports optional metadata and rejects unsafe or incomplete submissions', () => {
  const minimal = { ...report, title: '', author: '', excerpt: '' };
  const email = createRaceReportEmail(minimal, '1-abc');
  assert.match(email.body, /---\n---\n# Report/);
  assert.equal(raceReportSubmissionError(minimal), null);
  assert.match(raceReportSubmissionError({ ...report, year: '24' }) ?? '', /four-digit/);
  assert.match(raceReportSubmissionError({ ...report, body: '  ' }) ?? '', /Enter a race report/);
  assert.match(raceReportSubmissionError({ ...report, raceId: '../other' }) ?? '', /invalid identifier/);
  assert.match(raceReportSubmissionError({ ...report, body: 'Hello\n  !-- break' }) ?? '', /cannot contain/);
  assert.throws(() => createRaceReportEmail(report, '../unsafe'), /suffix/);
});
