import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const repo = process.env.CONTENT_REPO || 'Scottish-Hill-Runners/contents';
const ref = process.env.CONTENT_REF || 'main';
const targetDir = process.env.CONTENT_DIR || path.join('content');
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

const destination = path.resolve(process.cwd(), targetDir);

if (existsSync(destination)) {
  rmSync(destination, { recursive: true, force: true });
}

const repoUrl =
  repo.startsWith('http') || repo.startsWith('/') || repo.startsWith('.')
    ? repo
    : `https://github.com/${repo}.git`;

function withGitHubToken(urlString, token) {
  if (!token) {
    return urlString;
  }

  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      return urlString;
    }

    // PAT over HTTPS for private-repo read access in CI.
    url.username = token;
    url.password = 'x-oauth-basic';
    return url.toString();
  } catch {
    return urlString;
  }
}

const cloneUrl = withGitHubToken(repoUrl, githubToken);

console.log(`Cloning ${repoUrl}#${ref} into ${destination}`);
execFileSync(
  'git',
  ['clone', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', ref, cloneUrl, destination],
  { stdio: 'inherit' },
);

execFileSync('git', ['sparse-checkout', 'set', '--no-cone', '/*', '!/blobs/', '!/blobs/**'], {
  cwd: destination,
  stdio: 'inherit',
});

console.log('Content sync complete.');
