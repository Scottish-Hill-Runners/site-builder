import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  self: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});
after(() => dom.window.close());

test('renders winter schedules across New Year, including the closest of multiple dates', async () => {
  const year = new Date().getFullYear();
  const next = year + 1;
  const season = `${year}/${String(next).slice(-2)}`;
  const championships = [{
    slug: 'Winter', title: 'Winter Series', contents: '@Schedule',
    years: { [season]: ['After', 'Before', 'Missing'] },
    yearHasData: { [season]: true },
  }];
  const calendar = [
    { Date: `${year}-03-22`, raceId: 'After' },
    { Date: `${next}-03-21`, raceId: 'After' },
    { Date: `${year}-12-20`, raceId: 'Before' },
    { Date: `${year}-12-28`, raceId: 'Before' },
  ];
  const races = Object.fromEntries(['Before', 'After', 'Missing'].map((race) => [race, { title: race }]));
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string) => {
      if (url === '/asset-manifest.json') return Response.json({ files: {} });
      const payload = url === '/championships.json.gz' ? championships
        : url === '/calendar.json.gz' ? calendar
        : url === '/results/races.json.gz' ? races : undefined;
      return payload ? new Response(gzipSync(JSON.stringify(payload))) : new Response(null, { status: 404 });
    },
  });
  const { default: ChampionshipPageClient } = await import('../src/app/championships/[series]/championship-page-client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<ChampionshipPageClient series="Winter" />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.match(container.textContent ?? '', new RegExp(`${season} race schedule`));
    assert.deepEqual([...container.querySelectorAll('li')].map((li) => li.textContent?.trim()).filter((text) =>
      text?.startsWith('Before') || text?.startsWith('After') || text?.startsWith('Missing')),
    ['Before - 28 December', 'After - 21 March', 'Missing']);
    assert.equal(container.querySelector(`a[href="/championships/Winter/${year}-${String(next).slice(-2)}"]`)?.textContent, season);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
