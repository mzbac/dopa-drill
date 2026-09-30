// Problem generation and layouts. Every problem is a small grid of cells
// (digits, operators, lines) plus an ordered list of input steps; each step
// is one digit typed into one cell. Layout families:
//   column add/sub (with decimals), column multiplication, long division,
//   and horizontal expressions (integers, decimals, fractions, remainders).
import { SKILL, SKILLS } from './skills.js';
import { generateRecipe, columnModel, generateLegacyRecipe } from './math-core.js';

export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState = () => s;
  rng.setState = (state) => { s = state >>> 0; };
  return rng;
}

const PLACE = ['Ones place', 'Tens place', 'Hundreds place', 'Thousands place', 'Ten-thousands place', 'Hundred-thousands place'];
const DEC_PLACE = ['Tenths place', 'Hundredths place', 'Thousandths place'];
const digits = (n) => String(n).split('').map(Number);
// Decimal string for an integer scaled by 10^p (1234, 2 -> "12.34").
const decStr = (n, p) => { if (!p) return String(n); const s = String(n).padStart(p + 1, '0'); return `${s.slice(0, -p)}.${s.slice(-p)}`; };


// ================================================================ column add / sub
// a, b are integers scaled by 10^pa / 10^pb; the decimal point is aligned.
function buildAdd(a, b, pa = 0, pb = 0, model = columnModel('add',a,b,pa,pb)) {
  const {P, as, bs, result:ss} = model;
  const W = Math.max(as.length, bs.length, ss.length);
  const cols = W + 1;
  const cells = [];
  // Hide padded trailing zeros of the shorter decimal.
  const shown = (str, p, i) => i < str.length - (P - p);
  as.forEach((d, i) => { if (shown(as, pa, i)) cells.push({ id: `a${cols - as.length + i}`, r: 1, c: cols - as.length + i, text: d, kind: 'given' }); });
  bs.forEach((d, i) => { if (shown(bs, pb, i)) cells.push({ id: `b${cols - bs.length + i}`, r: 2, c: cols - bs.length + i, text: d, kind: 'given' }); });
  cells.push({ id: 'op', r: 2, c: cols - Math.max(as.length, bs.length) - 1, text: '＋', kind: 'op' });
  if (P) addDots(cells, cols - 1 - P, [1, 2, 3]);
  const steps = [];
  for (let i = 0; i < ss.length; i++) {
    const c = cols - 1 - i;
    const {carry, carryIn, terms} = model.steps[i];
    const help = { ids: [`a${c}`, `b${c}`, ...(carryIn ? [`k${c}`] : [])], text: terms.length ? `${terms.join(' ＋ ')}${carryIn ? ' ＋ 1' : ''}` : 'Carried 1' };
    const digit = ss[ss.length - 1 - i];
    cells.push({ id: `s${c}`, r: 3, c, text: digit, kind: 'input' });
    const after = [];
    if (carry && i < ss.length - 1) { cells.push({ id: `k${c - 1}`, r: 0, c: c - 1, text: '1', kind: 'carry', small: true }); after.push(`k${c - 1}`); }
    steps.push({ cell: `s${c}`, digit, label: placeLabel(i, P), after, carryFrom: after.length ? c : null, help });
  }
  const text = `${decStr(a, pa)} + ${decStr(b, pb)}`;
  return { kind: 'add', a, b, answer: model.answer, text, title: P ? 'Decimal addition' : 'Addition', rows: 4, cols, cells, lines: [{ r: 2, c0: 0, c1: cols - 1 }], steps, bracket: null };
}

function buildSub(a, b, pa = 0, pb = 0, model = columnModel('sub',a,b,pa,pb)) {
  const {P, as, bs, result:rsFull} = model;
  const W = as.length;
  const cols = W + 1;
  const cells = [];
  const shown = (str, p, i) => i < str.length - (P - p);
  as.forEach((d, i) => { if (shown(as, pa, i)) cells.push({ id: `a${i + 1}`, r: 1, c: i + 1, text: d, kind: 'given' }); });
  bs.forEach((d, i) => { if (shown(bs, pb, i)) cells.push({ id: `b${cols - bs.length + i}`, r: 2, c: cols - bs.length + i, text: d, kind: 'given' }); });
  cells.push({ id: 'op', r: 2, c: 0, text: '−', kind: 'op' });
  if (P) addDots(cells, cols - 1 - P, [1, 2, 3]);
  const steps = [];
  for (let i = 0; i < rsFull.length; i++) {
    const c = cols - 1 - i;
    const {marks, minuend, subtrahend} = model.steps[i];
    const digit = rsFull[rsFull.length - 1 - i];
    cells.push({ id: `s${c}`, r: 3, c, text: digit, kind: 'input' });
    const help = { ids: [`a${c}`, `b${c}`, `m${c}`], text: `${minuend} − ${subtrahend}` };
    steps.push({ cell: `s${c}`, digit, label: placeLabel(i, P), after: [], marks, help });
  }
  for (let c = 1; c < cols; c++) cells.push({ id: `m${c}`, r: 0, c, text: '', kind: 'mark', small: true });
  const text = `${decStr(a, pa)} − ${decStr(b, pb)}`;
  return { kind: 'sub', a, b, answer: model.answer, text, title: P ? 'Decimal subtraction' : 'Subtraction', rows: 4, cols, cells, lines: [{ r: 2, c0: 0, c1: cols - 1 }], steps, bracket: null };
}

// Digits of a scaled decimal, with at least one digit before the point.
function placeLabel(i, P) { return i < P ? DEC_PLACE[P - 1 - i] : PLACE[i - P]; }
// Decimal points sit on the right edge of the ones column in each row.
function addDots(cells, c, rows, hidden = false) { rows.forEach((r) => cells.push({ id: `dot${r}`, r, c, text: '.', kind: hidden ? 'auto' : 'dot' })); }

// ================================================================ column multiplication
// a × b with b of 1 or 2 digits; pa/pb decimal places (product point is placed at the end).
function buildMul(a, b, pa = 0, pb = 0, model = columnModel('mul',a,b,pa,pb)) {
  const {as,bs,ps,P} = model;
  const cols = Math.max(ps.length, as.length, bs.length + 1) + 1;
  const cells = [];
  [...as].forEach((d, i) => cells.push({ id: `a${cols - as.length + i}`, r: 1, c: cols - as.length + i, text: d, kind: 'given' }));
  [...bs].forEach((d, i) => cells.push({ id: `b${cols - bs.length + i}`, r: 2, c: cols - bs.length + i, text: d, kind: 'given' }));
  cells.push({ id: 'op', r: 2, c: cols - Math.max(as.length, bs.length) - 1, text: '×', kind: 'op' });
  if (pa) cells.push({ id: 'dota', r: 1, c: cols - 1 - pa, text: '.', kind: 'dot' });
  if (pb) cells.push({ id: 'dotb', r: 2, c: cols - 1 - pb, text: '.', kind: 'dot' });
  const lines = [{ r: 2, c0: 0, c1: cols - 1 }];
  const steps = [];
  const partialRow = (row, shift, tag) => {
    const {factor,steps:columnSteps} = model.partials[shift];
    for (let i = 0; i < columnSteps.length; i++) {
      const c = cols - 1 - shift - i;
      const {digit,x,carry} = columnSteps[i];
      cells.push({ id: `${tag}${c}`, r: row, c, text: digit, kind: 'input' });
      const help = x != null ? { ids: [`a${c + shift}`, `b${cols - 1 - shift}`], text: `${x} × ${factor}${carry ? ` ＋ ${carry}` : ''}` } : { ids: [], text: `Carry ${carry}` };
      steps.push({ cell: `${tag}${c}`, digit, label: `Multiply by ${factor}`, after: [], help });
    }
  };
  if (bs.length === 1) partialRow(3, 0, 's');
  else {
    partialRow(3, 0, 'p'); partialRow(4, 1, 'q');
    lines.push({ r: 4, c0: 0, c1: cols - 1 });
    model.sums.forEach(({digit,x,y,carry}, i) => {
      const c = cols - 1 - i;
      cells.push({ id: `s${c}`, r: 5, c, text: digit, kind: 'input' });
      const help = { ids: [`p${c}`, `q${c}`], text: `${x}${i ? ` ＋ ${y}` : ''}${carry ? ` ＋ ${carry}` : ''}` };
      steps.push({ cell: `s${c}`, digit, label: `Add (${PLACE[i]})`, after: [], help });
    });
  }
  const lastRow = bs.length === 1 ? 3 : 5;
  if (P) { cells.push({ id: 'dotp', r: lastRow, c: cols - 1 - P, text: '.', kind: 'auto' }); steps[steps.length - 1].after.push('dotp'); }
  const text = `${decStr(a, pa)} × ${decStr(b, pb)}`;
  return { kind: 'mul', a, b, answer: model.answer, text, title: P ? 'Decimal multiplication' : 'Multiplication', rows: lastRow + 1, cols, cells, lines, steps, bracket: null };
}

// ================================================================ long division
// D ÷ d (d of 1-2 digits), integer quotient, remainder allowed.
function buildDiv(D, d, model = columnModel('div',D,d)) {
  const Ds = String(D); const ds = String(d);
  const off = ds.length; // dividend columns start after the divisor
  const cols = off + Ds.length;
  const cells = [];
  [...ds].forEach((x, i) => cells.push({ id: `dv${i}`, r: 1, c: i, text: x, kind: 'given' }));
  [...Ds].forEach((x, i) => cells.push({ id: `D${i + 1}`, r: 1, c: off + i, text: x, kind: 'given' }));
  const {quotient:q,remainder:rem,firstDigits:k} = model;
  let stageIndex = 0;
  let cur = model.stages[0].current;
  let col = off + k - 1;
  let rowP = 1; // row holding the current partial dividend
  const steps = [];
  const lines = [];
  const place = (n, endCol, r, prefix, kind) => digits(n).map((x, i, arr) => {
    const c = endCol - (arr.length - 1 - i);
    const id = `${prefix}${r}_${c}`;
    cells.push({ id, r, c, text: String(x), kind });
    return id;
  });
  const divIds = [...ds].map((_, i) => `dv${i}`);
  for (;;) {
    const stage = model.stages[stageIndex];
    const qd = stage.quotientDigit;
    const qid = `q${col}`;
    cells.push({ id: qid, r: 0, c: col, text: String(qd), kind: 'input' });
    const last = col === cols - 1;
    const qStep = { cell: qid, digit: String(qd), label: `Quotient: ${PLACE[cols - 1 - col]}`, hint: `How many ${d}s fit in ${cur}?`, after: [], help: { ids: divIds, text: `${d} times table: ${stage.multiples.join(' ')}` } };
    steps.push(qStep);
    let r = cur;
    if (qd > 0) {
      const m = stage.product;
      const pr = rowP + 1;
      const mids = place(m, col, pr, 'm', 'auto');
      const lid = `L${pr}`;
      lines.push({ id: lid, r: pr, c0: col - String(Math.max(m, cur)).length + 1, c1: col, hidden: true });
      qStep.after.push(...mids, lid);
      r = stage.remainder;
      rowP = pr + 1;
      // Remainder of this subtraction, typed right to left (omitted when 0 and more digits follow).
      if (r === 0 && last) {
        // Exact division: the final 0 appears on its own.
        const zid = `z${rowP}_${col}`;
        cells.push({ id: zid, r: rowP, c: col, text: '0', kind: 'auto' });
        qStep.after.push(zid);
      } else if (r > 0) {
        const rs = String(r);
        for (let i = rs.length - 1; i >= 0; i--) {
          const c = col - (rs.length - 1 - i);
          const id = `r${rowP}_${c}`;
          cells.push({ id, r: rowP, c, text: rs[i], kind: 'input' });
          steps.push({ cell: id, digit: rs[i], label: 'Subtract the product', hint: `${cur} − ${m}`, after: [], help: { ids: mids, text: `${cur} − ${m}` } });
        }
      }
    }
    if (last) break;
    // Bring down the next digit beside the remainder.
    const nextDigit = Ds[col - off + 1];
    const bid = `bd${rowP}_${col + 1}`;
    cells.push({ id: bid, r: rowP, c: col + 1, text: nextDigit, kind: 'auto', drop: `D${col - off + 2}` });
    steps[steps.length - 1].after.push(bid);
    stageIndex += 1;
    cur = model.stages[stageIndex].current;
    col += 1;
  }
  const row = rowP;
  const rows = row + 1;
  const answer = rem ? `${q} remainder ${rem}` : String(q);
  return {
    kind: 'div', a: D, b: d, answer, text: `${D} ÷ ${d}`, title: 'Division', rows, cols, cells, lines, steps,
    bracket: { r: 1, c0: off, c1: cols - 1 }, rem,
  };
}

// ================================================================ horizontal expressions
// tokens: { n: '12' } given number, { op: '＋' }, { w: 'あまり' } word,
// { ans: '12.5' } answer (digits typed left to right, point auto),
// { f: [n, d, whole?] } given fraction, { fa: [n, d, whole?] } answer fraction,
// { br: true } line break.
function buildH(tokens, meta) {
  const hasFrac = tokens.some((t) => t.f || t.fa);
  const cells = []; const lines = []; const steps = [];
  const rowH = hasFrac ? 2 : 1;
  let r = 0; let c = 0; let maxC = 0;
  let uid = 0;
  const id = (p) => `${p}${uid++}`;
  const span = { rs: rowH };
  const ansIds = [];
  for (const t of tokens) {
    if (t.br) { maxC = Math.max(maxC, c); c = 0; r += rowH; continue; }
    if (t.n !== undefined || t.op !== undefined || t.w !== undefined) {
      const text = String(t.n ?? t.op ?? t.w);
      const kind = t.n !== undefined ? 'given' : t.op !== undefined ? 'op' : 'word';
      const w = kind === 'word' ? Math.max(1, Math.ceil(text.length / 2)) : kind === 'given' ? text.replace('.', '').length : 1;
      const cid = id(kind[0]);
      cells.push({ id: cid, r, c, cs: w, ...span, text, kind });
      if (kind === 'given') ansIds.push(cid);
      c += w;
    } else if (t.ans !== undefined) {
      const s = String(t.ans);
      for (const ch of s) {
        if (ch === '.') { cells.push({ id: id('dot'), r, c: c - 1, ...span, text: '.', kind: 'dot' }); continue; }
        const cid = id('x');
        cells.push({ id: cid, r, c, ...span, text: ch, kind: 'input' });
        steps.push({ cell: cid, digit: ch, label: t.label || 'Answer', after: [], help: meta.help ? { ids: [...ansIds], text: meta.help } : null });
        c += 1;
      }
    } else if (t.f || t.fa) {
      const [n, d, whole] = t.f || t.fa;
      const given = !!t.f;
      if (whole) {
        const ws = String(whole);
        if (given) { cells.push({ id: id('w'), r, c, cs: ws.length, ...span, text: ws, kind: 'given' }); c += ws.length; } else {
          for (const ch of ws) { const cid = id('x'); cells.push({ id: cid, r, c, ...span, text: ch, kind: 'input' }); steps.push({ cell: cid, digit: ch, label: 'Whole number', after: [], help: meta.help ? { ids: [], text: meta.help } : null }); c += 1; }
        }
      }
      const ns = String(n); const dsx = String(d);
      const w = Math.max(ns.length, dsx.length);
      lines.push({ r, c0: c, c1: c + w - 1, frac: true });
      if (given) {
        cells.push({ id: id('n'), r, c, cs: w, text: ns, kind: 'given', cls: 'frac-n' });
        cells.push({ id: id('d'), r: r + 1, c, cs: w, text: dsx, kind: 'given', cls: 'frac-d' });
      } else {
        // Denominator first, then numerator (as taught in school).
        const put = (str, row, label, cls) => [...str].forEach((ch, i) => {
          const cid = id('x');
          cells.push({ id: cid, r: row, c: c + w - str.length + i, text: ch, kind: 'input', cls });
          steps.push({ cell: cid, digit: ch, label, after: [], help: meta.help ? { ids: [], text: meta.help } : null });
        });
        put(dsx, r + 1, 'Denominator', 'frac-d');
        put(ns, r, 'Numerator', 'frac-n');
      }
      c += w;
    }
    maxC = Math.max(maxC, c);
  }
  return { kind: 'h', rows: r + rowH, cols: Math.max(maxC, c), cells, lines, steps, bracket: null, ...meta };
}

// Recipes contain Rust-generated arithmetic; these builders only turn them
// into the existing teachable grid, hints and input-cell order.
const SKILL_INDEX = Object.fromEntries(SKILLS.map((skill, index) => [skill.id, index]));
function buildRecipe(recipe) {
  const { kind, a, b, pa = 0, pb = 0 } = recipe;
  if (kind === 'add') return buildAdd(a, b, pa, pb, recipe.model);
  if (kind === 'sub') return buildSub(a, b, pa, pb, recipe.model);
  if (kind === 'mul') return buildMul(a, b, pa, pb, recipe.model);
  if (kind === 'div') return buildDiv(a, b, recipe.model);
  if (kind === 'h') return buildH(recipe.tokens, recipe.meta);
  throw new Error(`Unknown Rust problem recipe: ${kind}`);
}

// Signature used to avoid repeats.
export const signature = (p) => `${p.title}|${p.text}`;

// Make one problem for a skill, avoiding signatures in `recent` when possible.
export function makeProblem(skillId, rng, recent = null) {
  const sk = SKILL[skillId];
  if (!sk) throw new Error(`unknown skill ${skillId}`);
  let p;
  for (let tries = 0; tries < 40; tries++) {
    p = buildRecipe(generateRecipe(SKILL_INDEX[skillId], rng));
    if (!recent || !recent.has(signature(p))) break;
  }
  p.skill = skillId;
  return finalize(p);
}

function finalize(p) {
  p.answerText = p.kind === 'h' ? `${p.text} ＝ ${p.answer}` : `${p.text} ＝ ${p.answer}`;
  return p;
}

// ================================================================ legacy templates (fixed basic set)
export const BASIC_SETS = {
  6: ['add2', 'add2', 'sub2', 'div2', 'add3', 'div3'],
  10: ['add2', 'add2', 'sub2', 'sub3', 'div2', 'div3', 'add3', 'sub3z', 'div3', 'div3'],
  14: ['add2', 'add2', 'sub2', 'add2', 'sub3', 'div2', 'div2', 'add3', 'sub3', 'div3', 'sub3z', 'add3', 'div3', 'div3'],
};
export const EXTRA_TIERS = [['add3', 'sub3'], ['div3', 'sub3z'], ['add4', 'div3'], ['sub4', 'add4'], ['sub4', 'div3']];

export function generate(template, rng, fixed) {
  return finalize(buildRecipe(generateLegacyRecipe(template,rng,fixed)));
}

export const _internal = { buildAdd, buildSub, buildMul, buildDiv, buildH, buildRecipe, decStr };
