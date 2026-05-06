import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const publicDir = path.join(process.cwd(), 'public');

function findGzFiles(dir: string, base: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findGzFiles(fullPath, base));
    } else if (entry.name.endsWith('.gz')) {
      results.push('/' + path.relative(base, fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
}

const files = findGzFiles(publicDir, publicDir);
const hashes: Record<string, string> = {};

for (const filePath of files) {
  const absPath = path.join(publicDir, filePath);
  const buffer = fs.readFileSync(absPath);
  const hash = crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex')
    .slice(0, 8);
  hashes[filePath] = hash;
}

const manifest = {
  generated: new Date().toISOString(),
  files: hashes,
};

const outputPath = path.join(publicDir, 'asset-manifest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest));
console.log(`✓ asset-manifest.json (${files.length} files)`);
