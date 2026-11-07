import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';

test('builds calendar dates from absolute rules with or without a weekday', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'race-dates-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const content = path.join(temp, 'content');
  for (const dir of ['races', 'clubs', 'championships']) {
    fs.mkdirSync(path.join(content, dir), { recursive: true });
  }
  const currentYear = Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/London',
    year: 'numeric',
  }).format(new Date()));
  const nextYear = currentYear + 1;
  const addRace = (id: string, rule: string, recentResults = false) => {
    const race = path.join(content, 'races', id);
    fs.mkdirSync(race);
    fs.writeFileSync(path.join(race, 'index.md'), `---\ntitle: ${id}\nraceDate: "${rule}"\n---\n`);
    if (recentResults) {
      fs.writeFileSync(
        path.join(race, `${currentYear}.csv`),
        'Position,Name,Club,Category,Time\n1,Test Runner,Test Club,M,30:00\n'
      );
    }
  };
  for (const weekday of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
    addRace(weekday, `${weekday} 13th June ${nextYear}`);
  }
  addRace('Lowercase', `  sunday   13th   june   ${nextYear}  `);
  addRace('Plain', `13th June ${nextYear}`);
  addRace('Recurring', 'Sunday 13th December', true);
  addRace('PlainRecurring', '13th December', true);
  addRace('Ordinal', '2nd Sunday in June', true);
  addRace('DayAfter', 'Day after Sunday', true);
  addRace('Invalid', `Someday 13th June ${nextYear}`);
  addRace('OtherYear', `Sunday 13th June ${nextYear + 1}`);
  addRace('Explicit', `Sunday 13th June ${nextYear}`);
  const multiple = path.join(content, 'races', 'Multiple');
  fs.mkdirSync(multiple);
  fs.writeFileSync(path.join(multiple, 'index.md'), `---\ntitle: Multiple\nraceDates:\n  - Sunday 13th June ${nextYear}\n  - Monday 14th June ${nextYear}\n---\n`);
  fs.writeFileSync(path.join(content, 'calendar.csv'), `${nextYear}-06-14,Explicit\n`);

  const root = process.cwd();
  execFileSync(process.execPath, [
    path.join(root, 'node_modules/tsx/dist/cli.mjs'),
    '--tsconfig',
    path.join(root, 'tsconfig.json'),
    path.join(root, 'scripts/build-race-results.ts'),
  ], {
    cwd: temp,
    env: { ...process.env, CONTENT_ROOT: content },
  });

  const calendar = JSON.parse(gunzipSync(fs.readFileSync(path.join(temp, 'public', 'calendar.json.gz'))).toString('utf8')) as Array<{ Date: string; raceId?: string }>;
  const dates = (raceId: string) => calendar.filter((entry) => entry.raceId === raceId).map((entry) => entry.Date);
  for (const raceId of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Lowercase', 'Plain']) {
    assert.deepEqual(dates(raceId), [`${nextYear}-06-13`], raceId);
  }
  assert.ok(dates('Recurring').includes(`${currentYear}-12-13`));
  assert.ok(dates('PlainRecurring').includes(`${currentYear}-12-13`));
  assert.ok(dates('Ordinal').some((date) => date.startsWith(`${currentYear}-06-`)));
  assert.deepEqual(dates('DayAfter'), [`${nextYear}-06-14`]);
  assert.deepEqual(dates('Multiple'), [`${nextYear}-06-13`, `${nextYear}-06-14`]);
  assert.deepEqual(dates('Invalid'), []);
  assert.deepEqual(dates('OtherYear'), []);
  assert.deepEqual(dates('Explicit'), [`${nextYear}-06-14`]);
});
