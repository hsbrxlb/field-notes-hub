const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const data = (name) => JSON.parse(read(name));
const flush = () => new Promise(setImmediate);

function setup(page = 'mascot', fetcher = async (url) => ({ ok: true, json: async () => data(url) })) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', attributes: {}, listeners: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(key, handler) { this.listeners[key] = handler; },
      querySelector(selector) { return element(selector); },
      contains() { return false; }
    });
    return elements.get(id);
  }
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const context = {
    window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: {
      body: { dataset: { page }, classList: { toggle() {} } },
      querySelector(selector) {
        return ['.sidebar', '.mobile-overlay', '.menu-button', '.workspace'].includes(selector) ? null : element(selector);
      },
      getElementById() { return null; }, addEventListener() {}
    },
    location: { pathname: `/${page}.html`, search: '', hash: '' },
    console: { error() {} }, URLSearchParams, AbortController,
    setTimeout(fn, delay) { assert.equal(delay, 12000); timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) { calls.push({ url, options }); return fetcher(url, options); }
  };
  vm.createContext(context);
  vm.runInContext(read('app.js'), context);
  if (page === 'mascot') vm.runInContext(read('mascot.js'), context);
  return { context, calls, timers, element };
}

(async () => {
  // The ordered deferred scripts establish the helper before automatic page startup.
  const html = read('mascot.html');
  assert.match(html, /<script defer src="app\.js\?v=20261019-loading"><\/script>\s*<script defer src="mascot\.js\?v=20261019-loading">/);
  const stalledNav = setup('mascot', async (url, options) => {
    if (url === 'data/content.json') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    return { ok: true, json: async () => data(url) };
  });
  await flush();
  assert.match(stalledNav.element('#content').innerHTML, /class="evo-character"/);
  assert.equal(stalledNav.element('#content').attributes['aria-busy'], 'false');
  assert.equal((stalledNav.element('#content').innerHTML.match(/loading="eager"/g) || []).length, 2);
  assert.equal((stalledNav.element('#content').innerHTML.match(/fetchpriority="high"/g) || []).length, 1);
  assert.deepEqual(stalledNav.calls.map((call) => call.url).sort(), ['data/content.json', 'data/mascot-kit.json', 'data/mascot.json']);
  assert(stalledNav.calls.every((call) => call.options.cache === 'default'));
  for (const timer of stalledNav.timers.values()) timer();
  await flush();
  assert.match(stalledNav.element('#nav-list').innerHTML, /重试导航/);
  assert.match(stalledNav.element('#content').innerHTML, /class="evo-character"/);

  let failMain = true;
  const mainFailure = setup('mascot', async (url) => ({ ok: !(failMain && url === 'data/mascot-kit.json'), json: async () => data(url) }));
  await flush();
  assert.match(mainFailure.element('#nav-list').innerHTML, /aria-current="page"/);
  assert.match(mainFailure.element('#content').innerHTML, /重试吉祥物/);
  failMain = false;
  await mainFailure.element('#retry-mascot').listeners.click();
  assert.match(mainFailure.element('#content').innerHTML, /class="evo-character"/);
  assert(mainFailure.calls.slice(-2).every((call) => call.options.cache === 'reload'));
  assert.equal(mainFailure.timers.size, 0);

  let failNav = true;
  const navigationFailure = setup('mascot', async (url) => ({ ok: !(failNav && url === 'data/content.json'), json: async () => data(url) }));
  await flush();
  failNav = false;
  navigationFailure.element('#retry-navigation').listeners.click({ preventDefault() {} });
  await flush();
  assert.match(navigationFailure.element('#nav-list').innerHTML, /aria-current="page"/);
  assert.equal(navigationFailure.calls.at(-1).options.cache, 'reload');
  assert.equal(navigationFailure.calls.filter((call) => call.url === 'data/mascot.json').length, 1);

  const timeout = setup('mascot', (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')))));
  for (const timer of timeout.timers.values()) timer();
  await flush();
  assert.match(timeout.element('#content').innerHTML, /重试吉祥物/);
  assert.match(timeout.element('#nav-list').innerHTML, /重试导航/);
  assert.equal(timeout.timers.size, 0);

  const otherPage = setup('social-brand');
  await flush();
  assert.deepEqual(otherPage.calls.map((call) => call.url), ['data/content.json', 'data/topics.json']);
  assert(otherPage.calls.every((call) => call.options.cache === 'no-store'));
  assert.equal(otherPage.element('#content').innerHTML, '');
  console.log('Mascot loading tests passed: independent data and failures, 12s timeout, scoped retries, cached requests, ordered startup, unchanged static page path.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
