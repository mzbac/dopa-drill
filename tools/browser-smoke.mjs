import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/dopa-drill/';
let server;
if (!process.env.TEST_BASE_URL) {
  server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: 'inherit' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
await mkdir('qa', { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 375, height: 667 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      localStorage.setItem('dopa-drill:v1', JSON.stringify({version:1,guideSeen:true,settings:{count:6,sound:false,volume:0,motion:0},history:[],bonus:{last:day,run:1,stickers:{},total:1}}));
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__dopa?.getCoreStatus().ready);
    await page.locator('[data-grade="1"]').click();
    await page.waitForFunction(() => window.__dopa.S.ready);
    await page.screenshot({ path: `qa/play-${viewport.width}x${viewport.height}.png` });
    const layout = await page.locator('#pad button').evaluateAll(buttons => buttons.map(button => { const r=button.getBoundingClientRect();return {key:button.dataset.key,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; }));
    for (const key of layout) {
      assert(key.width >= 44 && key.height >= 44, `Small touch key: ${JSON.stringify(key)}`);
      assert(key.left >= 0 && key.right <= viewport.width + 1, `Offscreen horizontal key: ${JSON.stringify(key)}`);
      if (viewport.width >= 768) assert(key.top >= 0 && key.bottom <= viewport.height + 1, `Offscreen iPad key: ${JSON.stringify(key)}`);
    }
    const expected = await page.evaluate(() => window.__dopa.S.problem.steps[window.__dopa.S.step].digit);
    const wrong = String((Number(expected) + 1) % 10);
    await page.locator(`[data-key="${wrong}"]`).click();
    assert.equal(await page.evaluate(() => window.__dopa.S.misses), 1);
    await page.locator('[data-key="Backspace"]').click();
    assert.equal(await page.evaluate(() => window.__dopa.S.shownWrong), null);
    await page.locator(`[data-key="${expected}"]`).click();
    await page.locator('#play-home').click();
    assert(await page.locator('#confirm').isVisible());
    await page.locator('#confirm-no').click();
    assert.equal(await page.evaluate(() => window.__dopa.S.screen), 'play');
    if (viewport.width === 768) {
      for (let i=0; i<100; i++) {
        await page.waitForFunction(() => window.__dopa.S.ready || window.__dopa.S.screen === 'result');
        if (await page.evaluate(() => window.__dopa.S.screen === 'result')) break;
        const digit=await page.evaluate(()=>window.__dopa.S.problem.steps[window.__dopa.S.step].digit);
        await page.locator(`[data-key="${digit}"]`).click();
      }
      await page.waitForFunction(() => window.__dopa.S.screen === 'result');
      assert.equal(await page.evaluate(()=>window.__dopa.S.solved),6);
      await page.waitForFunction(()=>document.querySelector('#r-score').textContent === '100');
      await page.screenshot({path:'qa/result.png'});
    } else {
      await page.locator('#play-home').click(); await page.locator('#confirm-yes').click();
      assert.equal(await page.evaluate(()=>window.__dopa.S.screen),'title');
    }
    assert.deepEqual(errors,[],'No browser runtime errors');
    console.log(`PASS touch layout, input, retry and navigation at ${viewport.width}×${viewport.height}`);
    await context.close();
  }
  const offline = await browser.newContext({ viewport:{width:768,height:1024},hasTouch:true });
  const page = await offline.newPage();
  await page.goto(base);await page.waitForFunction(()=>window.__dopa?.getCoreStatus().ready);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller && window.__dopa?.getCoreStatus().ready);
  await offline.setOffline(true);await page.reload();await page.waitForFunction(()=>window.__dopa?.getCoreStatus().ready);
  await page.goto(new URL('LICENSE.txt',base).href);assert.match(await page.locator('body').innerText(),/MIT License/);
  console.log('PASS offline app shell, real WASM and license navigation');await offline.close();
} finally { await browser?.close();server?.kill(); }
