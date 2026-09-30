// Skill tree for grades 1-6 (calculation only). See docs/curriculum.md.
// Each skill: id, name (shown on screen), grade, lane (tree column),
// req (all must be mastered to unlock), gen (generator + params, problems.js).

export const LANES = ['Add & subtract', 'Multiply & divide', 'Decimals & fractions', 'More math'];

// Mastery / unlock rule (provisional): 5 first-try clears in the last 6 attempts.
export const MASTERY = { window: 6, need: 5 };

export const SKILLS = [
  // ---------------------------------------------------------------- grade 1
  { id: 'g1-compose10', name: 'Make 10', grade: 1, lane: 0, req: [], gen: ['compose', { total: 10 }] },
  { id: 'g1-add-nc', name: '1-digit addition', grade: 1, lane: 0, req: [], gen: ['hadd', { a: [1, 9], b: [1, 9], carry: 'none' }] },
  { id: 'g1-sub-nb', name: 'Subtraction within 10', grade: 1, lane: 0, req: ['g1-add-nc'], gen: ['hsub', { a: [2, 10], b: [1, 9], borrow: 'none' }] },
  { id: 'g1-add-c', name: 'Addition with carrying', grade: 1, lane: 0, req: ['g1-compose10', 'g1-add-nc'], gen: ['hadd', { a: [2, 9], b: [2, 9], carry: 'yes' }] },
  { id: 'g1-sub-b', name: 'Subtraction with borrowing', grade: 1, lane: 0, req: ['g1-add-c', 'g1-sub-nb'], gen: ['hsub', { a: [11, 18], b: [2, 9], borrow: 'yes' }] },
  { id: 'g1-add3', name: 'Add and subtract 3 numbers', grade: 1, lane: 0, req: ['g1-sub-b'], gen: ['add3', {}] },
  { id: 'g1-add-2d1', name: '2 digits + 1 digit', grade: 1, lane: 0, req: ['g1-add-c'], gen: ['hadd', { a: [11, 89], b: [1, 9], carry: 'none', tensToo: true }] },
  { id: 'g1-sub-2d1', name: '2 digits − 1 digit', grade: 1, lane: 0, req: ['g1-sub-b', 'g1-add-2d1'], gen: ['hsub', { a: [11, 99], b: [1, 9], borrow: 'none', tensToo: true }] },

  // ---------------------------------------------------------------- grade 2
  { id: 'g2-vadd2-nc', name: '2-digit column addition', grade: 2, lane: 0, req: ['g1-add-2d1'], gen: ['vadd', { da: 2, db: 2, carry: 'none', maxDigits: 2 }] },
  { id: 'g2-vadd2-c', name: 'Column addition with carrying', grade: 2, lane: 0, req: ['g2-vadd2-nc', 'g1-add-c'], gen: ['vadd', { da: 2, db: [1, 2], carry: 'some', maxDigits: 2 }] },
  { id: 'g2-vsub2-nb', name: '2-digit column subtraction', grade: 2, lane: 0, req: ['g1-sub-2d1'], gen: ['vsub', { da: 2, db: 2, borrow: 'none' }] },
  { id: 'g2-vsub2-b', name: 'Column subtraction with borrowing', grade: 2, lane: 0, req: ['g2-vsub2-nb', 'g1-sub-b'], gen: ['vsub', { da: 2, db: [1, 2], borrow: 'some' }] },
  { id: 'g2-vadd3s', name: 'Addition past 100', grade: 2, lane: 0, req: ['g2-vadd2-c'], gen: ['vadd', { da: 2, db: 2, carry: 'many', maxDigits: 3 }] },
  { id: 'g2-vsub3s', name: 'Subtraction from 100–199', grade: 2, lane: 0, req: ['g2-vsub2-b', 'g2-vadd3s'], gen: ['vsub', { da: 3, db: 2, borrow: 'some', aMax: 199 }] },
  { id: 'g2-kuku25', name: '2 and 5 times tables', grade: 2, lane: 1, req: ['g1-add-c'], gen: ['kuku', { dans: [5, 2] }] },
  { id: 'g2-kuku34', name: '3 and 4 times tables', grade: 2, lane: 1, req: ['g2-kuku25'], gen: ['kuku', { dans: [3, 4] }] },
  { id: 'g2-kuku67', name: '6 and 7 times tables', grade: 2, lane: 1, req: ['g2-kuku34'], gen: ['kuku', { dans: [6, 7] }] },
  { id: 'g2-kuku891', name: '1, 8, and 9 times tables', grade: 2, lane: 1, req: ['g2-kuku67'], gen: ['kuku', { dans: [8, 9, 1] }] },
  { id: 'g2-kuku-mix', name: 'Mixed times tables', grade: 2, lane: 1, req: ['g2-kuku891'], gen: ['kuku', { dans: [1, 2, 3, 4, 5, 6, 7, 8, 9] }] },
  { id: 'g2-mul-tens', name: 'Tens × 1 digit', grade: 2, lane: 1, req: ['g2-kuku-mix'], gen: ['mulTens', {}] },
  { id: 'g2-frac-of', name: 'Halves and quarters', grade: 2, lane: 2, req: ['g2-kuku25'], gen: ['fracOf', { dens: [2, 4] }] },

  // ---------------------------------------------------------------- grade 3
  { id: 'g3-vadd3', name: '3-digit addition', grade: 3, lane: 0, req: ['g2-vadd3s'], gen: ['vadd', { da: 3, db: 3, carry: 'some', maxDigits: 3 }] },
  { id: 'g3-vsub3', name: '3-digit subtraction', grade: 3, lane: 0, req: ['g2-vsub3s'], gen: ['vsub', { da: 3, db: [2, 3], borrow: 'some' }] },
  { id: 'g3-vadd4', name: '4-digit addition', grade: 3, lane: 0, req: ['g3-vadd3'], gen: ['vadd', { da: 4, db: [3, 4], carry: 'many', maxDigits: 4 }] },
  { id: 'g3-vsub4', name: '4-digit subtraction', grade: 3, lane: 0, req: ['g3-vsub3'], gen: ['vsub', { da: 4, db: [3, 4], borrow: 'zero' }] },
  { id: 'g3-div-basic', name: 'Division', grade: 3, lane: 1, req: ['g2-kuku-mix'], gen: ['div', { exact: true }] },
  { id: 'g3-div-rem', name: 'Division with remainders', grade: 3, lane: 1, req: ['g3-div-basic'], gen: ['divRem', {}] },
  { id: 'g3-div-tens', name: 'Tens ÷ 1 digit', grade: 3, lane: 1, req: ['g3-div-basic'], gen: ['divTens', {}] },
  { id: 'g3-vmul-2x1', name: '2 digits × 1 digit', grade: 3, lane: 1, req: ['g2-mul-tens'], gen: ['vmul', { da: 2, db: 1 }] },
  { id: 'g3-vmul-3x1', name: '3 digits × 1 digit', grade: 3, lane: 1, req: ['g3-vmul-2x1'], gen: ['vmul', { da: 3, db: 1 }] },
  { id: 'g3-vmul-2x2', name: '2 digits × 2 digits', grade: 3, lane: 1, req: ['g3-vmul-2x1'], gen: ['vmul', { da: 2, db: 2 }] },
  { id: 'g3-vmul-3x2', name: '3 digits × 2 digits', grade: 3, lane: 1, req: ['g3-vmul-2x2', 'g3-vmul-3x1'], gen: ['vmul', { da: 3, db: 2 }] },
  { id: 'g3-dec-add1', name: 'Decimal addition', grade: 3, lane: 2, req: ['g2-vadd2-c'], gen: ['vdec', { op: 'add', places: 1 }] },
  { id: 'g3-dec-sub1', name: 'Decimal subtraction', grade: 3, lane: 2, req: ['g3-dec-add1', 'g2-vsub2-b'], gen: ['vdec', { op: 'sub', places: 1 }] },
  { id: 'g3-frac-same', name: 'Add and subtract fractions', grade: 3, lane: 2, req: ['g2-frac-of'], gen: ['frac', { op: 'addsub', same: true, maxOne: true }] },

  // ---------------------------------------------------------------- grade 4
  { id: 'g4-vdiv-2d1', name: 'Long division: 2 digits ÷ 1 digit', grade: 4, lane: 1, req: ['g3-div-rem', 'g3-div-tens'], gen: ['vdiv', { dd: 2, ds: 1 }] },
  { id: 'g4-vdiv-3d1', name: '3 digits ÷ 1 digit', grade: 4, lane: 1, req: ['g4-vdiv-2d1'], gen: ['vdiv', { dd: 3, ds: 1 }] },
  { id: 'g4-vdiv-2d2', name: '2 digits ÷ 2 digits', grade: 4, lane: 1, req: ['g4-vdiv-2d1', 'g3-vmul-2x1'], gen: ['vdiv', { dd: 2, ds: 2 }] },
  { id: 'g4-vdiv-3d2', name: '3 digits ÷ 2 digits', grade: 4, lane: 1, req: ['g4-vdiv-2d2', 'g4-vdiv-3d1'], gen: ['vdiv', { dd: 3, ds: 2 }] },
  { id: 'g4-order', name: 'Order of operations', grade: 4, lane: 3, req: ['g2-kuku-mix', 'g2-vsub2-b'], gen: ['order', {}] },
  { id: 'g4-round', name: 'Rounding numbers', grade: 4, lane: 3, req: ['g3-vadd4'], gen: ['round', {}] },
  { id: 'g4-dec-add2', name: 'Add and subtract hundredths', grade: 4, lane: 2, req: ['g3-dec-sub1'], gen: ['vdec', { op: 'addsub', places: 2 }] },
  { id: 'g4-dec-mul', name: 'Decimal × whole number', grade: 4, lane: 2, req: ['g4-dec-add2', 'g3-vmul-2x1'], gen: ['vmul', { da: 2, db: 1, pa: 1 }] },
  { id: 'g4-dec-div', name: 'Decimal ÷ whole number', grade: 4, lane: 2, req: ['g4-dec-mul', 'g4-vdiv-2d1'], gen: ['decDivInt', {}] },
  { id: 'g4-frac-mixed', name: 'Add and subtract mixed numbers', grade: 4, lane: 2, req: ['g3-frac-same'], gen: ['frac', { op: 'addsub', same: true, mixed: true }] },

  // ---------------------------------------------------------------- grade 5
  { id: 'g5-dec-mul', name: 'Decimal × decimal', grade: 5, lane: 2, req: ['g4-dec-mul'], gen: ['vmul', { da: 2, db: 2, pa: 1, pb: 1 }] },
  { id: 'g5-dec-div', name: 'Decimal ÷ decimal', grade: 5, lane: 2, req: ['g4-dec-div', 'g5-dec-mul'], gen: ['decDivDec', {}] },
  { id: 'g5-gcd', name: 'Greatest common factor', grade: 5, lane: 3, req: ['g3-div-basic'], gen: ['gcdlcm', { kind: 'gcd' }] },
  { id: 'g5-lcm', name: 'Least common multiple', grade: 5, lane: 3, req: ['g5-gcd'], gen: ['gcdlcm', { kind: 'lcm' }] },
  { id: 'g5-frac-reduce', name: 'Simplify fractions', grade: 5, lane: 2, req: ['g5-gcd', 'g4-frac-mixed'], gen: ['frac', { op: 'reduce' }] },
  { id: 'g5-frac-diff', name: 'Fractions with unlike denominators', grade: 5, lane: 2, req: ['g5-frac-reduce', 'g5-lcm'], gen: ['frac', { op: 'addsub', same: false }] },
  { id: 'g5-frac-int', name: 'Fractions × or ÷ whole numbers', grade: 5, lane: 2, req: ['g5-frac-reduce'], gen: ['frac', { op: 'muldivInt' }] },
  { id: 'g5-percent', name: 'Percentages', grade: 5, lane: 3, req: ['g4-dec-mul'], gen: ['percent', {}] },

  // ---------------------------------------------------------------- grade 6
  { id: 'g6-frac-mul', name: 'Fraction × fraction', grade: 6, lane: 2, req: ['g5-frac-int'], gen: ['frac', { op: 'mul' }] },
  { id: 'g6-frac-div', name: 'Fraction ÷ fraction', grade: 6, lane: 2, req: ['g6-frac-mul'], gen: ['frac', { op: 'div' }] },
  { id: 'g6-frac-dec', name: 'Decimals and fractions', grade: 6, lane: 2, req: ['g6-frac-div', 'g5-dec-div'], gen: ['frac', { op: 'decimal' }] },
  { id: 'g6-ratio', name: 'Equivalent ratios', grade: 6, lane: 3, req: ['g5-lcm'], gen: ['ratio', {}] },
  { id: 'g6-letter', name: 'Find x', grade: 6, lane: 3, req: ['g4-order'], gen: ['letter', {}] },
];

export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Depth in the tree = longest prerequisite chain (roots are 0).
export const DEPTH = (() => {
  const memo = {};
  const d = (id) => memo[id] ?? (memo[id] = SKILL[id].req.length ? 1 + Math.max(...SKILL[id].req.map(d)) : 0);
  for (const s of SKILLS) d(s.id);
  return memo;
})();

export const skillsOfGrade = (g) => SKILLS.filter((s) => s.grade === g);
