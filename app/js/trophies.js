// Trophies (id036): many small achievements, like the ones in mobile games.
// Each series is one measure with rising steps; every step is a trophy.
// Days and streaks get dense steps; volume series get wide ones so long
// sessions are not pushed too hard (docs/SPEC.md 14.7). Nothing is
// random, conditions are always shown (except a few secrets), and a trophy,
// once earned, is kept.
import { SKILLS, LANES } from './skills.js';
import { isUnlocked, isMastered, starsOf } from './session.js';

export const CATS = ['Keep going', 'Big totals', 'Skills', 'Growth', 'Extra Round', 'Combos', 'Accuracy', 'Dopa', 'Review', 'Grades', 'Collection', 'Secrets'];

const fmt = (n) => n.toLocaleString('en-US');
const count = (n, unit) => `${fmt(n)} ${unit}${n === 1 ? '' : 's'}`;
const duration = (v) => v >= 60 ? count(v / 60, 'hour') : count(v, 'minute');
const DOPA_LABEL = { 2: '100', 3: '1,000', 4: '10,000', 5: '100,000', 6: '1 million', 7: '10 million', 8: '100 million', 9: '1 billion' };
const RANKS = ['bronze', 'silver', 'gold', 'rainbow'];
export const RANK_NAME = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', rainbow: 'Rainbow', secret: 'Secret' };

// Rank by position in its series: first ~30% bronze, then silver, gold, and the last step rainbow.
function rankAt(i, n) {
  if (n === 1) return 'gold';
  if (i === n - 1) return 'rainbow';
  return RANKS[Math.min(2, Math.floor((i / (n - 1)) * 3.3))];
}

// A series: { key, cat, title, metric, steps, name(v), desc(v) } or explicit items.
const SERIES_DEFS = [
  { key: 'streak', cat: 'Keep going', title: 'Daily streak', metric: 'bestStreak', steps: [3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 365], name: (v) => `${v}-day streak`, desc: (v) => `Play on ${count(v, 'day')} in a row` },
  { key: 'days', cat: 'Keep going', title: 'Days played', metric: 'days', steps: [1, 3, 5, 7, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 365, 500, 730, 1000], name: (v) => `Play on ${count(v, 'day')}`, desc: (v) => `Play on ${count(v, 'day')} in total` },
  { key: 'stickers', cat: 'Keep going', title: 'Daily stickers', metric: 'stickers', steps: [1, 7, 14, 30, 50, 100, 200, 365], name: (v) => count(v, 'sticker'), desc: (v) => `Collect ${count(v, 'daily sticker')}` },
  { key: 'crowns', cat: 'Keep going', title: 'Crown stickers', metric: 'crowns', steps: [1, 3, 5, 10, 20, 52], name: (v) => count(v, 'crown'), desc: (v) => `Collect ${count(v, 'crown sticker')} from day 7` },
  { key: 'problems', cat: 'Big totals', title: 'Questions solved', metric: 'problems', steps: [10, 30, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 20000, 30000, 50000, 100000], name: (v) => `Solve ${count(v, 'question')}`, desc: (v) => `Solve ${count(v, 'question')} in total` },
  { key: 'cells', cat: 'Big totals', title: 'Digits entered', metric: 'cells', steps: [100, 500, 1000, 3000, 5000, 10000, 30000, 50000, 100000, 300000], name: (v) => `Enter ${count(v, 'digit')}`, desc: (v) => `Enter ${count(v, 'correct digit')} in total` },
  { key: 'plays', cat: 'Big totals', title: 'Rounds played', metric: 'plays', steps: [1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000], name: (v) => `Play ${count(v, 'round')}`, desc: (v) => `Finish ${count(v, 'round')} in total` },
  { key: 'minutes', cat: 'Big totals', title: 'Time played', metric: 'minutes', steps: [10, 30, 60, 120, 300, 600, 1200, 3000], name: (v) => duration(v), desc: (v) => `Play for ${duration(v)} in total` },
  { key: 'unlocked', cat: 'Skills', title: 'Skills unlocked', metric: 'unlocked', steps: [3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 58], name: (v) => `${count(v, 'skill')} unlocked`, desc: (v) => `Unlock ${count(v, 'skill')}` },
  { key: 'mastered', cat: 'Skills', title: 'Skills mastered', metric: 'mastered', steps: [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 58], name: (v) => `${count(v, 'skill')} mastered`, desc: (v) => `Master ${count(v, 'skill')}` },
  { key: 'gradeDone', cat: 'Skills', title: 'Grade mastery', items: [1, 2, 3, 4, 5, 6].map((g) => ({ id: `gradeDone-${g}`, metric: `gradeDone${g}`, need: 1, name: `Grade ${g} master`, desc: `Master every Grade ${g} skill` })) },
  { key: 'laneDone', cat: 'Skills', title: 'Skill group mastery', items: LANES.map((l, i) => ({ id: `laneDone-${i}`, metric: `laneDone${i}`, need: 1, name: `${l} master`, desc: `Master every skill in ${l}` })) },
  { key: 'extras', cat: 'Extra Round', title: 'Reach the Extra Round', metric: 'extras', steps: [1, 3, 5, 10, 20, 30, 50, 100, 200, 300], name: (v) => count(v, 'Extra Round'), desc: (v) => `Reach ${count(v, 'Extra Round')}` },
  { key: 'extraBest', cat: 'Extra Round', title: 'Best Extra Round', metric: 'extraBest', steps: [3, 5, 7, 10, 12, 15, 18, 20, 23, 25, 30], name: (v) => `${count(v, 'question')} in one round`, desc: (v) => `Solve ${count(v, 'question')} in one Extra Round` },
  { key: 'extraSolved', cat: 'Extra Round', title: 'Extra questions solved', metric: 'extraSolved', steps: [10, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000], name: (v) => count(v, 'Extra Round question'), desc: (v) => `Solve ${count(v, 'Extra Round question')} in total` },
  { key: 'combo', cat: 'Combos', title: 'Combos', metric: 'maxCombo', steps: [5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300], name: (v) => `${v} combo`, desc: (v) => `Get a ${v} combo` },
  { key: 'perfects', cat: 'Accuracy', title: 'Perfect rounds', metric: 'perfects', steps: [1, 3, 5, 10, 20, 30, 50, 100, 200, 300], name: (v) => count(v, 'perfect round'), desc: (v) => `Finish ${count(v, 'round')} with every answer right on the first try` },
  { key: 'firstTry', cat: 'Accuracy', title: 'First-try answers', metric: 'firstTry', steps: [10, 50, 100, 300, 500, 1000, 3000, 5000, 10000, 30000], name: (v) => count(v, 'first-try answer'), desc: (v) => `Solve ${count(v, 'question')} on your first try` },
  { key: 'dopa', cat: 'Dopa', title: 'Dopa', metric: 'bestDopaL', steps: [2, 3, 4, 5, 6, 7, 8, 9], name: (v) => `${DOPA_LABEL[v]} Dopa`, desc: (v) => `Reach ${DOPA_LABEL[v]} Dopa in one round` },
  { key: 'review', cat: 'Review', title: 'Review', metric: 'reviewSolved', steps: [1, 5, 10, 30, 50, 100, 200, 300], name: (v) => `Review ${count(v, 'question')}`, desc: (v) => `Try ${count(v, 'missed question')} again` },
  ...[1, 2, 3, 4, 5, 6].map((g) => ({ key: `grade${g}`, cat: 'Grades', title: `Play Grade ${g}`, metric: `gradePlays${g}`, steps: [1, 10, 30], name: (v) => `Grade ${g}: ${count(v, 'round')}`, desc: (v) => `Play ${count(v, 'round')} in Grade ${g}` })),
  { key: 'secret', cat: 'Secrets', title: 'Secrets', items: [
    { id: 'secret-perfect14', metric: 'flag:perfect14', need: 1, name: 'Perfect 14', desc: 'Solve all 14 questions without a mistake', secret: true },
    { id: 'secret-extraClean', metric: 'flag:extraClean', need: 1, name: 'Perfect Extra Round', desc: 'Solve at least 5 Extra Round questions without a mistake', secret: true },
    { id: 'secret-sunday', metric: 'flag:sunday', need: 1, name: 'Sunday math', desc: 'Play on a Sunday', secret: true },
    { id: 'secret-newyear', metric: 'flag:newyear', need: 1, name: 'New Year math', desc: 'Play on January 1', secret: true },
    { id: 'secret-comeback', metric: 'flag:comeback', need: 1, name: 'Welcome back!', desc: 'Play again after a break of at least a week', secret: true },
    { id: 'secret-allmodes', metric: 'allModes', need: 1, name: 'Try every mode', desc: 'Play My Level, By Grade, Practice, and Review', secret: true },
  ] },
];

// Other features add their own series (id045). Keep this list append-only.
export const SERIES = [];
export const TROPHIES = [];
export const TROPHY = {};
export function addSeries(def) {
  const items = def.items
    ? def.items.map((it, i, a) => ({ rank: it.secret ? 'secret' : rankAt(i, a.length), ...it }))
    : def.steps.map((v, i, a) => ({ id: `${def.key}-${v}`, metric: def.metric, need: v, name: def.name(v), desc: def.desc(v), rank: rankAt(i, a.length) }));
  const series = { key: def.key, cat: def.cat, title: def.title, items: items.map((it) => ({ ...it, series: def.key, cat: def.cat, reward: it.reward || null })) };
  SERIES.push(series);
  for (const it of series.items) { TROPHIES.push(it); TROPHY[it.id] = it; }
  return series;
}
SERIES_DEFS.forEach(addSeries);

// id045: the features added after id036 (stars, quests, hammer, rust,
// time capsule, "You improved", collection).
[
  { key: 'questDays', cat: 'Keep going', title: 'Daily quest sets', metric: 'questDays', steps: [1, 3, 7, 14, 30, 50, 100, 200, 365], name: (v) => `${count(v, 'day')} of complete quests`, desc: (v) => `Finish every daily quest on ${count(v, 'day')}` },
  { key: 'questRun', cat: 'Keep going', title: 'Quest streak', metric: 'questRun', steps: [2, 3, 5, 7, 14, 30], name: (v) => `${v}-day quest streak`, desc: (v) => `Finish every daily quest for ${count(v, 'day')} in a row` },
  { key: 'hammer', cat: 'Keep going', title: 'Streak Saver', metric: 'hammerUsed', steps: [1, 3, 10], name: (v) => (v === 1 ? 'First Streak Saver' : `${count(v, 'Streak Saver')} used`), desc: (v) => `Use ${count(v, 'Streak Saver')}` },
  { key: 'starsTotal', cat: 'Skills', title: 'Star collection', metric: 'starsTotal', steps: [5, 10, 25, 50, 75, 100, 150, 200, 250, 290], name: (v) => count(v, 'star'), desc: (v) => `Collect ${count(v, 'skill star')} in total` },
  { key: 'star5', cat: 'Skills', title: '5-star skills', metric: 'star5', steps: [1, 3, 5, 10, 20, 30, 58], name: (v) => count(v, '5-star skill'), desc: (v) => `Earn 5 stars in ${count(v, 'skill')}` },
  { key: 'gradeStar3', cat: 'Skills', title: '3-star grades', items: [1, 2, 3, 4, 5, 6].map((g) => ({ id: `gradeStar3-${g}`, metric: `gradeStar3${g}`, need: 1, name: `Grade ${g}: all 3-star skills`, desc: `Earn at least 3 stars in every Grade ${g} skill` })) },
  { key: 'polished', cat: 'Growth', title: 'Polish your skills', metric: 'polished', steps: [1, 3, 5, 10, 30, 50], name: (v) => `${count(v, 'skill')} polished`, desc: (v) => `Polish a rusty skill ${count(v, 'time')}` },
  { key: 'capsules', cat: 'Growth', title: 'Time capsules', metric: 'capsules', steps: [1, 3, 5, 10, 30], name: (v) => count(v, 'capsule'), desc: (v) => `Open ${count(v, 'time capsule')}` },
  { key: 'capsuleFaster', cat: 'Growth', title: 'Faster than before', metric: 'capsuleFaster', steps: [1, 5, 10], name: (v) => `Faster ${count(v, 'time')}`, desc: (v) => `Beat your old time in ${count(v, 'time capsule')}` },
  { key: 'grew', cat: 'Growth', title: 'You improved!', metric: 'grew', steps: [1, 5, 10, 30, 50, 100], name: (v) => `${count(v, 'improvement')}`, desc: (v) => `See “You improved!” in your results ${count(v, 'time')}` },
  { key: 'items', cat: 'Collection', title: 'Collection', metric: 'itemsOwned', steps: [10, 20, 30, 40, 47], name: (v) => count(v, 'collectible'), desc: (v) => `Unlock ${count(v, 'collectible')}` },
  { key: 'catComplete', cat: 'Collection', title: 'Complete collections', metric: 'catComplete', steps: [1, 3, 5, 8], name: (v) => `${count(v, 'collection')} complete`, desc: (v) => `Unlock every item in ${count(v, 'collection')}` },
].forEach(addSeries);

// Numbers every trophy is measured against, from the saved state.
// snap: { stats, prog, bestStreak, stickers, crowns, ...extra metrics }
export function trophyMetrics(snap) {
  const s = snap.stats || {};
  const prog = snap.prog || { skills: {} };
  const m = {
    bestStreak: snap.bestStreak || 0, days: s.days || 0, stickers: snap.stickers || 0, crowns: snap.crowns || 0,
    problems: s.problems || 0, cells: s.cells || 0, plays: s.plays || 0, minutes: Math.floor((s.playMs || 0) / 60000),
    unlocked: SKILLS.filter((x) => isUnlocked(prog, x.id)).length, mastered: SKILLS.filter((x) => isMastered(prog, x.id)).length,
    extras: s.extras || 0, extraBest: s.extraBest || 0, extraSolved: s.extraSolved || 0, maxCombo: s.maxCombo || 0,
    perfects: s.perfects || 0, firstTry: s.firstTry || 0, bestDopaL: Math.floor((s.bestDopaL || 0) + 1e-9), reviewSolved: s.reviewSolved || 0,
  };
  const stars = Object.fromEntries(SKILLS.map((x) => [x.id, starsOf(prog, x.id)]));
  m.starsTotal = Object.values(stars).reduce((a, b) => a + b, 0);
  m.star5 = Object.values(stars).filter((n) => n >= 5).length;
  m.polished = s.polished || 0; m.capsules = s.capsules || 0; m.capsuleFaster = s.capsuleFaster || 0; m.grew = s.grew || 0;
  for (let g = 1; g <= 6; g++) {
    m[`gradeStar3${g}`] = SKILLS.filter((x) => x.grade === g).every((x) => stars[x.id] >= 3) ? 1 : 0;
    m[`gradeDone${g}`] = SKILLS.filter((x) => x.grade === g).every((x) => isMastered(prog, x.id)) ? 1 : 0;
    m[`gradePlays${g}`] = (s.grades || {})[g] || 0;
  }
  LANES.forEach((_, i) => { m[`laneDone${i}`] = SKILLS.filter((x) => x.lane === i).every((x) => isMastered(prog, x.id)) ? 1 : 0; });
  for (const [k, v] of Object.entries(s.flags || {})) if (v) m[`flag:${k}`] = 1;
  const modes = s.modes || {};
  m.allModes = ['level', 'grade', 'practice', 'review'].every((k) => modes[k]) ? 1 : 0;
  Object.assign(m, snap.extra || {});
  return m;
}
export const valueOf = (m, metric) => m[metric] || 0;

// Earn every trophy whose condition is met. Returns the new ones (in list order).
// `state` is the saved { got: { id: time } }; the first call earns what the
// existing records already reach and marks them as a batch.
export function evaluate(state, metrics, at = Date.now()) {
  state.got = state.got || {};
  const fresh = [];
  for (const t of TROPHIES) {
    if (state.got[t.id]) continue;
    if (valueOf(metrics, t.metric) >= t.need) { state.got[t.id] = at; fresh.push(t); }
  }
  if (!state.init) { state.init = true; state.batch = fresh.map((t) => t.id); return []; }
  return fresh;
}

export const earnedCount = (state) => TROPHIES.filter((t) => state.got && state.got[t.id]).length;

// Progress of one series for the list screen.
export function seriesView(series, state, metrics) {
  const got = series.items.filter((t) => state.got && state.got[t.id]);
  const next = series.items.find((t) => !(state.got && state.got[t.id]));
  const top = got[got.length - 1] || null;
  return { series, got, next, top, value: next ? valueOf(metrics, next.metric) : null };
}
