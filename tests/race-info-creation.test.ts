import assert from 'node:assert/strict';
import { test } from 'node:test';
import matter from 'gray-matter';
import { createRaceInfoEmail, raceIdError, suggestRaceId } from '../src/lib/race-info-creation';

test('suggests URL-safe IDs and avoids existing IDs case-insensitively', () => {
  const ids = ['BenNevis', 'bennevis2'];
  assert.equal(suggestRaceId('Bén Nevis!', ids), 'BenNevis3');
  assert.equal(suggestRaceId('?!', ids), '');
  for (const id of ['Ben-Nevis_3', suggestRaceId('Bén Nevis!', ids)]) {
    assert.equal(raceIdError(id, ids), null);
    assert.equal(encodeURIComponent(id), id);
    assert.equal(encodeURIComponent(encodeURIComponent(id)), id);
  }
  for (const id of ['', '.', '..', '../other', 'A B', 'A%20B', 'é', 'a/b', 'a\nb']) {
    assert.ok(raceIdError(id, ids), id);
  }
  assert.match(raceIdError('BENNEVIS', ids) ?? '', /already in use/);
  assert.match(raceIdError('NewRace', null) ?? '', /could not be checked/);
});

test('creates a complete new-race email and rejects unsafe submissions', () => {
  const fields = {
    title: 'The Race: a hill race',
    venue: 'Village',
    distance: 12.5,
    climb: 500,
    raceDates: ['Last Saturday in June', 'First Sunday in July'],
    organiser: 'Club <club@example.org>',
  };
  const email = createRaceInfoEmail('TheRace', fields, '# The race\n\nDetails.', []);
  const section = email.body.split('\n');
  const file = section.findIndex((line) => line.startsWith('File:'));
  const end = section.findIndex((line) => line === '!-- END OF SENSITIVE SECTION');
  assert.equal(section[file], 'File: races/TheRace/index.md');
  const parsed = matter(section.slice(file + 1, end).join('\n'));
  assert.deepEqual(parsed.data, fields);
  assert.equal(parsed.content.trim(), '# The race\n\nDetails.');
  assert.match(email.body, /check that the race ID is still available/);
  assert.throws(() => createRaceInfoEmail('therace', fields, '', ['TheRace']), /already in use/);
  assert.throws(() => createRaceInfoEmail('bad%20id', fields, '', []), /Use letters/);
  assert.throws(() => createRaceInfoEmail('TheRace', { title: ' ' }, '', []), /race title/);
  assert.throws(() => createRaceInfoEmail('TheRace', fields, 'text\n !-- END', []), /cannot contain/);
});
