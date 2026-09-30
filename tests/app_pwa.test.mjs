// Pure worker/registration regression tests, independent of Chromium availability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const app = new URL('../app/', import.meta.url);
const project = 'https://example.github.io/dopa-drill/';
const scriptUrl = new URL('js/pwa.js', project).href;
const pwaSource = (await readFile(new URL('js/pwa.js', app), 'utf8'))
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl));
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

async function runRegistration({ supported = true, secure = true, rejected = false, waiting = false } = {}) {
  const status = { textContent: '' };
  const calls = [];
  const listeners = {};
  const workerListeners = {};
  const worker = { state: 'installing', addEventListener: (name, fn) => { workerListeners[name] = fn; } };
  const registration = { installing: worker, waiting: waiting ? {} : null,
    addEventListener: (name, fn) => { listeners[name] = fn; } };
  const serviceWorker = { controller: {}, ready: Promise.resolve(registration),
    register(url, options) {
      calls.push({ url: String(url), scope: options.scope });
      return rejected ? Promise.reject(new Error('Test download failure')) : Promise.resolve(registration);
    } };
  runInContext(pwaSource, createContext({ URL, Promise,
    window: { isSecureContext: secure }, navigator: supported ? { serviceWorker } : {},
    document: { querySelector: selector => { assert.equal(selector, '#offline-status'); return status; } } }));
  await flushPromises();
  return { status, calls, listeners, worker, workerListeners };
}

test('PWA registers the script and scope inside the GitHub Pages project', async () => {
  const { calls, status } = await runRegistration();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.github.io/dopa-drill/sw.js');
  assert.equal(calls[0].scope, '/dopa-drill/');
  assert.match(status.textContent, /Ready for offline play/);
});

test('PWA reports unsupported browsers, failed downloads, and already-waiting updates', async () => {
  for (const options of [{ supported: false }, { secure: false }]) {
    const { calls, status } = await runRegistration(options);
    assert.equal(calls.length, 0);
    assert.match(status.textContent, /Play while online/);
  }
  assert.match((await runRegistration({ rejected: true })).status.textContent, /download did not finish/);
  assert.match((await runRegistration({ waiting: true })).status.textContent, /Close all game windows/);
});

test('PWA notices an update that was already installing when registration resolved', async () => {
  const state = await runRegistration();
  state.worker.state = 'installed';
  state.workerListeners.statechange();
  assert.match(state.status.textContent, /Close all game windows/);
});

test('versioned worker caches all local files, preserves other projects, and serves offline routes coherently', async () => {
  const code = await readFile(new URL('sw.js', app), 'utf8');
  const handlers = {};
  const cachesByName = new Map();
  const keyOf = request => new URL(typeof request === 'string' ? request : request.url, project).href;
  class Cache {
    entries = new Map();
    async addAll(list) {
      for (const relative of list) {
        assert(relative.startsWith('./'), `Cache asset must stay project-relative: ${relative}`);
        await access(new URL(relative === './' ? 'index.html' : relative, app));
        this.entries.set(keyOf(relative), { cached: relative });
      }
    }
    async match(request) { return this.entries.get(keyOf(request)); }
  }
  const prefix = 'dopa-drill-en-' + encodeURIComponent('/dopa-drill/') + '-';
  const unrelatedKey = 'dopa-drill-en-' + encodeURIComponent('/other-game/') + '-untouched';
  cachesByName.set(prefix + 'old-version', new Cache());
  const unrelated = new Cache();
  unrelated.entries.set(keyOf('./js/main.js'), { cached: 'wrong-project-version' });
  cachesByName.set(unrelatedKey, unrelated);
  let claimed = false;
  let networkCalls = 0;
  const caches = {
    open: async name => { if (!cachesByName.has(name)) cachesByName.set(name, new Cache()); return cachesByName.get(name); },
    keys: async () => [...cachesByName.keys()],
    delete: async name => cachesByName.delete(name),
    match: async request => { for (const cache of cachesByName.values()) { const hit = await cache.match(request); if (hit) return hit; } },
  };
  runInContext(code, createContext({ URL, Promise, caches,
    self: { registration: { scope: project }, location: { origin: new URL(project).origin },
      clients: { claim: async () => { claimed = true; } },
      addEventListener: (name, fn) => { handlers[name] = fn; } },
    fetch: async () => { networkCalls++; throw new Error('Simulated offline connection'); },
  }));
  let pending;
  handlers.install({ waitUntil: promise => { pending = promise; } }); await pending;
  handlers.activate({ waitUntil: promise => { pending = promise; } }); await pending;
  assert(claimed);
  assert(!cachesByName.has(prefix + 'old-version'));
  assert(cachesByName.has(unrelatedKey));
  const activeCache = [...cachesByName.entries()].find(([key]) => key.startsWith(prefix))[1];
  for (const required of ['./js/math-core.js', './wasm/dopa_core.wasm', './manifest.webmanifest']) {
    assert(activeCache.entries.has(keyOf(required)), `Missing critical offline asset: ${required}`);
  }
  const routes = [
    ['', 'navigate', './'], ['?seed=2026', 'navigate', './'], ['index.html', 'navigate', './'],
    ['LICENSE.txt', 'navigate', './LICENSE.txt'], ['js/main.js', 'cors', './js/main.js'],
    ['wasm/dopa_core.wasm', 'cors', './wasm/dopa_core.wasm'], ['icons/icon-192.png', 'cors', './icons/icon-192.png'],
  ];
  for (const [path, mode, expected] of routes) {
    let response;
    handlers.fetch({ request: { method: 'GET', url: project + path, mode }, respondWith: promise => { response = promise; } });
    assert(response, `Route was not intercepted: ${path}`);
    assert.equal((await response).cached, expected);
  }
  for (const url of ['https://example.net/file.js', 'https://example.github.io/other-game/js/main.js']) {
    let intercepted = false;
    handlers.fetch({ request: { method: 'GET', url, mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert(!intercepted, `Request escaped project scope: ${url}`);
  }
  let postIntercepted = false;
  handlers.fetch({ request: { method: 'POST', url: project, mode: 'navigate' }, respondWith: () => { postIntercepted = true; } });
  assert(!postIntercepted);
  assert.equal(networkCalls, 0);
});
