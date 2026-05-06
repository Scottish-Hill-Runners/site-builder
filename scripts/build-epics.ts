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

function buildEpics() {
  const epicDir = contentPath('long-distance');
  const outputDir = path.join(process.cwd(), 'public');

  try {
    // Check if epic directory exists
    if (!fs.existsSync(epicDir)) {
      console.warn('Epic directory not found, creating empty epics.json.gz');
      writeGz(outputDir, 'epics.json', JSON.stringify([]));
      return;
    }

    progress(
      `Reading epics from ${epicDir} (CONTENT_ROOT=${contentRoot()})...`
    );

    // Get all markdown files
    const files = fs
      .readdirSync(epicDir)
      .filter((file) => file.endsWith('.md'));
    progress(`Found ${files.length} epic files`);

    // Parse files
    const epicItems: InfoItem[] = files.map((file) => {
      const filePath = path.join(epicDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(fileContent);

      return {
        slug: file.replace('.md', ''),
        title: (data.title as string) || 'Untitled',
        content: content.replace(/\u00a0/g, ' '),
      };
    });

    // Write to compressed JSON file
    writeGz(outputDir, 'epics.json', JSON.stringify(epicItems));
    progress(`✓ Built ${epicItems.length} epics`);
  } catch (error) {
    console.error('Error building epics:', error);
    process.exit(1);
  }
}

buildEpics();
