// scripts/build-privacy.ts
// Copies content/PRIVACY.md to public/privacy.md at build time
import fs from 'fs/promises';
import path from 'path';
import { progress } from './write-gz-util';

async function main() {
  const src = path.join(process.cwd(), 'content', 'PRIVACY.md');
  const dest = path.join(process.cwd(), 'public', 'privacy.md');
  await fs.copyFile(src, dest);
  progress(`Copied privacy policy to ${dest}`);
}

main().catch((err) => {
  progress(`Error: ${err.message}`);
  process.exit(1);
});
