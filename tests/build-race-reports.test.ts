import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const tsx = path.join(root, 'node_modules/tsx/dist/cli.mjs');
const script = path.join(root, 'scripts/build-race-reports.ts');

test('builds report bundles and removes stale generated bundles', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'race-reports-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const content = path.join(temp, 'source');
  const race = path.join(content, 'races', 'TestRace');
  const emptyRace = path.join(content, 'races', 'EmptyRace');
  const output = path.join(temp, 'public', 'reports');
  fs.mkdirSync(race, { recursive: true });
  fs.mkdirSync(emptyRace, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'OldRace.json.gz'), 'stale');
  fs.writeFileSync(path.join(output, 'keep.txt'), 'keep');
  fs.writeFileSync(path.join(race, 'index.md'), '# Race');
  fs.writeFileSync(path.join(race, '2022.md'), '# Plain report\n\nBody.\n');
  fs.writeFileSync(path.join(race, '2023-b.md'), '---\ntitle: Second\nauthor: Runner\nexcerpt: Summary\n---\n\n**Report**\n');
  fs.writeFileSync(path.join(race, '2023-a.md'), 'First\n');
  fs.writeFileSync(path.join(race, '2023-.md'), 'Not a report');
  fs.writeFileSync(path.join(race, 'notes.md'), 'Not a report');
  fs.mkdirSync(path.join(race, '2024.md'));

  const build = () => execFileSync(process.execPath, [tsx, script], {
    cwd: temp,
    env: { ...process.env, CONTENT_ROOT: content },
  });
  build();
  const bundle = path.join(output, 'TestRace.json.gz');
  const reports = JSON.parse(gunzipSync(fs.readFileSync(bundle)).toString('utf8'));
  assert.deepEqual(reports, [
    { slug: '2023-a', year: 2023, content: 'First\n' },
    { slug: '2023-b', year: 2023, title: 'Second', author: 'Runner', excerpt: 'Summary', content: '\n**Report**\n' },
    { slug: '2022', year: 2022, content: '# Plain report\n\nBody.\n' },
  ]);
  assert.equal(fs.existsSync(path.join(output, 'OldRace.json.gz')), false);
  assert.equal(fs.existsSync(path.join(output, 'EmptyRace.json.gz')), false);
  assert.equal(fs.readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'keep');
  execFileSync(process.execPath, [tsx, path.join(root, 'scripts/build-z-manifest.ts')], {
    cwd: temp,
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(temp, 'public', 'asset-manifest.json'), 'utf8'));
  assert.match(manifest.files['/reports/TestRace.json.gz'], /^[0-9a-f]{8}$/);

  fs.unlinkSync(path.join(race, '2022.md'));
  fs.unlinkSync(path.join(race, '2023-a.md'));
  fs.unlinkSync(path.join(race, '2023-b.md'));
  build();
  assert.equal(fs.existsSync(bundle), false);
});

test('fails explicitly on invalid metadata without deleting existing bundles', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'race-reports-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const race = path.join(temp, 'content', 'races', 'TestRace');
  const output = path.join(temp, 'public', 'reports');
  fs.mkdirSync(race, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(race, '2023.md'), '---\nauthor: 123\n---\nReport');
  fs.writeFileSync(path.join(output, 'OldRace.json.gz'), 'existing');

  const result = spawnSync(process.execPath, [tsx, script], {
    cwd: temp,
    env: { ...process.env, CONTENT_ROOT: path.join(temp, 'content') },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /2023\.md: frontmatter "author" must be a string/);
  assert.equal(fs.readFileSync(path.join(output, 'OldRace.json.gz'), 'utf8'), 'existing');
});
