import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import RaceResultsDataTable, {
  type DisplayColumn,
} from './RaceResultsDataTable';
import type { RaceResult } from '@/types/datatable';

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
  ResizeObserver: {
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    configurable: true,
  },
  fetch: {
    value: async () => new Response(null, { status: 404 }),
    configurable: true,
  },
});
Object.defineProperties(dom.window.HTMLElement.prototype, {
  offsetWidth: { get: () => 800 },
  offsetHeight: { get: () => 500 },
  scrollTo: {
    value(this: HTMLElement, options: ScrollToOptions) {
      this.scrollTop = options.top ?? 0;
    },
  },
});

after(() => dom.window.close());

const rows: RaceResult[] = [
  {
    raceId: 'Race A',
    year: '2024',
    position: 1,
    name: 'Runner',
    category: '',
    categoryPos: {},
    time: '1:00',
  },
  {
    raceId: 'Race A',
    year: '2024-short',
    position: 2,
    name: 'Runner',
    category: '',
    categoryPos: {},
    time: '0:30',
  },
  {
    raceId: 'Race A',
    year: '2023',
    position: 3,
    name: 'Runner',
    category: '',
    categoryPos: {},
    time: '1:10',
  },
  {
    raceId: 'Race B',
    year: '2023',
    position: 4,
    name: 'Runner',
    category: '',
    categoryPos: {},
    time: '1:20',
  },
];
const columns = new Set<DisplayColumn>([
  'raceTitle',
  'year',
  'position',
  'time',
]);

async function renderTable(hideYearHeadersWhenRaceFiltered: boolean) {
  dom.window.localStorage.setItem('raceResults.showFilters', 'true');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <RaceResultsDataTable
        data={rows}
        displayColumns={columns}
        displayFilters={{ raceId: '' }}
        initialSortColumn="year"
        initialSortDirection="desc"
        hideYearHeadersWhenRaceFiltered={hideYearHeadersWhenRaceFiltered}
      />
    );
  });
  return {
    container,
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function yearHeaders(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody td[colspan]'))
    .map((cell) => cell.textContent?.trim() ?? '')
    .filter((text) => /^\d{4}\s*—/.test(text));
}

async function selectRace(container: HTMLElement, raceId: string) {
  const select = container.querySelector('select');
  assert.ok(select);
  await act(async () => {
    select.value = raceId;
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}

async function scroll(container: HTMLElement, top: number) {
  const scroller = container.querySelector<HTMLElement>('.max-h-screen');
  assert.ok(scroller);
  await act(async () => {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new dom.window.Event('scroll'));
  });
}

async function sortBy(container: HTMLElement, column: string) {
  const header = Array.from(container.querySelectorAll('th')).find((th) =>
    th.textContent?.startsWith(column)
  );
  assert.ok(header);
  await act(async () => {
    header.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
}

test('runner race filter removes year rows and sticky overlay, and clearing restores them', async () => {
  const { container, cleanup } = await renderTable(true);
  try {
    assert.deepEqual(yearHeaders(container), [
      '2024— 2 results',
      '2023— 2 results',
    ]);
    await scroll(container, 40);
    assert.match(
      container.querySelector('div[aria-hidden="true"]')?.textContent ?? '',
      /2024.*2 results/
    );

    await selectRace(container, 'Race A');
    assert.deepEqual(yearHeaders(container), []);
    assert.equal(container.querySelector('div[aria-hidden="true"]'), null);
    assert.match(
      container.querySelector('tbody')?.textContent ?? '',
      /2024-short/
    );
    assert.match(container.querySelector('tbody')?.textContent ?? '', /2023/);
    await scroll(container, 100);
    assert.equal(container.querySelector('div[aria-hidden="true"]'), null);
    await sortBy(container, 'Position');
    await sortBy(container, 'Year');
    assert.deepEqual(yearHeaders(container), []);

    await selectRace(container, 'Race B');
    assert.deepEqual(yearHeaders(container), []);
    assert.match(container.querySelector('tbody')?.textContent ?? '', /Race B/);

    await selectRace(container, '');
    assert.deepEqual(yearHeaders(container), [
      '2023— 2 results',
      '2024— 2 results',
    ]);
    await scroll(container, 40);
    assert.match(
      container.querySelector('div[aria-hidden="true"]')?.textContent ?? '',
      /2023.*2 results/
    );
    await sortBy(container, 'Position');
    assert.deepEqual(yearHeaders(container), []);
    assert.equal(container.querySelector('div[aria-hidden="true"]'), null);
    await sortBy(container, 'Year');
    assert.deepEqual(yearHeaders(container), [
      '2023— 2 results',
      '2024— 2 results',
    ]);
  } finally {
    await cleanup();
  }
});

test('other tables retain year groups when a race filter is selected', async () => {
  const { container, cleanup } = await renderTable(false);
  try {
    await selectRace(container, 'Race A');
    assert.deepEqual(yearHeaders(container), [
      '2024— 2 results',
      '2023— 1 result',
    ]);
    await scroll(container, 40);
    assert.match(
      container.querySelector('div[aria-hidden="true"]')?.textContent ?? '',
      /2024.*2 results/
    );
  } finally {
    await cleanup();
  }
});
