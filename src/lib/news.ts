import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export interface NewsItem {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

let cachedNewsItems: NewsItem[] | null = null;

async function readNewsItemsFromFile(): Promise<NewsItem[]> {
  const filePath = path.join(process.cwd(), 'public', 'news.json.gz');
  const compressed = await fs.readFile(filePath);
  const file = gunzipSync(compressed).toString('utf8');
  const newsItems = JSON.parse(file) as NewsItem[];

  if (!Array.isArray(newsItems))
    throw new Error('news.json.gz format is invalid');
  return newsItems;
}

export async function getAllNewsItems(): Promise<NewsItem[]> {
  try {
    if (cachedNewsItems !== null) {
      return cachedNewsItems;
    }
    const newsItems = await readNewsItemsFromFile();
    cachedNewsItems = newsItems;
    return newsItems;
  } catch (error) {
    console.warn('Could not load news data:', error);
    return [];
  }
}

export async function getRecentNewsItems(
  limit: number = 10
): Promise<NewsItem[]> {
  try {
    if (cachedNewsItems !== null) {
      return cachedNewsItems.slice(0, limit);
    }

    const newsItems = await readNewsItemsFromFile();

    cachedNewsItems = newsItems;

    return newsItems.slice(0, limit);
  } catch (error) {
    console.warn('Could not load news data:', error);
    return [];
  }
}
