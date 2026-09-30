// Deterministic inputs shared by baseline generation and the shipped regression
// test. The expected hashes were captured from the original JavaScript engine.
import { createHash } from 'node:crypto';

const stable = (v) => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v;

export function runProgressScenarios(call, skills) {
  let seed = 348934;
  const rng = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
  let hash = createHash('sha256'), assertions = 0;
  const results = [];
  const record = (value) => { hash.update(JSON.stringify(stable(value)) + '\n'); assertions += 1; };
  const checkpoint = (name) => { results.push({ name, assertions, hash: hash.digest('hex') }); hash = createHash('sha256'); assertions = 0; };
  record(call('skillOrder', {})); record(call('placementOrder', {})); checkpoint('skill orders');
  let now = Date.UTC(2026, 8, 30);
  let prog = { placed: false, skills: {}, review: [] };
  for (let i = 0; i < 600; i++) {
    now += 1000 + Math.floor(rng() * 1e7);
    const id = skills[Math.floor(rng() * skills.length)].id;
    const firstTry = rng() < 0.82, sig = rng() < 0.9 ? 'p' + i : null;
    const info = rng() < 0.92 ? { at: now, day: new Date(now).toISOString().slice(0, 10), ms: rng() * 18000,
      cells: 1 + Math.floor(rng() * 8), misses: firstTry ? 0 : 1, problem: { title: 'x', steps: [1, 2, 3] } } : { at: now };
    const r = call('recordResult', { prog, id, firstTry, sig, info }); prog = r.prog;
    record(r.result); record(prog);
    for (const op of ['stateOf', 'masteryRatio', 'starsOf']) record(call(op, { prog, id }));
    record(call('rustyOf', { prog, now }));
    if (i % 20 === 0) { record(call('frontier', { prog })); record(call('pickCapsule', { prog, now })); }
    if (i % 73 === 0) { prog = call('masterWithAncestors', { prog, id, at: now }); record(prog); }
    if (i % 199 === 0) {
      record(call('dependents', { id })); const r = call('relockSkill', { prog, id }); prog = r.prog;
      record(r.result); record(prog);
    }
    if (i % 50 === 49) checkpoint(`answers ${i - 49}-${i}`);
  }
  for (let grade = 1; grade <= 6; grade++) for (const n of [0, 1, 2, 10, 30]) {
    const random = Array.from({ length: 100 }, rng), plan = call('gradePlan', { grade, n, random });
    record(plan.basic);
    for (let k = 0; k < 60; k++) record(k < plan.extra.length ? plan.extra[k] : plan.extraCycle[(k - plan.extra.length) % plan.extraCycle.length]);
  }
  checkpoint('grade plans and repeating extras');
  prog.placed = true;
  for (const n of [0, 1, 2, 10, 30]) {
    const random = Array.from({ length: 100 }, rng), plan = call('levelPlan', { prog, n, random, now });
    record(plan.basic); record(plan.randomUsed);
    for (let k = 0; k < 50; k++) record(plan.extra[k % plan.extra.length]);
  }
  checkpoint('level plans and random consumption');
  prog = { placed: false, skills: {}, review: [] };
  let walk = { p: 0, jump: 6, lastOk: -1 };
  for (let i = 0; i < 100; i++) {
    const r = call('placementStep', { prog, walk, firstTry: rng() < 0.7, at: now });
    walk = r.walk; prog = r.prog; record(walk); record(prog);
  }
  checkpoint('placement grants and slips');
  let stats = call('emptyStats', {}); record(stats);
  const history = [];
  for (let i = 0; i < 200; i++) {
    const solve = { cells: 1 + Math.floor(rng() * 10), firstTry: rng() < 0.8, misses: Math.floor(rng() * 3), review: rng() < 0.1,
      extra: rng() < 0.3, extraSolved: Math.floor(rng() * 20), combo: Math.floor(rng() * 90) };
    stats = call('noteSolve', { stats, info: solve }); record(stats);
    if (i % 5 === 0) {
      const info = { mode: ['grade', 'level', 'review'][Math.floor(rng() * 3)], grade: 1 + Math.floor(rng() * 6),
        day: new Date(now + i * 86400000).toISOString().slice(0, 10), timeMs: Math.floor(rng() * 120000), dopaL: rng() * 9,
        firstRate: rng() < 0.2 ? 1 : rng(), weekday: i % 7 };
      stats = call('notePlay', { stats, info }); record(stats);
      history.push({ ...info, ok: Math.floor(rng() * 30), ng: Math.floor(rng() * 5), extraOk: Math.floor(rng() * 10), extraNg: Math.floor(rng() * 3) });
    }
    if (i % 9 === 0) { stats = call('noteExtraStart', { stats }); record(stats); }
    if (i % 7 === 0) { stats = call('noteDopa', { stats, L: rng() * 9 }); record(stats); }
    if (i % 31 === 0) { stats = call('setFlag', { stats, name: 'example-' + i }); record(stats); }
  }
  record(call('statsFromHistory', { history })); checkpoint('lifetime statistics and history migration');
  const records = {}, plays = {}, today = '2026-09-30';
  for (let i = 0; i < 50; i++) {
    const id = skills[i % skills.length].id;
    const recordValue = { days: Array.from({ length: 30 }, (_, j) => ({ d: new Date(Date.UTC(2026, 7, 15 + j)).toISOString().slice(0, 10),
      n: 1 + Math.floor(rng() * 10), ms: Math.floor(rng() * 50000), f: Math.floor(rng() * 10), c: 1 + Math.floor(rng() * 20) })),
      first: Array.from({ length: 3 }, () => ({ t: Math.floor(rng() * 10000), m: Math.floor(rng() * 3), d: '2026-08-01', p: { steps: Array.from({ length: 1 + Math.floor(rng() * 6) }, () => 1) } })) };
    const cur = { n: 1 + Math.floor(rng() * 10), ms: Math.floor(rng() * 50000), c: 1 + Math.floor(rng() * 20), f: Math.floor(rng() * 10) };
    records[id] = recordValue; plays[id] = cur;
    record(call('compareSkill', { record: recordValue, cur, today }));
    record(call('capsuleCompare', { then: recordValue.first[0], ms: Math.floor(rng() * 10000), misses: Math.floor(rng() * 4) }));
  }
  record(call('growthLines', { plays, records, today }));
  for (const [a, b] of [['2024-02-27', '2024-03-05'], ['2026-12-29', '2027-01-05'], ['2027-01-01', '2026-12-31']]) record(call('daysBetween', { a, b }));
  checkpoint('growth comparison and calendar arithmetic');
  return results;
}
