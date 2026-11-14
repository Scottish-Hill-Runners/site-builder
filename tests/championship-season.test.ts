import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { championshipSeasonDate, championshipSeasonYears } from '../src/lib/championship-season';

test('selects the date nearest New Year for either winter season format', () => {
  const dates = new Map([
    ['2026/Race', ['2026-03-22', '2026-12-29']],
    ['2027/Race', ['2027-03-21', '2027-01-02']],
  ]);
  assert.deepEqual(championshipSeasonYears('2026/27'), [2026, 2027]);
  assert.deepEqual(championshipSeasonYears('2026/2027'), [2026, 2027]);
  assert.deepEqual(championshipSeasonYears('2099/00'), [2099, 2100]);
  assert.deepEqual(championshipSeasonYears('2026/28'), []);
  assert.equal(championshipSeasonDate('2026/27', 'Race', dates), '2027-01-02');
  assert.equal(championshipSeasonDate('2026/2027', 'Race', dates), '2027-01-02');
  assert.equal(championshipSeasonDate('2026', 'Race', dates), '2026-03-22');
  assert.equal(championshipSeasonDate('2026/27', 'Missing', dates), undefined);
  dates.set('2026/Race', ['2026-12-31']);
  assert.equal(championshipSeasonDate('2026/27', 'Race', dates), '2026-12-31');
});

test('builds winter schedules, results and calendar associations for both years', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'championship-season-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const content = path.join(temp, 'content');
  for (const dir of ['races', 'clubs', 'championships']) {
    fs.mkdirSync(path.join(content, dir), { recursive: true });
  }
  const year = Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/London', year: 'numeric',
  }).format(new Date()));
  const next = year + 1;
  for (const raceId of ['Before', 'After']) {
    const dir = path.join(content, 'races', raceId);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'index.md'), `---\ntitle: ${raceId}\n---\n`);
    for (const resultYear of [year, next]) {
      fs.writeFileSync(path.join(dir, `${resultYear}.csv`),
        `Position,Name,Club,Category,Time\n1,Runner ${resultYear},Test Club,M,30:00\n`);
    }
  }
  const recurring = path.join(content, 'races', 'Recurring');
  fs.mkdirSync(recurring);
  fs.writeFileSync(path.join(recurring, 'index.md'), '---\ntitle: Recurring\nraceDate: 31st December\n---\n');
  fs.writeFileSync(path.join(recurring, `${year}.csv`),
    'Position,Name,Club,Category,Time\n1,Test Runner,Test Club,M,30:00\n');
  fs.writeFileSync(path.join(content, 'calendar.csv'), [
    `${year}-03-22,After`, `${next}-03-21,After`,
    `${year}-12-20,Before`, `${next}-02-01,Before`,
    `${year}-12-28,Before`,
  ].join('\n') + '\n');
  const rules = 'rules:\n  default:\n    points: "1,2.."\n    count: 2\n';
  fs.writeFileSync(path.join(content, 'championships', 'Winter.md'),
    `---\ntitle: Winter\n${rules}'${year}/${String(next).slice(-2)}':\n  - After\n  - Before\n  - Recurring\n---\n@Schedule\n`);
  fs.writeFileSync(path.join(content, 'championships', 'Full.md'),
    `---\ntitle: Full\n${rules}'${year}/${next}':\n  - After\n---\n`);
  fs.writeFileSync(path.join(content, 'championships', 'Annual.md'),
    `---\ntitle: Annual\n${rules}'${year}':\n  - Before\n---\n`);
  fs.writeFileSync(path.join(content, 'championships', 'Official.md'),
    `---\ntitle: Official\n'${year}/${next}':\n  - After\n---\n`);
  fs.mkdirSync(path.join(content, 'championships', 'Official'));
  fs.writeFileSync(path.join(content, 'championships', 'Official', `${year}-${next}.csv`),
    'Name,Club,Category,After,Total\nRunner,Test Club,M,1,1\n');

  const root = process.cwd();
  execFileSync(process.execPath, [
    path.join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig',
    path.join(root, 'tsconfig.json'), path.join(root, 'scripts/build-race-results.ts'),
  ], { cwd: temp, env: { ...process.env, CONTENT_ROOT: content } });
  const read = (file: string) => JSON.parse(gunzipSync(fs.readFileSync(path.join(temp, 'public', file))).toString('utf8'));
  const championships = read('championships.json.gz');
  assert.deepEqual(championships.find((c: { slug: string }) => c.slug === 'Winter').years[`${year}/${String(next).slice(-2)}`], ['After', 'Before', 'Recurring']);
  const winter = read(`results/Winter-${year}-${String(next).slice(-2)}.json.gz`);
  assert.deepEqual(winter.raceSchedule, [
    { raceId: 'Before', date: `${year}-12-28` },
    { raceId: 'Recurring', date: `${year}-12-31` },
    { raceId: 'After', date: `${next}-03-21` },
  ]);
  assert.deepEqual(winter.results.map((r: { raceId: string; year: string }) => [r.raceId, r.year]).sort(), [
    ['After', String(next)], ['Before', String(year)], ['Recurring', String(year)],
  ]);
  assert.deepEqual(read(`results/Full-${year}-${next}.json.gz`).raceSchedule,
    [{ raceId: 'After', date: `${next}-03-21` }]);
  const official = read(`results/Official-${year}-${next}.json.gz`);
  assert.equal(official.resultsFormat, 'official');
  assert.deepEqual(official.raceSchedule, [{ raceId: 'After', date: `${next}-03-21` }]);
  const calendar = read('calendar.json.gz');
  const entry = (date: string, raceId: string) =>
    calendar.find((row: { Date: string; raceId: string }) => row.Date === date && row.raceId === raceId);
  assert.equal(entry(`${year}-12-28`, 'Before').championships.Winter, 'Winter');
  assert.equal(entry(`${next}-03-21`, 'After').championships.Winter, 'Winter');
  assert.equal(entry(`${year}-03-22`, 'After').championships, undefined);
  assert.equal(entry(`${year}-12-20`, 'Before').championships.Annual, 'Annual');
  assert.equal(entry(`${year}-12-20`, 'Before').championships.Winter, undefined);
  assert.ok(entry(`${year}-12-31`, 'Recurring'));
  assert.ok(entry(`${next}-12-31`, 'Recurring'));
  const params = JSON.parse(execFileSync(process.execPath, [
    path.join(root, 'node_modules/tsx/dist/cli.mjs'), '-e',
    `import { generateStaticParams } from ${JSON.stringify(path.join(root, 'src/app/championships/[series]/[year]/page.tsx'))}; generateStaticParams().then((params) => console.log(JSON.stringify(params)));`,
  ], { cwd: temp, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(root, 'tsconfig.json') }, encoding: 'utf8' }));
  assert.ok(params.some((param: { series: string; year: string }) =>
    param.series === 'Winter' && param.year === `${year}-${String(next).slice(-2)}`));
});
