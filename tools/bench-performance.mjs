// Same-runtime before/after comparison. Pass an untouched baseline checkout.
// No timing thresholds: shared-host wall time is evidence, not a device promise.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const baseline = process.argv[2];
if (!baseline) throw new Error('Usage: node tools/bench-performance.mjs BASELINE_CHECKOUT [results.json]');
const roots = [resolve(baseline), fileURLToPath(new URL('..', import.meta.url))];
const now = performance.now.bind(performance);
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const engines = [];
for (const [index, root] of roots.entries()) {
  const mod = name => import(pathToFileURL(`${root}/app/js/${name}.js`));
  const core = await mod('math-core');
  const problems = await mod('problems');
  const session = await mod('session');
  const { SKILLS } = await mod('skills');
  const bytes = await readFile(`${root}/app/wasm/dopa_core.wasm`);
  await core.initCore(bytes);
  // Fresh Node processes separate first compile/instantiate from warm throughput.
  const coldInitMs = Array.from({ length: 7 }, () => Number(execFileSync(process.execPath, ['--input-type=module', '-e', `import{readFileSync}from'node:fs';import{performance}from'node:perf_hooks';const b=readFileSync(process.argv[1]);const t=performance.now();await WebAssembly.instantiate(b,{});process.stdout.write(String(performance.now()-t))`, `${root}/app/wasm/dopa_core.wasm`], {encoding:'utf8'})));
  const prog = session.emptyProgress();
  // Same populated progress for both sides, including retained histories.
  SKILLS.forEach((skill, i) => { prog.skills[skill.id] = { mastered:i%3===0,n:i%7,hist:[1,0,1,1,1],stars:i%5,lastOk:1750000000000,times:Array.from({length:30},()=>({f:true,t:1500,c:3,d:'2026-09-01'})) }; });
  engines.push({core,problems,session,SKILLS,prog,info:{label:index?'optimized':'baseline',wasmSha256:createHash('sha256').update(bytes).digest('hex'),wasmBytes:bytes.length,wasmGzipBytes:gzipSync(bytes).length,coldInitMs,coldInitMedianMs:median(coldInitMs)}});
}
const workloads = [
  { label:'Full question: Rust generation, bridge and English JS grid',iterations:11600,setup: e => {const rng=e.problems.makeRng(2026);return i=>e.problems.makeProblem(e.SKILLS[i%58].id,rng).steps.length} },
  { label:'Complete daily-quest planning and bridge',iterations:4000,setup:e=>i=>e.core.coreCall('dailyQuests',{day:`2026-09-${String(i%30+1).padStart(2,'0')}`,ctx:{count:10,review:3,hasNew:true,hasLearning:true,placed:true,extraOk:true,avgCells:2.5}}).length },
  { label:'All 58 skill views: state, stars and mastery ratio',iterations:500,setup:e=>()=>{if(e.session.skillViews){const views=e.session.skillViews(e.prog);return Object.values(views).reduce((n,v)=>n+v.stars+v.ratio,0)}return e.SKILLS.reduce((n,s)=>n+e.session.starsOf(e.prog,s.id)+e.session.masteryRatio(e.prog,s.id)+e.session.stateOf(e.prog,s.id).length*0,0)} },
];
let checksum=0;
function run(e,w){const fn=w.setup(e);const t=now();for(let i=0;i<w.iterations;i++)checksum+=fn(i);return (now()-t)*1000/w.iterations;}
const results=[];
for (const w of workloads) {
  // Full identical sequence per run; both implementations receive the same RNG.
  for(let i=0;i<3;i++) for(const e of engines)run(e,w);
  const samples=[[],[]];
  for(let round=0;round<9;round++)for(const index of round%2?[1,0]:[0,1])samples[index].push(run(engines[index],w));
  const medians=samples.map(median);
  results.push({label:w.label,iterationsPerRun:w.iterations,runs:9,baselineMicroseconds:medians[0],optimizedMicroseconds:medians[1],reductionPercent:(1-medians[1]/medians[0])*100,samplesMicroseconds:samples});
}
const report={measuredAt:new Date().toISOString(),baselineCommit:'467be6948812ffbe21f8cf374bcbfbea7d1008c8',platform:`${os.platform()} ${os.arch()}`,node:process.version,cpu:os.cpus()[0]?.model,method:'Same Node process, separate WASM instances and JS modules, identical seeds and state. Three full warm-up passes then nine alternating-order timed samples. Fresh-process initialization separately measured seven times, excludes file I/O and network. Shared Linux host, not an iPad.',engines:engines.map(e=>e.info),results,checksum};
console.log(JSON.stringify(report,null,2));
if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');
