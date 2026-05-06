import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { writeGz, progress } from './write-gz-util';
import { contentPath, contentRoot } from './content-paths';

interface InfoItem {
  slug: string;
  title: string;
  content: string;
}

function extractTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

/** Recursively collect all .md files under `dir`, returning slug (relative path without .md) and filePath. */
function collectFiles(
  dir: string,
  base = ''
): { slug: string; filePath: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return collectFiles(fullPath, rel);
    if (entry.name.endsWith('.md'))
      return [{ slug: rel.replace(/\.md$/, ''), filePath: fullPath }];
    return [];
  });
}

function buildInfo() {
  const infoDir = contentPath('info');
  const outputDir = path.join(process.cwd(), 'public');

  try {
    if (!fs.existsSync(infoDir)) {
      console.warn('Info directory not found, creating empty info.json.gz');
      writeGz(outputDir, 'info.json', JSON.stringify([]));
      return;
    }

    progress(`Reading info from ${infoDir} (CONTENT_ROOT=${contentRoot()})...`);

    // Collect all .md files recursively
    const entries = collectFiles(infoDir).sort((a, b) => {
      // index at top level should come first
      if (a.slug === 'index') return -1;
      if (b.slug === 'index') return 1;
      return a.slug.localeCompare(b.slug);
    });

    progress(`Found ${entries.length} info files`);

    // Parse files
    const infoItems: InfoItem[] = entries.map(({ slug, filePath }) => {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContent);

      return {
        slug,
        title:
          (data.title as string | undefined)?.trim() || extractTitle(content),
        content: content.replace(/\u00a0/g, ' '),
      };
    });

    // Write to compressed JSON file
    writeGz(outputDir, 'info.json', JSON.stringify(infoItems));
    progress(`✓ Built ${infoItems.length} info items`);
  } catch (error) {
    console.error('Error building info:', error);
    process.exit(1);
  }
}

buildInfo();
