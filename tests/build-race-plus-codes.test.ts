import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';

test('builds race coordinates from Plus Codes before legacy coordinates', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'race-plus-codes-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const content = path.join(temp, 'content');
  const races = [
    {
      id: 'CastleDouglas',
      venue: 'V4FH+4G Castle Douglas',
      latitude: 12,
      longitude: 34,
    },
    {
      id: 'NewtonStewart',
      venue: '3GR7+J8 Newton Stewart',
      latitude: 12,
      longitude: 34,
    },
    {
      id: 'FullCode',
      venue: '849VCWC8+R9',
      latitude: 12,
      longitude: 34,
    },
    {
      id: 'LegacyCoordinates',
      venue: 'Local start area',
      latitude: 12,
      longitude: 34,
    },
  ];
  for (const dir of ['races', 'clubs', 'championships']) {
    fs.mkdirSync(path.join(content, dir), { recursive: true });
  }
  for (const race of races) {
    const raceDir = path.join(content, 'races', race.id);
    fs.mkdirSync(raceDir);
    fs.writeFileSync(
      path.join(raceDir, 'index.md'),
      `---\ntitle: ${race.id}\nvenue: '${race.venue}'\nlatitude: ${race.latitude}\nlongitude: ${race.longitude}\n---\n`
    );
  }
  fs.writeFileSync(
    path.join(content, 'calendar.csv'),
    `Date,Race\n2026-01-01,CastleDouglas\n2026-01-02,NewtonStewart\n2026-01-03,FullCode\n2026-01-04,LegacyCoordinates\n`
  );

  const root = process.cwd();
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      path.join(root, 'tsconfig.json'),
      path.join(root, 'scripts/build-race-results.ts'),
    ],
    {
      cwd: temp,
      env: { ...process.env, CONTENT_ROOT: content },
    }
  );

  const calendar = JSON.parse(
    gunzipSync(
      fs.readFileSync(path.join(temp, 'public', 'calendar.json.gz'))
    ).toString('utf8')
  ) as Array<{
    raceId: string;
    latitude?: number;
    longitude?: number;
  }>;
  const coordinates = (raceId: string) => {
    const entry = calendar.find((item) => item.raceId === raceId);
    assert.ok(entry, `missing calendar entry for ${raceId}`);
    return { latitude: entry.latitude, longitude: entry.longitude };
  };

  const castleDouglas = coordinates('CastleDouglas');
  assert.ok(Math.abs((castleDouglas.latitude ?? 0) - 54.8728125) < 0.01);
  assert.ok(Math.abs((castleDouglas.longitude ?? 0) + 3.8711875) < 0.01);

  const newtonStewart = coordinates('NewtonStewart');
  assert.ok(Math.abs((newtonStewart.latitude ?? 0) - 55.0915625) < 0.01);
  assert.ok(Math.abs((newtonStewart.longitude ?? 0) + 4.4866875) < 0.01);

  assert.deepEqual(coordinates('FullCode'), {
    latitude: 37.4220625,
    longitude: -122.0840625,
  });
  assert.deepEqual(coordinates('LegacyCoordinates'), {
    latitude: 12,
    longitude: 34,
  });
});
