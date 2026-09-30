import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coreCall } from '../app/js/math-core.js';
import { SKILLS } from '../app/js/skills.js';
import { TROPHIES, SERIES } from '../app/js/trophies.js';
import { ITEMS, CATS } from '../app/js/unlocks.js';
import { runRewardsScenarios } from './fixtures/rewards-scenarios.mjs';

test('Rust rewards match original-JS deterministic transcripts', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/rewards-parity.json', import.meta.url), 'utf8'));
  const actual = runRewardsScenarios(coreCall, { skills: SKILLS, trophies: TROPHIES, series: SERIES, items: ITEMS, cats: CATS });
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.deepEqual(actual[i], expected[i], expected[i].name);
});
