import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  self: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  Node: { value: dom.window.Node, configurable: true },
  HTMLFormElement: { value: dom.window.HTMLFormElement, configurable: true },
  DocumentFragment: { value: dom.window.DocumentFragment, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true },
  localStorage: { value: dom.window.localStorage, configurable: true },
  getComputedStyle: { value: dom.window.getComputedStyle.bind(dom.window), configurable: true },
  ResizeObserver: {
    value: class { observe() {} unobserve() {} disconnect() {} },
    configurable: true,
  },
  IS_REACT_ACT_ENVIRONMENT: { value: true, configurable: true },
});
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
process.env.NEXT_PUBLIC_CORRECTIONS_EMAIL_DOMAIN = 'example.org';
after(() => dom.window.close());

test('create form checks IDs, submits a new race and blocks failed checks', async () => {
  let responseStatus = 200;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string) => {
      if (url === '/asset-manifest.json') return Response.json({ files: {} });
      if (responseStatus !== 200) return new Response(null, { status: responseStatus });
      return new Response(gzipSync(JSON.stringify(['ExistingRace'])));
    },
  });
  const { createRoot } = await import('react-dom/client');
  const { default: RaceInfoCreateDialog, RaceInfoCreateLink } = await import('../src/components/RaceInfoCreateDialog');
  const { default: RaceInfoEditDialog } = await import('../src/components/RaceInfoEditDialog');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let mailto = '';
  let closed = false;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () { mailto = this.href; };
  const setInput = (id: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(`#${id}`);
    assert.ok(input);
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
    assert.ok(setter);
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(<RaceInfoCreateLink />));
    const addRace = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Add a race');
    assert.ok(addRace);
    assert.equal(container.querySelector('dialog'), null);
    await act(async () => addRace.click());
    assert.ok(container.querySelector('dialog[open]'));
    const cancel = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Cancel');
    assert.ok(cancel);
    await act(async () => cancel.click());
    assert.equal(container.querySelector('dialog'), null);
    await act(async () => root.render(null));

    await act(async () => root.render(<RaceInfoCreateDialog onClose={() => { closed = true; }} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    assert.equal(container.querySelector('#ri-male-record'), null);
    assert.equal(container.querySelector('#ri-female-record'), null);
    assert.ok(container.querySelector('#race-create-distance'));
    setInput('race-create-title', 'Existing Race');
    assert.equal(container.querySelector<HTMLInputElement>('#race-create-id')?.value, 'ExistingRace2');
    setInput('race-create-id', 'existingrace');
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /already in use/);
    await act(async () => container.querySelector('form')?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(mailto, '');
    setInput('race-create-id', 'NewRace');
    setInput('race-create-distance', '12.5');
    await act(async () => container.querySelector('form')?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(closed, true);
    assert.match(decodeURIComponent(mailto), /File: races\/NewRace\/index\.md/);
    assert.match(decodeURIComponent(mailto), /distance: 12\.5/);
    await act(async () => root.render(null));

    responseStatus = 500;
    const originalError = console.error;
    console.error = () => {};
    try {
      await act(async () => root.render(<RaceInfoCreateDialog onClose={() => {}} />));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
      assert.match(container.querySelector('[role="alert"]')?.textContent ?? '', /could not be checked/);
      assert.equal(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled, true);
    } finally {
      console.error = originalError;
    }

    await act(async () => root.render(null));
    closed = false;
    mailto = '';
    await act(async () => root.render(
      <RaceInfoEditDialog open onClose={() => { closed = true; }} raceId="ExistingRace"
        raceTitle="Existing Race" race={{ title: 'Existing Race', venue: 'Village', distance: 10 }}
        organiser={null} contents="Original description" />
    ));
    setInput('ri-distance', '11');
    await act(async () => container.querySelector('form')?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(closed, true);
    const editMail = decodeURIComponent(mailto);
    assert.match(editMail, /File: races\/ExistingRace\/index\.md/);
    assert.match(editMail, /distance: 11/);
    assert.doesNotMatch(editMail, /venue:|title:|Original description/);
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    await act(async () => root.unmount());
    container.remove();
  }
});
