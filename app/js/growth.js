// Lifetime statistics and improvement comparisons are pure Rust operations.
// JS owns persistence and supplies local calendar strings and timestamps.
import { coreCall, syncInto } from './math-core.js';
export const COMPARE = { minN: 3, monthDays: 21, gain: 0.1 };
export const emptyStats = () => coreCall('emptyStats');
export const daysBetween = (a,b) => coreCall('daysBetween',{a,b});
export const statsFromHistory = (history=[]) => coreCall('statsFromHistory',{history});
export function noteSolve(stats,info={}) { syncInto(stats,coreCall('noteSolve',{stats,info})); }
export function notePlay(stats,info={}) { syncInto(stats,coreCall('notePlay',{stats,info})); }
export function noteExtraStart(stats) { syncInto(stats,coreCall('noteExtraStart',{stats})); }
export function setFlag(stats,name) { syncInto(stats,coreCall('setFlag',{stats,name})); }
export function noteDopa(stats,L) { syncInto(stats,coreCall('noteDopa',{stats,L})); }
export const compareSkill = (record,cur,today) => coreCall('compareSkill',{record,cur,today});
export const growthLines = (plays,records,today,max=3) => coreCall('growthLines',{plays,records,today,max});
export const capsuleCompare = (then,ms,misses) => coreCall('capsuleCompare',{then,ms,misses});
