import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  self: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  HTMLFormElement: { value: dom.window.HTMLFormElement, configurable: true },
  DocumentFragment: { value: dom.window.DocumentFragment, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  ResizeObserver: {
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    configurable: true,
  },
  getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});
dom.window.HTMLElement.prototype.scrollTo = () => {};
after(() => dom.window.close());

test('race results check uses the latest current-year date without hiding the next race', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T12:00:00Z') });
  const originalDomain = process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN;
  process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN = 'example.com';
  const { default: RacePageClient } = await import('../src/app/races/[raceId]/race-page-client');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let calendar = [
    { Date: '2027-05-01', raceId: 'TestRace' },
    { Date: '2026-04-01', raceId: 'TestRace' },
    { Date: '2026-05-01', raceId: 'TestRace' },
    { Date: '2026-09-01', raceId: 'AnotherRace' },
    { Date: '2025-05-01', raceId: 'TestRace' },
  ];
  let results: object[] = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string) => {
      if (url === '/asset-manifest.json') return Response.json({ files: {} });
      if (url === '/calendar.json.gz') return new Response(gzipSync(JSON.stringify(calendar)));
      if (url === '/results/TestRace.json.gz') {
        return new Response(gzipSync(JSON.stringify({
          info: { title: 'Test Race', venue: 'Hills', distance: 10 },
          contents: '', results, hasGpx: false,
        })));
      }
      return new Response(null, { status: 404 });
    },
  });
  async function renderPage() {
    await act(async () => {
      root.render(
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <RacePageClient raceId="TestRace" gallery={[]} hasReports={false} />
        </SearchParamsContext.Provider>
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
  async function resetPage() {
    await act(async () => root.render(null));
    dom.window.localStorage.clear();
  }
  function clickTab(label: string) {
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
    assert.ok(button);
    act(() => button.click());
  }
  try {
    dom.window.localStorage.clear();
    await renderPage();
    assert.match(container.textContent ?? '', /Next race date:\s*1 May 2027/);
    clickTab('Results');
    assert.match(container.textContent ?? '', /Results for the race on 1 May 2026 have not been uploaded yet/);

    await resetPage();
    calendar = [
      { Date: '2027-05-01', raceId: 'TestRace' },
      { Date: '2025-05-01', raceId: 'TestRace' },
    ];
    await renderPage();
    assert.match(container.textContent ?? '', /Next race date:\s*1 May 2027/);
    clickTab('Results');
    assert.doesNotMatch(container.textContent ?? '', /have not been uploaded yet/);

    await resetPage();
    calendar = [{ Date: '2026-12-01', raceId: 'TestRace' }];
    await renderPage();
    assert.match(container.textContent ?? '', /Next race date:\s*1 December 2026/);
    clickTab('Results');
    assert.doesNotMatch(container.textContent ?? '', /have not been uploaded yet/);

    await resetPage();
    calendar = [{ Date: '2026-05-01', raceId: 'TestRace' }];
    results = [{ raceId: 'TestRace', year: '2026', position: 1, name: 'Runner', category: 'M', categoryPos: {}, time: '30:00' }];
    await renderPage();
    clickTab('Results');
    assert.doesNotMatch(container.textContent ?? '', /have not been uploaded yet/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    if (originalDomain === undefined) delete process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN;
    else process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN = originalDomain;
  }
});
