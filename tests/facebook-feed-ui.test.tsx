import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import FacebookFeed from '../src/components/FacebookFeed';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});
after(() => dom.window.close());

test('shows copied photos and allows the remaining posts to be expanded', async () => {
  const posts = Array.from({ length: 6 }, (_, index) => ({
    id: `post-${index}`, createdTime: '2026-01-01T12:00:00Z', message: `Post ${index}`,
    images: index === 0 ? [{ url: 'https://res.cloudinary.com/test/image/upload/photo.jpg', description: 'Hill runners' }] : [],
  }));
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
      root.render(<FacebookFeed />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    assert.equal(container.querySelectorAll('article').length, 5);
    assert.equal(container.querySelector('img')?.getAttribute('alt'), 'Hill runners');
    assert.equal(new URL(container.querySelector('img')?.src ?? '').hostname, 'res.cloudinary.com');
    assert.ok(urls.every((url) => !url.includes('facebook.com')));
    const button = container.querySelector('button');
    assert.ok(button);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    await act(async () => button.click());
    assert.equal(container.querySelectorAll('article').length, 6);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('rejects non-Cloudinary image URLs rather than contacting Facebook', async () => {
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
      root.render(<FacebookFeed />);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.match(container.textContent ?? '', /temporarily unavailable/);
    assert.equal(container.querySelector('img'), null);
  } finally {
    console.error = originalError;
    await act(async () => root.unmount());
    container.remove();
  }
});
