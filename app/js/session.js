// Rust owns learning rules. JS adapts saved objects and formats the skill tree.
import { SKILLS, SKILL, DEPTH, LANES } from './skills.js';
import { makeProblem, signature } from './problems.js';
import { comboWindowMs } from './scoring.js';
import { daysBetween } from './growth.js';
import { coreCall, syncInto, baseMs } from './math-core.js';
export { baseMs };
const LANES_N = LANES.length;
// Static curriculum order also feeds visual tree layout before WASM is ready.
export const ORDER = SKILLS.slice().sort((a,b) => DEPTH[a.id]-DEPTH[b.id] || a.grade-b.grade || SKILLS.indexOf(a)-SKILLS.indexOf(b)).map(s=>s.id);
export const PLACEMENT = SKILLS.slice().sort((a,b) => a.grade-b.grade || DEPTH[a.id]-DEPTH[b.id]).map(s=>s.id);

// Skill-tree layout: each lane gets SUB columns and skills are placed grade
// by grade, so the tree reads top-down by school year. Grades 5-6 all sit
// below every grade 1-4 skill, after a blank row. Each skill takes the cheapest
// free cell at or up to two rows below its prerequisites: going lower costs 3
// per row, a same-column link passing behind another node 3 (so a slight
// overlap may be kept instead of dropping far down; the renderer detours
// it), leaving its chain's column 1.5 (add / multiply / decimal on the left,
// subtract / divide / fraction on the right), each column away from a
// prerequisite 1.
export const TREE_SUB = 2;
export const TREE_UPPER = 5;
const RIGHT_GENS = new Set(['hsub', 'vsub', 'div', 'divRem', 'divTens', 'vdiv', 'fracOf', 'frac', 'gcdlcm', 'ratio', 'letter']);
const prefSub = (sk) => (RIGHT_GENS.has(sk.gen[0]) ? 1 : 0);
export const TREE_LAYOUT = (() => {
  const row = {}; const col = {}; const occ = new Set();
  const key = (c, r) => `${c}:${r}`;
  const behind = (c, r0, r1) => { for (let r = r0 + 1; r < r1; r++) if (occ.has(key(c, r))) return true; return false; };
  let floor = 0;
  for (const id of PLACEMENT) {
    const sk = SKILL[id];
    if (sk.grade >= TREE_UPPER && !floor) floor = Math.max(0, ...Object.values(row)) + 2;
    const base = Math.max(sk.req.length ? Math.max(...sk.req.map((q) => row[q])) + 1 : 0, sk.grade >= TREE_UPPER ? floor : 0);
    let best = null;
    for (let r = base; !(best && r > base + 2); r++) {
      for (let k = 0; k < TREE_SUB; k++) {
        const c = sk.lane * TREE_SUB + k;
        if (occ.has(key(c, r))) continue;
        const cost = 3 * (r - base)
          + 3 * sk.req.filter((q) => col[q] === c && behind(c, row[q], r)).length
          + (k === prefSub(sk) ? 0 : 1.5)
          + sk.req.reduce((a, q) => a + Math.abs(col[q] - c), 0);
        if (!best || cost < best.cost) best = { c, r, cost };
      }
    }
    row[id] = best.r; col[id] = best.c; occ.add(key(best.c, best.r));
  }
  return { row, col, rows: Math.max(...Object.values(row)) + 1, cols: LANES_N * TREE_SUB };
})();

export const TIMES_MAX = 30;
export const FIRST_MAX = 3;
export const DAYS_MAX = 60;
export const RUST = { days: 21, max: 3 };
export const STAR_MAX = 5;
export const STAR_RULE = { accN: 20, acc: 0.9, speedN: 10, speedMin: 5, gapDays: 7, holdRun: 3, topN: 20, top: 0.95, topSpeed: 0.6 };
export const CAPSULE = { days: 30 };
// Project only required saved fields for small read-only queries. Histories and
// stored problem grids never cross the ABI while rendering each tree node.
const view = (prog, fields, ids = Object.keys(prog.skills)) => ({ skills: Object.fromEntries(ids.filter(id=>prog.skills[id]).map(id=>[id,Object.fromEntries(fields.filter(key=>key in prog.skills[id]).map(key=>[key,prog.skills[id][key]]))])) });
export const emptyProgress = () => coreCall('emptyProgress');
export const isMastered = (prog,id) => coreCall('isMastered',{prog:view(prog,['mastered'],[id]),id});
export const isUnlocked = (prog,id) => coreCall('isUnlocked',{prog:view(prog,['mastered'],SKILL[id].req),id});
export const stateOf = (prog,id) => coreCall('stateOf',{prog:view(prog,['mastered','n'],[id,...SKILL[id].req]),id});
// Read all 58 display states in one call. This returns a detached snapshot:
// callers reuse it only within a synchronous render, never as a persistent cache.
export const skillViews = (prog) => coreCall('skillViews',{prog:view(prog,['mastered','n','hist','stars'],SKILLS.map(skill=>skill.id))});
export const masteryRatio = (prog,id) => coreCall('masteryRatio',{prog:view(prog,['mastered','hist'],[id]),id});
export const rustyOf = (prog,now=Date.now()) => coreCall('rustyOf',{prog:view(prog,['mastered','lastOk','grantedAt','masteredAt']),now});
export const starsOf = (prog,id) => coreCall('starsOf',{prog:view(prog,['mastered','stars'],[id]),id});
export const frontier = (prog) => coreCall('frontier',{prog:view(prog,['mastered'])});
export const dependents = (id) => coreCall('dependents',{id});
export const relockTargets = (prog,id) => coreCall('relockTargets',{prog,id});
export function masterWithAncestors(prog,id,at=Date.now()) {
  syncInto(prog, coreCall('masterWithAncestors',{prog,id,at}));
}
export function recordResult(prog,id,firstTry,sig,info={}) {
  const out=coreCall('recordResult',{prog,id,firstTry,sig,info:{...info,at:info.at??Date.now()}});
  syncInto(prog,out.prog); return out.result;
}
export function updateStars(record,grade,day) {
  const out=coreCall('updateStars',{record,grade,day}); syncInto(record,out.record); return out.result;
}
export function relockSkill(prog,id) {
  const out=coreCall('relockSkill',{prog,id}); syncInto(prog,out.prog); return out.result;
}
export const pickCapsule = (prog,now=Date.now()) => coreCall('pickCapsule',{prog,now});
export function useCapsule(prog,skill,index,at=Date.now()) {
  const out=coreCall('useCapsule',{prog,id:skill,index,at}); syncInto(prog,out.prog); return out.result;
}
export function gradePlan(grade,N,rng) {
  const out=coreCall('gradePlan',{grade,n:N,random:Array.from({length:N},()=>rng())});
  return { mode:'grade',grade,basic:out.basic,extra:(k)=>k<out.extra.length?out.extra[k]:out.extraCycle[(k-out.extra.length)%out.extraCycle.length] };
}
export function levelPlan(prog,N,rng,now=Date.now()) {
  if (!prog.placed) return placementPlan(prog,N);
  const planProg={...view(prog,['mastered','lastOk','grantedAt','masteredAt']),placed:prog.placed};
  const args={prog:planProg,n:N,random:[],now};
  const probe=coreCall('levelPlan',args);
  const out=probe.randomUsed ? coreCall('levelPlan',{...args,random:Array.from({length:probe.randomUsed},()=>rng())}) : probe;
  return {mode:'level',basic:out.basic,extra:(k)=>out.extra[k%out.extra.length]};
}
export function placementPlan(prog,N) {
  const walk={p:0,jump:6,lastOk:-1};
  return {mode:'level',placement:true,walk,basic:Array.from({length:N},()=>null),
    pick:()=>PLACEMENT[Math.min(PLACEMENT.length-1,walk.p)],
    answer(firstTry){const out=coreCall('placementStep',{prog,walk,firstTry,at:Date.now()});syncInto(prog,out.prog);syncInto(walk,out.walk);},
    extra(){const ids=frontier(prog);return ids.length?ids[0]:PLACEMENT[walk.p];}};
}
export function reviewPlan(items) { return {mode:'review',basic:items.map(item=>item.skill||null),items}; }
export function problemFor(prog,skillId,rng) { return makeProblem(skillId,rng,new Set(prog.skills[skillId]?.recent||[])); }
export { signature };

// Presentation-only progress descriptions. Star eligibility is decided by Rust.
const median = (xs) => { const a=xs.slice().sort((x,y)=>x-y);const n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):Infinity; };
const rate = (list) => list.length?list.filter(e=>e.f).length/list.length:0;
const speedOf = (list,grade) => median(list.filter(e=>e.f).map(e=>e.t/baseMs(grade,e.c)));
// What the next star asks for, with the child's current numbers (for the tree).
export function nextStar(prog, id, today = null) {
  const r = prog.skills[id];
  const grade = SKILL[id].grade;
  const s = starsOf(prog, id);
  if (!r || !r.mastered || s >= STAR_MAX) return null;
  const R = STAR_RULE;
  const times = r.times || [];
  const cells = times.length ? Math.round(times.slice(-10).reduce((a, e) => a + e.c, 0) / Math.min(10, times.length)) : 1;
  const sec = (k) => Math.round((baseMs(grade, cells) * k) / 100) / 10;
  const pct = (l) => Math.round(rate(l) * 100);
  const cur = (l) => { const v = speedOf(l, grade); return Number.isFinite(v) ? Math.round((v * baseMs(grade, cells)) / 100) / 10 : null; };
  const n = s + 1;
  if (n === 2) { const l = times.slice(-R.accN); return { n, text: `Get at least ${R.acc * 100}% right on your first try over your last ${R.accN} questions`, now: `So far: ${l.length} questions · ${pct(l)}%` }; }
  if (n === 3) { const l = times.slice(-R.speedN); const c = cur(l); return { n, text: `Solve questions in about ${sec(1)} seconds or less`, now: c == null ? `So far: ${l.length} questions` : `So far: ${c} seconds (${l.length}/${R.speedN} questions)` }; }
  if (n === 4) {
    const since = r.starDay && r.starDay[3];
    const ref = today || (times.length ? times[times.length - 1].d : since);
    const wait = since && ref ? Math.max(0, R.gapDays - daysBetween(since, ref)) : R.gapDays;
    return { n, text: `Wait ${R.gapDays} days after earning ☆3, then get ${R.holdRun} questions right in a row on your first try`, now: wait ? `Try again in ${wait} ${wait === 1 ? 'day' : 'days'}` : 'You can try today!' };
  }
  const l = times.slice(-R.topN); const c = cur(l);
  return { n, text: `Get at least ${R.top * 100}% right on your first try over your last ${R.topN} questions, in about ${sec(R.topSpeed)} seconds per question or less`, now: `So far: ${pct(l)}%${c == null ? '' : ` · ${c} seconds`}` };
}
