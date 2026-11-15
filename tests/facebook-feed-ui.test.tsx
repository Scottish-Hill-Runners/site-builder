import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import RecentUpdates from '../src/components/RecentUpdates';
import NewsList from '../src/components/NewsList';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});
after(() => dom.window.close());

const news = [
  { slug: 'first', title: 'Recent news', date: '2026-01-04', excerpt: 'News excerpt', content: '**Full story**' },
  { slug: 'second', title: 'Earlier news', date: '2026-01-02', excerpt: 'Earlier excerpt', content: 'Earlier story' },
];

test('interleaves news and copied posts by date, with expandable news and more updates', async () => {
  const posts = [
    { id: 'first', createdTime: '2026-01-05T12:00:00Z', message: 'Newest post',
      images: [{ url: 'https://res.cloudinary.com/test/image/upload/photo.jpg', description: 'Hill runners' }] },
    { id: 'middle', createdTime: '2026-01-03T12:00:00Z', message: 'Middle post', images: [] },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `old-${index}`, createdTime: '2026-01-01T12:00:00Z', message: `Old post ${index}`, images: [],
    })),
  ];
  const urls: string[] = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string) => {
      urls.push(url);
      return Response.json({ posts });
    },
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<RecentUpdates newsItems={news} />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const articles = container.querySelectorAll('article');
    assert.equal(articles.length, 10);
    assert.match(articles[0].textContent ?? '', /Newest post/);
    assert.match(articles[1].textContent ?? '', /Recent news/);
    assert.match(articles[2].textContent ?? '', /Middle post/);
    assert.match(articles[3].textContent ?? '', /Earlier news/);
    assert.equal(articles[0].querySelector('img')?.getAttribute('alt'), 'Hill runners');
    assert.equal(new URL(articles[0].querySelector('img')?.src ?? '').hostname, 'res.cloudinary.com');
    assert.ok(urls.every((url) => !url.includes('facebook.com')));

    const newsButton = articles[1].querySelector('button');
    assert.ok(newsButton);
    await act(async () => newsButton.click());
    assert.equal(newsButton.getAttribute('aria-expanded'), 'true');
    assert.equal(articles[1].querySelector('strong')?.textContent, 'Full story');

    const showAll = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Show all updates');
    assert.ok(showAll);
    await act(async () => showAll.click());
    assert.equal(container.querySelectorAll('article').length, 13);
    assert.equal(showAll.getAttribute('aria-expanded'), 'true');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('shows news while the Facebook feed is loading', async () => {
  let resolveFetch!: (response: Response) => void;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<RecentUpdates newsItems={news} />));
    assert.match(container.textContent ?? '', /Loading Facebook posts/);
    assert.match(container.textContent ?? '', /Recent news/);
    await act(async () => resolveFetch(Response.json({ posts: [] })));
    assert.doesNotMatch(container.textContent ?? '', /Loading Facebook posts/);
    assert.equal(container.querySelectorAll('article').length, 2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('keeps news available when a feed contains non-Cloudinary image URLs', async () => {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json({
      posts: [{ id: 'post', createdTime: '2026-01-01T12:00:00Z', message: '', images: [{ url: 'https://facebook.com/photo.jpg' }] }],
    }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const originalError = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      root.render(<RecentUpdates newsItems={news} />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.match(container.textContent ?? '', /Facebook posts are temporarily unavailable/);
    assert.match(container.textContent ?? '', /Recent news/);
    assert.equal(container.querySelectorAll('article').length, 2);
    assert.equal(container.querySelector('img'), null);
  } finally {
    console.error = originalError;
    await act(async () => root.unmount());
    container.remove();
  }
});

test('the news archive still expands only one story at a time', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<NewsList items={news} />));
    const buttons = container.querySelectorAll<HTMLButtonElement>('article button');
    await act(async () => buttons[0].click());
    assert.equal(buttons[0].getAttribute('aria-expanded'), 'true');
    await act(async () => buttons[1].click());
    assert.equal(buttons[0].getAttribute('aria-expanded'), 'false');
    assert.equal(buttons[1].getAttribute('aria-expanded'), 'true');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('links Facebook post URLs while preserving plain text and punctuation', async () => {
  const message = 'Results: https://www.sportident.co.uk/results/StrathearnHarriers/2026/.\n' +
    'More at (https://example.com/a_(b)?x=1&y=2)! **Not markdown** <script>alert(1)</script>';
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => Response.json({
      posts: [{ id: 'post', createdTime: '2026-01-05T12:00:00Z', message, images: [] }],
    }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<RecentUpdates newsItems={[]} />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const paragraph = container.querySelector('article p');
    assert.ok(paragraph);
    assert.equal(paragraph.textContent, message);
    const links = paragraph.querySelectorAll('a');
    assert.equal(links.length, 2);
    assert.equal(links[0].getAttribute('href'), 'https://www.sportident.co.uk/results/StrathearnHarriers/2026/');
    assert.equal(links[1].getAttribute('href'), 'https://example.com/a_(b)?x=1&y=2');
    assert.equal(paragraph.querySelector('strong, script'), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('expanded news links bare URLs and preserves Markdown links', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const item = {
    ...news[0],
    content: 'Results: https://example.com/results.\n\n[Race details](https://example.com/race)',
  };
  try {
    await act(async () => root.render(<NewsList items={[item]} />));
    const button = container.querySelector<HTMLButtonElement>('article button');
    assert.ok(button);
    await act(async () => button.click());
    const links = container.querySelectorAll('article a');
    assert.equal(links.length, 2);
    assert.equal(links[0].getAttribute('href'), 'https://example.com/results');
    assert.equal(links[1].getAttribute('href'), 'https://example.com/race');
    assert.equal(links[1].textContent, 'Race details');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
