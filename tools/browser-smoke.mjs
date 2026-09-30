// Disposable-browser integration coverage. Chromium touch emulation is not a
// substitute for a physical iPad/Safari test; CI publishes screenshots on fail.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/dopa-drill/';
const playUrl = new URL(base);
playUrl.searchParams.set('seed', '20260930');
playUrl.searchParams.set('extra', '2'); // Existing QA parameter; production default is 90 s.
let server;
let browser;
const sourceScript = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

async function seedFreshContext(context) {
  await context.addInitScript(() => {
    if (!/^https?:$/.test(location.protocol)) return;
    // Never overwrite a saved round on reload: persistence is part of this test.
    if (localStorage.getItem('dopa-drill:v1')) return;
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('dopa-drill:v1', JSON.stringify({ version: 1, guideSeen: true,
      settings: { count: 6, sound: false, volume: 0, motion: 0 }, history: [],
      bonus: { last: day, run: 1, stickers: {}, total: 1 } }));
  });
}
async function newGamePage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Earned reward dialogs are real gameplay. Close them through their controls
  // if they appear while another test action is waiting, rather than racing timers.
  await page.addLocatorHandler(page.locator('#trophy-got:visible'), async () => {
    await page.locator('#tg-ok').tap();
  });
  await page.addLocatorHandler(page.locator('#bonus:visible'), async () => {
    await page.locator('#bonus-ok').tap();
  });
  return { page, errors };
}
async function ready(page) {
  await page.waitForFunction(() => window.__dopa?.getCoreStatus().ready);
  assert.match(await page.locator('#engine-status').textContent(), /Rust.*WebAssembly/);
}
async function english(page) {
  assert.doesNotMatch(await page.locator('body').innerText(), sourceScript);
  const labels = await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')).join('\n'));
  assert.doesNotMatch(labels, sourceScript);
}
async function solveBasic(page) {
  for (let inputs = 0; inputs < 120; inputs++) {
    await page.waitForFunction(() => window.__dopa.S.ready || window.__dopa.S.screen === 'result');
    if (await page.evaluate(() => window.__dopa.S.screen === 'result')) return;
    const digit = await page.evaluate(() => window.__dopa.S.problem.steps[window.__dopa.S.step].digit);
    await page.locator(`[data-key="${digit}"]`).tap();
  }
  throw new Error('Basic round did not finish within 120 accepted input attempts');
}
async function testTitlePages(page) {
  await page.locator('#open-settings').tap();
  assert(await page.locator('#settings').isVisible());
  await english(page);
  await page.locator('[data-count="14"]').tap();
  assert.equal(await page.locator('[data-count="14"]').getAttribute('aria-checked'), 'true');
  await page.locator('[data-count="6"]').tap();
  await page.locator('#close-settings').tap();
  assert(!(await page.locator('#settings').isVisible()));
  await page.locator('#open-collect').tap();
  await page.waitForFunction(() => window.__dopa.S.screen === 'collect');
  await english(page);
  await page.locator('#collect-back').tap();
  await page.locator('#open-trophy').tap();
  await page.waitForFunction(() => window.__dopa.S.screen === 'trophy');
  await english(page);
  await page.locator('#trophy-back').tap();
  await page.locator('#open-tree').tap();
  await page.waitForFunction(() => window.__dopa.S.screen === 'tree');
  await english(page);
  await page.locator('#tree-back').tap();
  await page.locator('#open-guide').tap();
  await page.locator('#guide').waitFor({ state: 'visible' });
  for (let step = 0; step < 10; step++) {
    await page.locator('#guide[data-ready="true"]').waitFor({ state: 'visible' });
    await english(page);
    const finalStep = (await page.locator('#guide-next').innerText()).includes('play');
    await page.locator('#guide-next').tap();
    if (finalStep) break;
  }
  await page.locator('#guide').waitFor({ state: 'hidden' });
}

try {
  if (!process.env.TEST_BASE_URL) {
    server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'inherit' });
    let listening = false;
    for (let i = 0; i < 50; i++) {
      if (server.exitCode !== null) throw new Error(`Preview server exited with ${server.exitCode}`);
      try { if ((await fetch(base)).ok) { listening = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(listening, `Preview server never became ready at ${base}`);
  }
  await mkdir('qa', { recursive: true });
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const viewport of [
    { width: 768, height: 1024 }, { width: 768, height: 900 },
    { width: 1024, height: 768 }, { width: 375, height: 667 },
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: 'block' });
    await seedFreshContext(context);
    const { page, errors } = await newGamePage(context);
    await page.goto(playUrl.href); await ready(page);
    if (viewport.width === 768 && viewport.height === 1024) await testTitlePages(page);
    await page.locator('[data-grade="1"]').tap();
    await page.waitForFunction(() => window.__dopa.S.ready);
    await english(page);
    await page.screenshot({ path: `qa/play-${viewport.width}x${viewport.height}.png` });
    const layout = await page.locator('#pad button').evaluateAll(buttons => buttons.map(button => {
      const r = button.getBoundingClientRect();
      return { key: button.dataset.key, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    }));
    for (const key of layout) {
      assert(key.width >= 44 && key.height >= 44, `Small touch key: ${JSON.stringify(key)}`);
      assert(key.left >= 0 && key.right <= viewport.width + 1, `Offscreen horizontal key: ${JSON.stringify(key)}`);
      if (viewport.width >= 768) assert(key.top >= 0 && key.bottom <= viewport.height + 1, `Offscreen iPad key: ${JSON.stringify(key)}`);
    }
    const expected = await page.evaluate(() => window.__dopa.S.problem.steps[window.__dopa.S.step].digit);
    const wrong = String((Number(expected) + 1) % 10);
    await page.locator(`[data-key="${wrong}"]`).tap();
    assert.equal(await page.evaluate(() => window.__dopa.S.misses), 1);
    await page.locator('[data-key="Backspace"]').tap();
    assert.equal(await page.evaluate(() => window.__dopa.S.shownWrong), null);
    await page.locator(`[data-key="${expected}"]`).tap();
    await page.locator('#play-home').tap();
    assert(await page.locator('#confirm').isVisible());
    await page.locator('#confirm-no').tap();
    assert.equal(await page.evaluate(() => window.__dopa.S.screen), 'play');
    if (viewport.width === 768 && viewport.height === 1024) {
      await solveBasic(page);
      assert.equal(await page.evaluate(() => window.__dopa.S.solved), 6);
      await page.waitForFunction(() => document.querySelector('#r-score').textContent === '100');
      await english(page);
      await page.screenshot({ path: 'qa/result.png' });
      // One mistaken question out of six still unlocks the extra round (5/6).
      assert(await page.locator('#go-extra').isVisible());
      await page.locator('#go-extra').tap();
      await page.waitForFunction(() => window.__dopa.S.mode === 'extra' && window.__dopa.S.ready);
      for (let inputs = 0; inputs < 80; inputs++) {
        await page.waitForFunction(() => window.__dopa.S.ready || window.__dopa.S.extra.over || window.__dopa.S.screen === 'final');
        if (await page.evaluate(() => window.__dopa.S.extra.over || window.__dopa.S.screen === 'final')) break;
        const digit = await page.evaluate(() => window.__dopa.S.problem.steps[window.__dopa.S.step].digit);
        await page.locator(`[data-key="${digit}"]`).tap();
      }
      await page.waitForFunction(() => window.__dopa.S.screen === 'final');
      const extra = await page.evaluate(() => ({ n: window.__dopa.S.extra.solved, score: window.__dopa.S.extra.score }));
      assert.equal(extra.score, 10 * extra.n + 5 * extra.n * (extra.n - 1) / 2);
      assert.equal(Number((await page.locator('#f-score').innerText()).replaceAll(',', '')), 100 + extra.score);
      await english(page);
      await page.screenshot({ path: 'qa/final.png' });
      await page.locator('#again').tap();
      await page.waitForFunction(() => window.__dopa.S.screen === 'title');
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dopa-drill:v1')));
      assert.equal(stored.history.length, 1);
      assert.equal(stored.history[0].score, 100 + extra.score);
      await page.reload(); await ready(page);
      const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('dopa-drill:v1')));
      assert.deepEqual(restored.history, stored.history);
      assert.equal(restored.settings.count, 6);
      await page.locator('[data-grade="1"]').tap();
      await page.waitForFunction(() => window.__dopa.S.ready);
      assert.deepEqual(await page.evaluate(() => ({ solved: window.__dopa.S.solved, misses: window.__dopa.S.misses, step: window.__dopa.S.step, question: window.__dopa.S.qi })), { solved: 0, misses: 0, step: 0, question: 0 });
    }
    await page.locator('#play-home').tap(); await page.locator('#confirm-yes').tap();
    await page.waitForFunction(() => window.__dopa.S.screen === 'title');
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(`PASS touch layout, input, retry, and navigation at ${viewport.width}×${viewport.height}`);
    await context.close();
  }
  // Real service worker, separate disposable origin storage, and forced offline.
  const offline = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  await seedFreshContext(offline);
  const { page, errors } = await newGamePage(offline);
  await page.goto(playUrl.href); await ready(page);
  try {
    await page.waitForFunction(async baseUrl => {
      const registration = await navigator.serviceWorker.getRegistration(baseUrl);
      return registration?.active?.state === 'activated' && registration.scope === new URL('./', baseUrl).href;
    }, base, { timeout: 30_000 });
  } catch (error) {
    throw new Error('Offline service worker did not activate at the project scope within 30 seconds', { cause: error });
  }
  await page.reload(); await ready(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await offline.setOffline(true);
  await page.reload(); await ready(page);
  await page.locator('[data-grade="1"]').tap();
  await page.waitForFunction(() => window.__dopa.S.ready);
  const offlineDigit = await page.evaluate(() => window.__dopa.S.problem.steps[window.__dopa.S.step].digit);
  await page.locator(`[data-key="${offlineDigit}"]`).tap();
  assert.equal(await page.evaluate(() => window.__dopa.S.digitsDone), 1);
  await page.locator('#play-home').tap(); await page.locator('#confirm-yes').tap();
  await page.goto(new URL('LICENSE.txt', base).href);
  assert.match(await page.locator('body').innerText(), /MIT License/);
  assert.deepEqual(errors, [], 'No offline runtime errors');
  console.log('PASS offline app shell, real WASM input, and license navigation');
  await offline.close();

  const failureContext = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, serviceWorkers: 'block' });
  await seedFreshContext(failureContext);
  const failurePage = await failureContext.newPage();
  await failurePage.route('**/wasm/dopa_core.wasm', route => route.abort());
  await failurePage.goto(playUrl.href);
  await failurePage.locator('#engine-retry').waitFor({ state: 'visible' });
  assert.match(await failurePage.locator('#engine-message').innerText(), /could not load/i);
  await failurePage.unroute('**/wasm/dopa_core.wasm');
  await failurePage.locator('#engine-retry').tap();
  await ready(failurePage);
  assert(!(await failurePage.locator('#engine-loading').isVisible()));
  console.log('PASS engine download failure and retry recovery');
  await failureContext.close();
} catch (error) {
  let screenshot = 0;
  for (const context of browser?.contexts() || []) {
    for (const page of context.pages()) {
      try {
        await page.screenshot({ path: `qa/failure-${++screenshot}.png`, fullPage: true, timeout: 5_000 });
      } catch { /* Preserve the original failure even if a page has closed. */ }
    }
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill();
}
