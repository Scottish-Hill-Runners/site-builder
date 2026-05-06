import path from 'node:path';

const rootDir = process.cwd();
const defaultContentRoot = path.join(rootDir, 'content');

function normalizeContentRoot(envValue?: string): string {
  if (!envValue || envValue.trim() === '') return defaultContentRoot;
  return path.isAbsolute(envValue)
    ? path.normalize(envValue)
    : path.resolve(rootDir, envValue);
}

export function contentRoot(): string {
  return normalizeContentRoot(process.env.CONTENT_ROOT);
}

export function contentPath(...segments: string[]): string {
  return path.join(contentRoot(), ...segments);
}
