import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coreCall } from '../app/js/math-core.js';
import { SKILLS } from '../app/js/skills.js';
import { runProgressScenarios } from './fixtures/progress-scenarios.mjs';

// Golden transcript checks captured from the original JS implementation, before
// replacing the calculations with Rust. No original checkout is needed to run.
test('Rust progress and growth match original-JS deterministic transcripts', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/progress-parity.json', import.meta.url), 'utf8'));
  const actual = runProgressScenarios(coreCall, SKILLS);
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.deepEqual(actual[i], expected[i], expected[i].name);
});
