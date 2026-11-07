import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import RaceDetailsTabs from '../src/components/RaceDetailsTabs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  self: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});
after(() => dom.window.close());

const race = { title: 'Test Race', venue: 'Hills', distance: 10 };
const reports = [
  { slug: '2021', year: 2021, content: 'Old report' },
  { slug: '2024-b', year: 2024, title: 'A new report', author: 'Runner', excerpt: 'A summary', content: '**New report**\n\n<script>alert(1)</script>' },
  { slug: '2024-a', year: 2024, content: 'Another report' },
];

function tabs(raceId: string, hasReports: boolean) {
  return <RaceDetailsTabs raceId={raceId} race={race} contents="" hasGpx={false}
    hasRaceMap={false} results={[]} resultsError={null} galleryImages={[]} hasReports={hasReports} />;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

test('reports tab is conditional, lazy-loaded, sorted and expandable', async () => {
  const urls: string[] = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string) => {
      urls.push(url);
      if (url === '/asset-manifest.json') return Response.json({ files: {} });
      return new Response(gzipSync(JSON.stringify(reports)));
    },
  });
  dom.window.localStorage.clear();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(tabs('NoReports', false)));
    assert.equal(container.querySelector('#race-tab-reports'), null);
    await act(async () => root.render(tabs('TestRace', true)));
    assert.equal(urls.length, 0);
    await act(async () => {
      button(container, 'Reports').click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.ok(urls.includes('/reports/TestRace.json.gz'));
    const reportButtons = [...container.querySelectorAll<HTMLButtonElement>('#race-tab-panel-reports article button')];
    assert.deepEqual(reportButtons.map((item) => item.textContent?.trim().replace(/\s+/g, ' ')), [
      '2024Race report (a)▼',
      '2024A new reportBy RunnerA summary▼',
      '2021Race report▼',
    ]);
    assert.equal(reportButtons[1].getAttribute('aria-expanded'), 'false');
    await act(async () => reportButtons[1].click());
    assert.equal(reportButtons[1].getAttribute('aria-expanded'), 'true');
    const reportPanel = document.getElementById(reportButtons[1].getAttribute('aria-controls') ?? '');
    assert.ok(reportPanel);
    assert.equal(reportPanel.querySelector('strong')?.textContent, 'New report');
    assert.equal(reportPanel.querySelector('script'), null);
    await act(async () => reportButtons[0].click());
    assert.equal(reportButtons[1].getAttribute('aria-expanded'), 'false');
    assert.equal(reportButtons[0].getAttribute('aria-expanded'), 'true');
    await act(async () => root.render(tabs('NoReports', false)));
    assert.equal(container.querySelector('#race-tab-reports'), null);
    assert.equal(container.querySelector('#race-tab-info')?.getAttribute('aria-selected'), 'true');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test('saved reports tab falls back when unavailable and failures are visible', async () => {
  dom.window.localStorage.setItem('raceDetails.activeTab', 'reports');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async () => new Response(null, { status: 500 }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const originalError = console.error;
  const errors: unknown[][] = [];
  console.error = (...args) => { errors.push(args); };
  try {
    await act(async () => root.render(tabs('NoReports', false)));
    assert.equal(container.querySelector('#race-tab-info')?.getAttribute('aria-selected'), 'true');
    await act(async () => root.render(tabs('TestRace', true)));
    await act(async () => {
      button(container, 'Reports').click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /Failed to load race reports/);
    assert.ok(errors.length > 0);
  } finally {
    console.error = originalError;
    await act(async () => root.unmount());
    container.remove();
  }
});
