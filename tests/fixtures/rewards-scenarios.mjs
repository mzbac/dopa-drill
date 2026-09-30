// Portable deterministic reward scenarios. Golden hashes were captured from
// the original JavaScript rules before replacing them with Rust; production
// code and the tests never need a copy of the old calculation implementation.
import { createHash } from 'node:crypto';

const stable = (value) => Array.isArray(value) ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;

export function runRewardsScenarios(call, { skills, trophies, series, items, cats }) {
  let seed = 1234567;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let hash = createHash('sha256'), assertions = 0;
  const results = [];
  const record = (value) => { hash.update(JSON.stringify(stable(value)) + '\n'); assertions += 1; };
  const checkpoint = (name) => {
    results.push({ name, assertions, hash: hash.digest('hex') });
    hash = createHash('sha256'); assertions = 0;
  };
  for (let c = 0; c < 150; c++) {
    const prog = { skills: {} };
    for (const skill of skills) if (rng() < 0.7) {
      prog.skills[skill.id] = { mastered: rng() < 0.6, stars: Math.floor(rng() * 6) };
    }
    const stats = {};
    for (const key of ['days', 'problems', 'cells', 'plays', 'extras', 'extraBest', 'extraSolved',
      'maxCombo', 'perfects', 'firstTry', 'reviewSolved', 'polished', 'capsules', 'capsuleFaster', 'grew']) {
      stats[key] = Math.floor(rng() * 1000);
    }
    stats.playMs = Math.floor(rng() * 1e8); stats.bestDopaL = rng() * 10;
    stats.grades = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, Math.floor(rng() * 200)]));
    stats.flags = { sunday: rng() > 0.5, comeback: rng() > 0.5 };
    stats.modes = Object.fromEntries(['level', 'grade', 'practice', 'review'].map((key) => [key, rng() > 0.5 ? 1 : 0]));
    const snap = { prog, stats, bestStreak: Math.floor(rng() * 30), stickers: Math.floor(rng() * 50),
      crowns: Math.floor(rng() * 10), extra: { questDays: Math.floor(rng() * 30), custom: c } };
    const metrics = call('trophyMetrics', { snap }); record(metrics);
    let state = { got: {}, init: c % 2 === 0 };
    for (const trophy of trophies) if (rng() < 0.1) state.got[trophy.id] = Math.floor(rng() * 1e6);
    const evaluated = call('evaluateTrophies', { state, metrics, trophies, at: 456 });
    record(evaluated); state = evaluated.state;
    record(call('earnedCount', { state, trophies }));
    for (const group of series) record(call('seriesView', { series: group, state, metrics }));
    const equip = {};
    for (const cat of cats) equip[cat.key] = rng() < 0.5 ? 'auto' : items[Math.floor(rng() * items.length)].id;
    const random = Array.from({ length: cats.length }, rng);
    record(call('pickLook', { equip, got: state.got, items, cats, random }));
    for (const cat of cats) record(call('unlockedIn', { items, cat: cat.key, got: state.got }));
    for (const item of items) record(call('isItemUnlocked', { item, got: state.got }));
    record(call('collectionMetrics', { items, cats, got: state.got }));
    if (c % 25 === 24) checkpoint(`reward states ${c - 24}-${c}`);
  }
  record(call('defaultEquip', { cats }));
  for (const id of ['', null, 'bg:night', 'a:b:c']) record(call('variant', { id }));
  record(call('trophyMetrics', { snap: {} }));
  record(call('trophyMetrics', { snap: { stats: { bestDopaL: 3.9999999999, playMs: 119999 },
    extra: { starsTotal: 99, arbitrary: 'preserved' } } }));
  for (const metric of ['missing', 'zero', 'negative', 'false', 'custom']) {
    record(call('trophyValueOf', { metrics: { zero: 0, negative: -2, false: false, custom: 7 }, metric }));
  }
  checkpoint('defaults, floor boundaries, overrides and metric lookup');
  return results;
}
