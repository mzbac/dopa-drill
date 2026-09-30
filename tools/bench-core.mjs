// Reproducible development benchmark. No thresholds and no performance promise.
// Baseline fixture is upstream MIT source retained only for regression measurement.
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {initCore,checkDigit,extraTotal,basicDopaL,coreCall} from '../app/js/math-core.js';
import {makeRng,makeProblem} from '../app/js/problems.js';
import {SKILLS} from '../app/js/skills.js';
const bytes=await readFile(new URL('../app/wasm/dopa_core.wasm',import.meta.url));
const start=performance.now();await initCore(bytes);const initMs=performance.now()-start;
const source=(await readFile(new URL('../tests/fixtures/original-problems.js.txt',import.meta.url),'utf8'))
  .replace("'./skills.js'",JSON.stringify(new URL('../app/js/skills.js',import.meta.url).href));
const js=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let checksum=0;
function measure(label,fn,count=29000){
  for(let i=0;i<Math.min(count,2900);i++)checksum+=fn(i)||0;
  const samples=[];
  for(let run=0;run<5;run++){const t=performance.now();for(let i=0;i<count;i++)checksum+=fn(i)||0;samples.push(performance.now()-t)}
  samples.sort((a,b)=>a-b);return {label,iterations:count,medianMs:+samples[2].toFixed(3),microsecondsPerOperation:+(samples[2]*1000/count).toFixed(3)};
}
let rngA=makeRng(2026),rngB=js.makeRng(2026);
const rows=[
 measure('JavaScript upstream generation + grid layout',i=>js.makeProblem(SKILLS[i%58].id,rngB).steps.length),
 measure('Rust/WASM generation + JSON bridge + JS grid layout',i=>makeProblem(SKILLS[i%58].id,rngA).steps.length),
 measure('JavaScript scoring curve',i=>2.3*Math.min(1,Math.max(0,(i%101)/100))**1.15,500000),
 measure('Rust/WASM scoring curve (raw numeric ABI)',i=>basicDopaL((i%101)/100),500000),
 measure('Rust/WASM digit validation (bridge included)',i=>Number(checkDigit(i%10,i%10)),500000),
 measure('Rust/WASM full daily quest planning',i=>coreCall('dailyQuests',{day:`2026-09-${String(i%30+1).padStart(2,'0')}`,ctx:{count:10,review:3,hasNew:true,hasLearning:true,placed:true,extraOk:true,avgCells:2.5}}).length,10000),
];
const report={platform:`${os.platform()} ${os.arch()}`,node:process.version,cpu:os.cpus()[0]?.model,wasmBytes:bytes.length,wasmGzipBytes:gzipSync(bytes).length,initMs:+initMs.toFixed(3),method:'5 measured runs after warm-up, median wall time. Shared Linux host/Node, not an iPad. Values include the costs named in each label.',results:rows,checksum};
console.log(JSON.stringify(report,null,2));
if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2)+'\n');
