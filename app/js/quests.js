// Quest copy stays in English JS; deterministic planning and rewards are Rust.
import { SKILL } from './skills.js';
import { coreCall, syncInto } from './math-core.js';
export const QUEST_MINUTES = 15;
export const POLISH = { perWeek: 2, chance: 0.5 };
const labels = {"play1": "Finish 1 round", "combo5": "Get a 5 combo", "first5": "Solve 5 questions on your first try", "review1": "Review 1 question", "new1": "Try 1 question from a NEW skill", "extra": "Reach the Extra Round", "extra5": "Solve 5 Extra Round questions", "combo20": "Get a 20 combo", "play2": "Finish 2 rounds", "grade1": "Finish 1 By Grade round", "learn10": "Solve 10 questions in skills you are learning"};
const metadata = [{"id": "play1", "tier": "easy", "metric": "play", "goal": 1, "mode": "any"}, {"id": "combo5", "tier": "easy", "metric": "combo", "goal": 5, "mode": "any"}, {"id": "first5", "tier": "easy", "metric": "firstTry", "goal": 5, "mode": "any"}, {"id": "review1", "tier": "easy", "metric": "review", "goal": 1, "mode": "review"}, {"id": "new1", "tier": "easy", "metric": "newSkill", "goal": 1, "mode": "any"}, {"id": "extra", "tier": "hard", "metric": "extraReach", "goal": 1, "mode": "any"}, {"id": "extra5", "tier": "hard", "metric": "extraSolved", "goal": 5, "mode": "any"}, {"id": "combo20", "tier": "hard", "metric": "combo", "goal": 20, "mode": "any"}, {"id": "play2", "tier": "hard", "metric": "play", "goal": 2, "mode": "any"}, {"id": "grade1", "tier": "hard", "metric": "gradePlay", "goal": 1, "mode": "grade"}, {"id": "learn10", "tier": "hard", "metric": "learning", "goal": 10, "mode": "any"}, {"id": "polish", "tier": "hard", "metric": "skill", "goal": 3, "mode": "practice"}];
const definition = (entry) => ({ ...entry,
  text: entry.id === 'polish' ? (q) => `Polish “${SKILL[q.skill]?.name || ''}” (3 first-try answers)` : () => labels[entry.id],
  plays: (ctx) => coreCall('questPlays', { id: entry.id, ctx }),
  need: (ctx) => coreCall('questEligible', { id: entry.id, ctx }),
});
export const QUESTS = metadata.filter(q=>q.id!=='polish').map(definition);
export const DYNAMIC = metadata.filter(q=>q.id==='polish').map(definition);
export const QUEST = Object.fromEntries(QUESTS.map(q=>[q.id,q]));
export const questDef = (q) => QUEST[q.id] || DYNAMIC.find(d=>d.id===q.id);
export const questText = (q) => { const d=questDef(q);return d?d.text(q):''; };
export const playMinutes = (count,withExtra) => coreCall('playMinutes',{count,withExtra});
export const questMinutes = (list,ctx) => coreCall('questMinutes',{list:list.map(({id})=>({id})),ctx});
export const dailyQuests = (day,ctx) => coreCall('dailyQuests',{day,ctx});
export const allDone = (state) => coreCall('allDone',{state});
export function ensureDay(state,day,ctx) { const out=coreCall('ensureDay',{state,day,ctx});syncInto(state,out.state);return out.result; }
export function questEvent(state,event) { const out=coreCall('questEvent',{state,event});syncInto(state,out.state);return out.result; }
export function claimReward(state) { const out=coreCall('claimReward',{state});syncInto(state,out.state);return out.result; }
