// Controlled browser comparison, separate from the native-touch smoke test.
// Synthetic event handler time is not physical tap latency or an iPad promise.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const BASELINE_COMMIT = '467be6948812ffbe21f8cf374bcbfbea7d1008c8';
const baseline = process.argv[2];
if (!baseline) throw new Error('Usage: node tools/bench-browser.mjs BASELINE_DIRECTORY [OUTPUT_JSON]');
const roots = [resolve(baseline), resolve(new URL('..', import.meta.url).pathname)];
const output = process.argv[3] || 'qa/browser-performance.json';
const samples = [];
const servers = [];
let browser;
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)];
const p95 = xs => [...xs].sort((a,b) => a-b)[Math.ceil(xs.length*.95)-1];
const fixtureNow = new Date();
const day = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = day(fixtureNow);

// Construct one populated, non-personal save and reuse its exact bytes on every
// navigation. Existing trophies prevent reward dialogs from interrupting timing.
const mod = name => import(pathToFileURL(`${roots[0]}/app/js/${name}.js`));
const { SKILLS } = await mod('skills');
const { TROPHIES } = await mod('trophies');
const { initCore } = await mod('math-core');
await initCore(await readFile(`${roots[0]}/app/wasm/dopa_core.wasm`));
const { emptyProgress } = await mod('session');
const progress = emptyProgress();
progress.placed = true;
for (const [i, skill] of SKILLS.entries()) {
  progress.skills[skill.id] = {
    mastered: i < 18, n: 25, hist: [1,0,1,1,1,1], stars: i < 18 ? 2 : 0,
    lastOk: fixtureNow.getTime(), masteredAt: fixtureNow.getTime(), recent: [],
    times: Array.from({length:30}, () => ({f:true,t:1500,c:3,d:today})),
  };
}
const fixture = JSON.stringify({version:1,guideSeen:true,
  settings:{count:6,sound:false,volume:0,motion:0},progress,
  history:Array.from({length:300}, (_,i) => {
    const d = new Date(fixtureNow); d.setDate(d.getDate()-Math.floor(i/10));
    return {id:`benchmark-${i}`,day:day(d),at:d.getTime(),mode:'grade',grade:1,score:100,ok:6,ng:0,timeMs:15000,dopaL:2};
  }),
  bonus:{last:today,run:1,stickers:{},total:1},
  trophies:{init:true,got:Object.fromEntries(TROPHIES.map(t => [t.id,fixtureNow.getTime()]))},
});

async function serve(root) {
  const app = resolve(root,'app');
  const mime = {'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.txt':'text/plain'};
  const server = createServer(async (req,res) => {
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (!path.startsWith('/dopa-drill/')) {res.writeHead(404).end();return;}
    const file = resolve(app,path.slice('/dopa-drill/'.length)||'index.html');
    if (!file.startsWith(app+'/')) {res.writeHead(403).end();return;}
    try {const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'public, max-age=3600'});res.end(bytes);}
    catch {res.writeHead(404).end();}
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}/dopa-drill/?seed=20260930`;
}

async function installFixture(context) {
  await context.addInitScript(({fixture}) => {
    if (!/^https?:$/.test(location.protocol)) return;
    localStorage.setItem('dopa-drill:v1',fixture);
    // App exposure at the end of main.js is later than engine-ready alone.
    // Record in-page times so Playwright transport/polling cannot inflate them.
    const started = performance.now();
    window.__browserBench = {started};
    function ready() {
      if (!window.__dopa?.startGame) {requestAnimationFrame(ready);return;}
      window.__browserBench.appReadyMs = performance.now();
      requestAnimationFrame(() => {window.__browserBench.followingFrameMs = performance.now();});
    }
    requestAnimationFrame(ready);
  },{fixture});
}

async function startup(page,reload=false) {
  if (reload) await page.reload();
  await page.waitForFunction(() => Number.isFinite(window.__browserBench?.followingFrameMs));
  return page.evaluate(() => ({
    readyMs:window.__browserBench.appReadyMs,
    followingFrameMs:window.__browserBench.followingFrameMs,
    navigationType:performance.getEntriesByType('navigation')[0].type,
  }));
}

async function action(page,selector,screen,kind='click') {
  return page.evaluate(async ({selector,screen,kind}) => {
    const button = document.querySelector(selector);
    if (!button) throw new Error(`Missing benchmark control: ${selector}`);
    // Tree work is deferred to rAF. Measure the callbacks directly scheduled by
    // this event separately from frame waiting; restore the API immediately.
    const originalFrame = window.requestAnimationFrame;
    let scheduledCallbackMs = 0;
    let scheduledCallbacks = 0;
    if (screen==='tree') window.requestAnimationFrame = callback => originalFrame.call(window,time => {
      const start = performance.now();
      try {callback(time);} finally {scheduledCallbackMs += performance.now()-start;scheduledCallbacks++;}
    });
    const t = performance.now();
    try {
      if (kind === 'pointerdown') button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true}));
      else button.click();
    } finally {window.requestAnimationFrame = originalFrame;}
    const handlerMs = performance.now()-t;
    // The next animation-frame callback executes after renderTree's callback.
    await new Promise(resolve => requestAnimationFrame(resolve));
    const firstFrameMs = performance.now()-t;
    if (window.__dopa.S.screen !== screen) throw new Error(`Expected ${screen}, got ${window.__dopa.S.screen}`);
    if (screen==='tree' && document.querySelectorAll('#tree .node').length!==58) throw new Error('Tree did not render all58 skills');
    await new Promise(resolve => requestAnimationFrame(resolve));
    return {handlerMs,scheduledCallbackMs,scheduledCallbacks,firstFrameMs,followingFrameMs:performance.now()-t};
  },{selector,screen,kind});
}

async function measureVariant(index,url,round) {
  const context = await browser.newContext({viewport:{width:768,height:1024},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  await installFixture(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  try {
    await page.goto(url);
    const fresh = await startup(page);
    const warm = await startup(page,true);
    // One untimed navigation pair warms UI functions without changing progress.
    await action(page,'#open-tree','tree');await action(page,'#tree-back','title');
    const trees = [];const titles = [];
    for(let i=0;i<4;i++) {
      trees.push(await action(page,'#open-tree','tree'));
      titles.push(await action(page,'#tree-back','title'));
    }
    const grade = await action(page,'[data-grade="1"]','play');
    await page.waitForFunction(() => window.__dopa.S.ready);
    const before = await page.evaluate(() => {
      const {S} = window.__dopa;
      return {digits:S.digitsDone,solved:S.solved,skill:S.problem.skill,answer:S.problem.answer,steps:S.problem.steps.map(s=>s.digit)};
    });
    assert.equal(before.steps.length,1,'First seeded question must complete on one input to exercise progress/quests');
    const input = await action(page,`[data-key="${before.steps[0]}"]`,'play','pointerdown');
    const after = await page.evaluate(() => ({digits:window.__dopa.S.digitsDone,solved:window.__dopa.S.solved}));
    assert.equal(after.digits,before.digits+1);assert.equal(after.solved,before.solved+1);
    assert.deepEqual(errors,[]);
    console.log(`Browser benchmark ${round ? `sample ${round}` : 'warm-up'}: ${index?'optimized':'baseline'}`);
    return {variant:index?'optimized':'baseline',round,fresh,warm,trees,titles,grade,input,question:before};
  } finally {await context.close();}
}

try {
  const urls = [];
  for(const root of roots) urls.push(await serve(root));
  browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  // Discard the first complete pair; alternate ordering of the five real pairs.
  for(let round=0;round<=5;round++) for(const index of round%2?[1,0]:[0,1]) {
    const sample = await measureVariant(index,urls[index],round);
    if(round) samples.push(sample);
  }
  for(let round=1;round<=5;round++) {
    const pair=samples.filter(s=>s.round===round);
    assert.deepEqual(pair[0].question,pair[1].question,`Both variants must enter the same seeded question in round ${round}`);
  }
  const fields = [
    ['Fresh-context startup, app-ready frame',s=>[s.fresh.readyMs]],
    ['Warm reload, app-ready frame',s=>[s.warm.readyMs]],
    ['Skill tree, directly scheduled render/layout callbacks',s=>s.trees.map(x=>x.scheduledCallbackMs)],
    ['Skill tree, through render animation frame',s=>s.trees.map(x=>x.firstFrameMs)],
    ['Return to title, synchronous click handler',s=>s.titles.map(x=>x.handlerMs)],
    ['Return to title, through following frame',s=>s.titles.map(x=>x.followingFrameMs)],
    ['Start Grade1, synchronous click handler',s=>[s.grade.handlerMs]],
    ['First correct answer, synchronous pointer handler',s=>[s.input.handlerMs]],
    ['First correct answer, through following frame',s=>[s.input.followingFrameMs]],
  ];
  const results = fields.map(([label,get]) => {
    const values = ['baseline','optimized'].map(variant=>samples.filter(s=>s.variant===variant).flatMap(get));
    const medians = values.map(median);
    return {label,samplesPerVariant:values[0].length,baselineMedianMs:medians[0],optimizedMedianMs:medians[1],baselineP95Ms:p95(values[0]),optimizedP95Ms:p95(values[1]),reductionPercent:(1-medians[1]/medians[0])*100};
  });
  const wasm = [];
  for(const root of roots) wasm.push(createHash('sha256').update(await readFile(`${root}/app/wasm/dopa_core.wasm`)).digest('hex'));
  const report = {measuredAt:new Date().toISOString(),baselineCommit:BASELINE_COMMIT,optimizedCommit:process.env.GITHUB_SHA||null,browser:await browser.version(),viewport:{width:768,height:1024},fixtureBytes:Buffer.byteLength(fixture),fixtureSha256:createHash('sha256').update(fixture).digest('hex'),wasmSha256:{baseline:wasm[0],optimized:wasm[1]},method:'One Chromium process; loopback HTTP; service workers disabled; identical populated synthetic save reset on each navigation; silent reduced motion; one discarded warm-up pair then five alternating baseline/optimized pairs. Four tree/title pairs per sample. Fresh context is not a cold browser process. Warm reload uses HTTP cache and warm browser compilation. Times use in-page performance.now; event dispatch is synthetic and excludes Playwright transport. Tree callback time wraps only rAF callbacks synchronously scheduled by its click; it excludes frame waiting and later callbacks. Frame times include scheduler/render opportunity, not guaranteed physical paint. No iPad/Safari, real-network, battery, or native touch-latency claim. p95 is descriptive and sparse for five startup/input samples. No pass/fail speed threshold.',results,samples};
  await mkdir(resolve(output,'..'),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({method:report.method,results},null,2));
  if(process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['## Browser performance comparison','',report.method,'','| Operation | Baseline median ms | Optimized median ms | Change |','|---|---:|---:|---:|',...results.map(r=>`| ${r.label} | ${r.baselineMedianMs.toFixed(3)} | ${r.optimizedMedianMs.toFixed(3)} | ${r.reductionPercent.toFixed(1)}% less time |`),'','Raw samples and hashes are in the browser-performance artifact.',''];
    await appendFile(process.env.GITHUB_STEP_SUMMARY,lines.join('\n'));
  }
} finally {
  if(browser) await browser.close();
  for(const server of servers) await new Promise(resolve=>server.close(resolve));
}
