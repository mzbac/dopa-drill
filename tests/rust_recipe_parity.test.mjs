import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generateRecipe} from '../app/js/math-core.js';
import {makeRng} from '../app/js/problems.js';
import {SKILLS} from '../app/js/skills.js';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
test('29,000 complete recipes, teaching models and RNG states match pre-optimization Rust', async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/full-recipe-parity.json',import.meta.url),'utf8'));
  for(const [index,skill] of SKILLS.entries()){
    const rng=makeRng(fixture.seedBase+index),values=[];
    for(let i=0;i<fixture.perSkill;i++){
      const recipe=generateRecipe(index,rng);
      values.push(canonical({recipe,seed:rng.getState()}));
    }
    assert.equal(createHash('sha256').update(JSON.stringify(values)).digest('hex'),fixture.skills[skill.id],skill.id);
  }
});
