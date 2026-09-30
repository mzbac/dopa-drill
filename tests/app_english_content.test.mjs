import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SKILLS, LANES } from '../app/js/skills.js';
import { TROPHIES, TROPHY, CATS as TROPHY_CATS, RANK_NAME } from '../app/js/trophies.js';
import { ITEMS, CATS as ITEM_CATS } from '../app/js/unlocks.js';
import { QUESTS, DYNAMIC, questText } from '../app/js/quests.js';
import { emptyProgress, nextStar } from '../app/js/session.js';

const sourceScript = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Cyrillic}]/u;
const english = (text) => {
  assert.equal(typeof text, 'string');
  assert.ok(text.trim(), 'Visible copy must not be empty');
  assert.doesNotMatch(text, sourceScript);
};

test('all 58 skill names, trophy copy, and collectible names are English', () => {
  assert.equal(SKILLS.length, 58);
  assert.equal(TROPHIES.length, 306);
  assert.equal(ITEMS.length, 47);
  [...LANES, ...SKILLS.map((s) => s.name), ...TROPHY_CATS,
    ...Object.values(RANK_NAME), ...TROPHIES.flatMap((t) => [t.name, t.desc]),
    ...ITEM_CATS.map((c) => c.name), ...ITEMS.map((it) => it.name)].forEach(english);
  assert.ok(TROPHY_CATS.includes('Secrets'));
});

test('English trophy numbers preserve the original value and singular grammar', () => {
  assert.equal(TROPHY['dopa-4'].name, '10,000 Dopa');
  assert.equal(TROPHY['dopa-8'].name, '100 million Dopa');
  assert.equal(TROPHY['dopa-9'].name, '1 billion Dopa');
  assert.equal(TROPHY['problems-10000'].name, 'Solve 10,000 questions');
  assert.equal(TROPHY['plays-1'].desc, 'Finish 1 round in total');
  assert.equal(TROPHY['plays-3'].desc, 'Finish 3 rounds in total');
  assert.equal(TROPHY['minutes-60'].name, '1 hour');
  assert.equal(TROPHY['minutes-120'].name, '2 hours');
});

test('every daily quest, including the dynamic skill quest, has English instructions', () => {
  assert.equal(QUESTS.length + DYNAMIC.length, 12);
  for (const q of [...QUESTS, ...DYNAMIC]) english(questText({ ...q, skill: SKILLS[0].id }));
  assert.match(questText({ id: 'polish', skill: SKILLS[0].id }), /3 first-try answers/);
});

test('all next-star requirements and progress messages are English', () => {
  const prog = emptyProgress();
  const id = SKILLS[0].id;
  const record = { mastered: true, stars: 1, times: [], starDay: { 3: '2026-10-01' } };
  prog.skills[id] = record;
  for (const stars of [1, 2, 3, 4]) {
    record.stars = stars;
    const hint = nextStar(prog, id, '2026-10-03');
    english(hint.text);
    english(hint.now);
  }
  record.stars = 3;
  assert.equal(nextStar(prog, id, '2026-10-07').now, 'Try again in 1 day');
  assert.equal(nextStar(prog, id, '2026-10-08').now, 'You can try today!');
});

test('the guide has English instructions, buttons, and accessibility labels', () => {
  const guide = readFileSync(new URL('../app/js/guide.js', import.meta.url), 'utf8');
  assert.doesNotMatch(guide, sourceScript);
  assert.match(guide, /How to play/);
  assert.match(guide, /Step \$\{index \+ 1\} of \$\{pages.length\}/);
  assert.match(guide, /Let’s play!/);
});
