import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export function progress(message: string): void {
  if ('VERBOSE' in process.env) process.stdout.write(`\x1b[K${message}\r`);
}

export function writeGz(
  outputDir: string,
  fileName: string,
  data: string
): void {
  const outputFile = path.join(outputDir, `${fileName}.gz`);
  fs.writeFileSync(outputFile, zlib.gzipSync(Buffer.from(data, 'utf8')));

  const rawSize = Buffer.byteLength(data);
  const gzipSize = fs.statSync(outputFile).size;
  const compression = ((1 - gzipSize / rawSize) * 100).toFixed(1);
  progress(
    `✓ ${outputFile} (${rawSize}→${gzipSize}, ${compression}% compression)`
  );
}
