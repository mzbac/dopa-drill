// Problem generation and layouts. Every problem is a small grid of cells
// (digits, operators, lines) plus an ordered list of input steps; each step
// is one digit typed into one cell. Layout families:
//   column add/sub (with decimals), column multiplication, long division,
//   and horizontal expressions (integers, decimals, fractions, remainders).
import { SKILL, SKILLS } from './skills.js';
import { generateRecipe, gcd, countCarries, countBorrows } from './math-core.js';

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
const lcm = (a, b) => (a / gcd(a, b)) * b;
// Multiples of d up to the first one above n (hint for "how many d in n").
const table = (d, n) => { const out = []; for (let k = 1; k <= 9; k++) { out.push(d * k); if (d * k > n) break; } return `${d} times table: ${out.join(' ')}`; };
// Decimal string for an integer scaled by 10^p (1234, 2 -> "12.34").
const decStr = (n, p) => { if (!p) return String(n); const s = String(n).padStart(p + 1, '0'); return `${s.slice(0, -p)}.${s.slice(-p)}`; };

const carries = countCarries;
const borrows = countBorrows;

// ================================================================ column add / sub
// a, b are integers scaled by 10^pa / 10^pb; the decimal point is aligned.
function buildAdd(a, b, pa = 0, pb = 0) {
  const P = Math.max(pa, pb);
  const A = a * 10 ** (P - pa); const B = b * 10 ** (P - pb);
  const sum = A + B;
  const as = decDigits(A, P); const bs = decDigits(B, P); const ss = decDigits(sum, P);
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
  let carry = 0;
  const ad = as.slice().reverse().map(Number); const bd = bs.slice().reverse().map(Number);
  for (let i = 0; i < ss.length; i++) {
    const c = cols - 1 - i;
    const s = (ad[i] || 0) + (bd[i] || 0) + carry;
    const carryIn = carry;
    carry = s >= 10 ? 1 : 0;
    const terms = [ad[i], bd[i]].filter((x, k) => x !== undefined && (k === 0 ? shown(as, pa, as.length - 1 - i) : shown(bs, pb, bs.length - 1 - i)));
    const help = { ids: [`a${c}`, `b${c}`, ...(carryIn ? [`k${c}`] : [])], text: terms.length ? `${terms.join(' ＋ ')}${carryIn ? ' ＋ 1' : ''}` : 'Carried 1' };
    const digit = ss[ss.length - 1 - i];
    cells.push({ id: `s${c}`, r: 3, c, text: digit, kind: 'input' });
    const after = [];
    if (carry && i < ss.length - 1) { cells.push({ id: `k${c - 1}`, r: 0, c: c - 1, text: '1', kind: 'carry', small: true }); after.push(`k${c - 1}`); }
    steps.push({ cell: `s${c}`, digit, label: placeLabel(i, P), after, carryFrom: after.length ? c : null, help });
  }
  const text = `${decStr(a, pa)} + ${decStr(b, pb)}`;
  return { kind: 'add', a, b, answer: decStr(sum, P), text, title: P ? 'Decimal addition' : 'Addition', rows: 4, cols, cells, lines: [{ r: 2, c0: 0, c1: cols - 1 }], steps, bracket: null };
}

function buildSub(a, b, pa = 0, pb = 0) {
  const P = Math.max(pa, pb);
  const A = a * 10 ** (P - pa); const B = b * 10 ** (P - pb);
  const res = A - B;
  const as = decDigits(A, P); const bs = decDigits(B, P);
  const rsFull = decDigits(res, P);
  const W = as.length;
  const cols = W + 1;
  const cells = [];
  const shown = (str, p, i) => i < str.length - (P - p);
  as.forEach((d, i) => { if (shown(as, pa, i)) cells.push({ id: `a${i + 1}`, r: 1, c: i + 1, text: d, kind: 'given' }); });
  bs.forEach((d, i) => { if (shown(bs, pb, i)) cells.push({ id: `b${cols - bs.length + i}`, r: 2, c: cols - bs.length + i, text: d, kind: 'given' }); });
  cells.push({ id: 'op', r: 2, c: 0, text: '−', kind: 'op' });
  if (P) addDots(cells, cols - 1 - P, [1, 2, 3]);
  const cur = [null, ...as.map(Number)];
  const bcol = (c) => { const i = c - (cols - bs.length); return i >= 0 ? Number(bs[i]) : 0; };
  const steps = [];
  for (let i = 0; i < rsFull.length; i++) {
    const c = cols - 1 - i;
    const marks = [];
    if (cur[c] < bcol(c)) {
      let k = c - 1;
      while (cur[k] === 0) { cur[k] = 9; marks.push({ c: k, text: '9' }); k -= 1; }
      cur[k] -= 1; marks.push({ c: k, text: String(cur[k]) });
      cur[c] += 10; marks.push({ c, text: String(cur[c]) });
    }
    const digit = rsFull[rsFull.length - 1 - i];
    cells.push({ id: `s${c}`, r: 3, c, text: digit, kind: 'input' });
    const help = { ids: [`a${c}`, `b${c}`, `m${c}`], text: `${cur[c]} − ${bcol(c)}` };
    steps.push({ cell: `s${c}`, digit, label: placeLabel(i, P), after: [], marks, help });
  }
  for (let c = 1; c < cols; c++) cells.push({ id: `m${c}`, r: 0, c, text: '', kind: 'mark', small: true });
  const text = `${decStr(a, pa)} − ${decStr(b, pb)}`;
  return { kind: 'sub', a, b, answer: decStr(res, P), text, title: P ? 'Decimal subtraction' : 'Subtraction', rows: 4, cols, cells, lines: [{ r: 2, c0: 0, c1: cols - 1 }], steps, bracket: null };
}

// Digits of a scaled decimal, with at least one digit before the point.
function decDigits(n, p) { return String(n).padStart(p + 1, '0').split(''); }
function placeLabel(i, P) { return i < P ? DEC_PLACE[P - 1 - i] : PLACE[i - P]; }
// Decimal points sit on the right edge of the ones column in each row.
function addDots(cells, c, rows, hidden = false) { rows.forEach((r) => cells.push({ id: `dot${r}`, r, c, text: '.', kind: hidden ? 'auto' : 'dot' })); }

// ================================================================ column multiplication
// a × b with b of 1 or 2 digits; pa/pb decimal places (product point is placed at the end).
function buildMul(a, b, pa = 0, pb = 0) {
  const prod = a * b;
  const as = String(a); const bs = String(b); const ps = String(prod);
  const cols = Math.max(ps.length, as.length, bs.length + 1) + 1;
  const cells = [];
  [...as].forEach((d, i) => cells.push({ id: `a${cols - as.length + i}`, r: 1, c: cols - as.length + i, text: d, kind: 'given' }));
  [...bs].forEach((d, i) => cells.push({ id: `b${cols - bs.length + i}`, r: 2, c: cols - bs.length + i, text: d, kind: 'given' }));
  cells.push({ id: 'op', r: 2, c: cols - Math.max(as.length, bs.length) - 1, text: '×', kind: 'op' });
  if (pa) cells.push({ id: 'dota', r: 1, c: cols - 1 - pa, text: '.', kind: 'dot' });
  if (pb) cells.push({ id: 'dotb', r: 2, c: cols - 1 - pb, text: '.', kind: 'dot' });
  const lines = [{ r: 2, c0: 0, c1: cols - 1 }];
  const steps = [];
  const bd = digits(b).reverse();
  const partialRow = (row, factor, shift, tag) => {
    const part = String(a * factor);
    let carry = 0;
    const ad = digits(a).reverse();
    for (let i = 0; i < part.length; i++) {
      const c = cols - 1 - shift - i;
      const digit = part[part.length - 1 - i];
      cells.push({ id: `${tag}${c}`, r: row, c, text: digit, kind: 'input' });
      const x = ad[i];
      const help = x !== undefined ? { ids: [`a${c + shift}`, `b${cols - 1 - shift}`], text: `${x} × ${factor}${carry ? ` ＋ ${carry}` : ''}` } : { ids: [], text: `Carry ${carry}` };
      carry = x !== undefined ? Math.floor((x * factor + carry) / 10) : 0;
      steps.push({ cell: `${tag}${c}`, digit, label: `Multiply by ${factor}`, after: [], help });
    }
  };
  if (bs.length === 1) {
    partialRow(3, b, 0, 's');
  } else {
    partialRow(3, bd[0], 0, 'p');
    partialRow(4, bd[1], 1, 'q');
    lines.push({ r: 4, c0: 0, c1: cols - 1 });
    const p1 = a * bd[0]; const p2 = a * bd[1] * 10;
    let carry = 0;
    for (let i = 0; i < ps.length; i++) {
      const c = cols - 1 - i;
      const x = Math.floor(p1 / 10 ** i) % 10; const y = i ? Math.floor(p2 / 10 ** i) % 10 : 0;
      const digit = ps[ps.length - 1 - i];
      cells.push({ id: `s${c}`, r: 5, c, text: digit, kind: 'input' });
      const help = { ids: [`p${c}`, `q${c}`], text: `${x}${i ? ` ＋ ${y}` : ''}${carry ? ` ＋ ${carry}` : ''}` };
      carry = Math.floor((x + y + carry) / 10);
      steps.push({ cell: `s${c}`, digit, label: `Add (${PLACE[i]})`, after: [], help });
    }
  }
  const P = pa + pb;
  const lastRow = bs.length === 1 ? 3 : 5;
  if (P) { cells.push({ id: 'dotp', r: lastRow, c: cols - 1 - P, text: '.', kind: 'auto' }); steps[steps.length - 1].after.push('dotp'); }
  const text = `${decStr(a, pa)} × ${decStr(b, pb)}`;
  return { kind: 'mul', a, b, answer: decStr(prod, P), text, title: P ? 'Decimal multiplication' : 'Multiplication', rows: lastRow + 1, cols, cells, lines, steps, bracket: null };
}

// ================================================================ long division
// D ÷ d (d of 1-2 digits), integer quotient, remainder allowed.
function buildDiv(D, d) {
  const Ds = String(D); const ds = String(d);
  const off = ds.length; // dividend columns start after the divisor
  const cols = off + Ds.length;
  const cells = [];
  [...ds].forEach((x, i) => cells.push({ id: `dv${i}`, r: 1, c: i, text: x, kind: 'given' }));
  [...Ds].forEach((x, i) => cells.push({ id: `D${i + 1}`, r: 1, c: off + i, text: x, kind: 'given' }));
  const q = Math.floor(D / d); const rem = D % d;
  // First partial dividend: fewest leading digits that are >= d.
  let k = 1;
  while (Number(Ds.slice(0, k)) < d && k < Ds.length) k += 1;
  let cur = Number(Ds.slice(0, k));
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
    const qd = Math.floor(cur / d);
    const qid = `q${col}`;
    cells.push({ id: qid, r: 0, c: col, text: String(qd), kind: 'input' });
    const last = col === cols - 1;
    const qStep = { cell: qid, digit: String(qd), label: `Quotient: ${PLACE[cols - 1 - col]}`, hint: `How many ${d}s fit in ${cur}?`, after: [], help: { ids: divIds, text: table(d, cur) } };
    steps.push(qStep);
    let r = cur;
    if (qd > 0) {
      const m = qd * d;
      const pr = rowP + 1;
      const mids = place(m, col, pr, 'm', 'auto');
      const lid = `L${pr}`;
      lines.push({ id: lid, r: pr, c0: col - String(Math.max(m, cur)).length + 1, c1: col, hidden: true });
      qStep.after.push(...mids, lid);
      r = cur - m;
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
    cur = r * 10 + Number(nextDigit);
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
  if (kind === 'add') return buildAdd(a, b, pa, pb);
  if (kind === 'sub') return buildSub(a, b, pa, pb);
  if (kind === 'mul') return buildMul(a, b, pa, pb);
  if (kind === 'div') return buildDiv(a, b);
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
  const r = (a, b) => a + Math.floor(rng() * (b - a + 1));
  if (fixed) return finalize(fixed.kind === 'add' ? buildAdd(fixed.a, fixed.b) : fixed.kind === 'sub' ? buildSub(fixed.a, fixed.b) : buildDiv(fixed.a, fixed.b));
  for (let guard = 0; guard < 500; guard++) {
    let a; let b;
    switch (template) {
      case 'add2': a = r(12, 68); b = r(12, 89 - a); if (a + b < 100 && carries(a, b) === 1 && a % 10 && b % 10) return finalize(buildAdd(a, b)); break;
      case 'add3': a = r(120, 780); b = r(120, 999 - a); if (a + b < 1000 && carries(a, b) >= 2) return finalize(buildAdd(a, b)); break;
      case 'add4': a = r(1200, 7800); b = r(1200, 9999 - a); if (a + b < 10000 && carries(a, b) >= 2) return finalize(buildAdd(a, b)); break;
      case 'sub2': a = r(31, 98); b = r(12, a - 10); if (borrows(a, b) === 1 && a - b >= 10) return finalize(buildSub(a, b)); break;
      case 'sub3': a = r(120, 980); b = r(25, a - 20); if (borrows(a, b) >= 1 && a - b >= 10) return finalize(buildSub(a, b)); break;
      case 'sub3z': a = r(1, 9) * 100 + r(1, 9); b = r(102, a - 50); if (a > 150 && borrows(a, b) >= 2 && Math.floor(b / 10) % 10 > 0) return finalize(buildSub(a, b)); break;
      case 'sub4': a = r(2000, 9800); b = r(300, a - 100); if (borrows(a, b) >= 2 && a - b >= 100) return finalize(buildSub(a, b)); break;
      case 'div2': { const d = r(2, 4); const q = r(12, 49); a = q * d; if (a < 100 && Math.floor(a / 10) >= d && q % 10) return finalize(buildDiv(a, d)); break; }
      case 'div3': { const d = r(3, 9); const q = r(12, 99); a = q * d; if (a >= 100 && a < 1000 && Math.floor(a / 100) < d && q % 10) return finalize(buildDiv(a, d)); break; }
      default: throw new Error(`unknown template ${template}`);
    }
  }
  throw new Error(`failed to generate ${template}`);
}

export const _internal = { buildAdd, buildSub, buildMul, buildDiv, buildH, buildRecipe, decStr };
