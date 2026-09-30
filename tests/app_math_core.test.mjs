import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initCore, getCoreStatus, checkDigit, coreCall } from '../app/js/math-core.js';
import { makeRng, makeProblem } from '../app/js/problems.js';
import { SKILLS } from '../app/js/skills.js';

test('a real WebAssembly engine initializes once, validates digits and reports bad operations', async () => {
  assert.deepEqual(await initCore(), {ready:true,backend:'rust-wasm',error:null});
  assert.equal(getCoreStatus().ready,true);
  for(let n=0;n<=9;n++) {
    assert.equal(checkDigit(String(n),n),true);
    assert.equal(checkDigit(n,(n+1)%10),false);
  }
  for(const bad of ['',null,undefined,10,-1,'x','01']) assert.equal(checkDigit(bad,bad),false);
  assert.throws(()=>coreCall('notAnOperation'),/unknown operation/);
  assert.throws(()=>coreCall('generate',{skill:'missing',seed:0}),/unknown skill/);
});

test('Rust curriculum metadata matches the UI catalogue, all 58 skills', () => {
  assert.deepEqual(coreCall('metadata'),SKILLS.map(({id,grade,lane,req,gen})=>({id,grade,lane,req,gen})));
});

test('14,500 questions retain original seeded answers and intermediate input digits', async () => {
  const fixture=JSON.parse(await readFile(new URL('./fixtures/generator-parity.json',import.meta.url),'utf8'));
  for(const [index,skill] of SKILLS.entries()) {
    const rng=makeRng(fixture.seedBase+index),samples=[];
    for(let i=0;i<fixture.perSkill;i++) {
      const p=makeProblem(skill.id,rng);
      samples.push({kind:p.kind,a:p.a,b:p.b,rem:p.rem,answer:p.answer.replaceAll('remainder','R'),digits:p.steps.map(s=>s.digit).join('')});
    }
    assert.equal(createHash('sha256').update(JSON.stringify(samples)).digest('hex'),fixture.skills[skill.id],skill.id);
  }
});
