import fs from 'node:fs';
import path from 'node:path';

type MigrationRecord = {
  path: string;
  publicId: string;
  resourceType: 'image' | 'raw';
  status: 'uploaded' | 'exists' | 'failed';
};

type CheckResult = {
  path: string;
  url: string;
  ok: boolean;
  status: number;
};

function parseArgs(argv: string[]) {
  const defaults = {
    input: path.join(process.cwd(), 'cloudinary-migration-report.json'),
    output: path.join(process.cwd(), 'cloudinary-migration-verify.json'),
    limit: 0,
  };

  for (const arg of argv) {
    if (arg.startsWith('--input=')) {
      defaults.input = path.resolve(process.cwd(), arg.slice('--input='.length));
      continue;
    }
    if (arg.startsWith('--output=')) {
      defaults.output = path.resolve(process.cwd(), arg.slice('--output='.length));
      continue;
    }
    if (arg.startsWith('--limit=')) {
      defaults.limit = Number(arg.slice('--limit='.length)) || 0;
    }
  }

  return defaults;
}

function encodePublicId(publicId: string): string {
  return publicId
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function extensionOf(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}

function deliveryUrl(cloudName: string, item: MigrationRecord): string {
  const ext = extensionOf(item.path);
  const encodedId = encodePublicId(item.publicId);
  const suffix = ext ? `.${encodeURIComponent(ext)}` : '';
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/${item.resourceType}/upload/${encodedId}${suffix}`;
}

async function checkUrl(url: string): Promise<{ ok: boolean; status: number }> {
  const head = await fetch(url, { method: 'HEAD' });
  if (head.ok) return { ok: true, status: head.status };

  // Some providers reject HEAD for certain resources; fallback to GET.
  const get = await fetch(url, { method: 'GET' });
  return { ok: get.ok, status: get.status };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();

  if (!cloudName) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME before verification');
  }

  const input = JSON.parse(fs.readFileSync(args.input, 'utf8')) as MigrationRecord[];
  const candidates = input.filter(
    (item) => item.status === 'uploaded' || item.status === 'exists'
  );
  const sample = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;

  const results: CheckResult[] = [];
  for (let i = 0; i < sample.length; i += 1) {
    const item = sample[i];
    const url = deliveryUrl(cloudName, item);
    const check = await checkUrl(url);
    results.push({ path: item.path, url, ok: check.ok, status: check.status });

    if ((i + 1) % 25 === 0 || i + 1 === sample.length) {
      console.log(`Verified ${i + 1}/${sample.length}`);
    }
  }

  fs.writeFileSync(args.output, JSON.stringify(results, null, 2));
  console.log(`Wrote verification report: ${args.output}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`- total checked: ${results.length}`);
  console.log(`- failed: ${failed.length}`);

  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
