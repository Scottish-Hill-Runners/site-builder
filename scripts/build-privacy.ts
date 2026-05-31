import fs from 'fs/promises';
import path from 'path';
import { progress } from './write-gz-util';
import { contentPath } from './content-paths';

async function main() {
  const src = contentPath('PRIVACY.md');
  const dest = path.join(process.cwd(), 'public', 'privacy.md');
  await fs.copyFile(src, dest);
  progress(`Copied privacy policy to ${dest}`);
}

main().catch((err) => {
  progress(`Error: ${err.message}`);
  process.exit(1);
});
