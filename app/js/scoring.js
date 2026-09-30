// Scoring calculations live in Rust; English unit formatting is presentation.
export { extraPoints, extraTotal, basicDopaL, extraDopaL, extraProblemGain,
  comboMult, addDopa, comboWindowMs, comboMilestone } from './math-core.js';
export const BASIC_SCORE = 100;
export const EXTRA_BASE = 10;
export const EXTRA_STEP = 5;
export const BASIC_DOPA_L = 2.3;
export const DOPA_MAX_L = 9.08;
export const COMBO_DOPA = { max: 2, full: 20 };
export const COMBO_TIME = { base: 3000, perGrade: 600, read: 2500 };
export const comboMaxed = (combo) => combo >= COMBO_DOPA.full;

export function fmtDopa(level) {
  if (!Number.isFinite(level) || level >= 72) return '∞';
  if (level < 3) return Math.round(10 ** level).toLocaleString('en-US');
  const units = [[12, 'T'], [9, 'B'], [6, 'M'], [3, 'K']];
  const unit = units.find(([power]) => level >= power - 1e-9);
  const mantissa = 10 ** (level - unit[0]);
  return (mantissa < 10 ? mantissa.toFixed(1) : String(Math.floor(mantissa))) + unit[1];
}
export function unitOf(level) {
  if (level >= 72) return '∞';
  if (level < 2) return '';
  if (level < 3) return '100';
  if (level < 6) return ['K', '10K', '100K'][Math.floor(level + 1e-9) - 3];
  if (level < 9) return ['M', '10M', '100M'][Math.floor(level + 1e-9) - 6];
  if (level < 12) return ['B', '10B', '100B'][Math.floor(level + 1e-9) - 9];
  return 'T';
}
export const unitLabel = (unit) => ['K', 'M', 'B', 'T'].includes(unit) ? `1${unit}` : unit;
