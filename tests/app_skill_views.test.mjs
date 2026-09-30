import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS } from '../app/js/skills.js';
import { makeRng } from '../app/js/problems.js';
import {
  emptyProgress, skillViews, stateOf, starsOf, masteryRatio,
  masterWithAncestors, recordResult, relockSkill,
} from '../app/js/session.js';

test('batched views match all individual queries for every skill across 64 saved states', () => {
  const random=makeRng(8472);
  for(let scenario=0;scenario<64;scenario++) {
    const prog=emptyProgress();
    for(const {id} of SKILLS) {
      if(random()<0.2) continue;
      prog.skills[id]={
        mastered:random()<0.4,n:Math.floor(random()*50),
        hist:Array.from({length:Math.floor(random()*7)},()=>Number(random()<0.75)),
        stars:Math.floor(random()*7)-1,
      };
    }
    prog.skills['removed-skill']={mastered:true,stars:5,hist:[1,1,1,1,1,1]};
    const before=structuredClone(prog);
    const views=skillViews(prog);
    assert.deepEqual(Object.keys(views),SKILLS.map(skill=>skill.id));
    for(const {id} of SKILLS) {
      assert.deepEqual(views[id],{
        state:stateOf(prog,id),stars:starsOf(prog,id),ratio:masteryRatio(prog,id),
      },`${scenario}: ${id}`);
    }
    assert.deepEqual(prog,before,'Snapshot reads never mutate progress');
  }
});

test('snapshots stay detached and the next call sees direct edits, mastery and relocks', () => {
  const prog=emptyProgress();
  const first=skillViews(prog);
  assert.deepEqual(first['g1-add-nc'],{state:'new',stars:0,ratio:0});
  prog.skills['g1-add-nc']={n:1,hist:[1],mastered:false,stars:0,recent:[]};
  assert.deepEqual(skillViews(prog)['g1-add-nc'],{state:'learning',stars:0,ratio:0.2});
  assert.equal(first['g1-add-nc'].state,'new');
  masterWithAncestors(prog,'g1-add-c',100);
  const mastered=skillViews(prog);
  assert.deepEqual(mastered['g1-add-c'],{state:'mastered',stars:1,ratio:1});
  assert.equal(mastered['g1-sub-nb'].state,'new');
  recordResult(prog,'g1-sub-nb',true,'question',{at:101});
  assert.equal(skillViews(prog)['g1-sub-nb'].state,'learning');
  relockSkill(prog,'g1-add-nc');
  const relocked=skillViews(prog);
  assert.equal(relocked['g1-sub-nb'].state,'locked');
  assert.equal(relocked['g1-add-c'].state,'locked');
  assert.equal(mastered['g1-sub-nb'].state,'new');
  assert.equal(mastered['g1-add-c'].state,'mastered');
});

test('batch input excludes saved question grids, timings and unknown skills', () => {
  const prog=emptyProgress();
  const record={mastered:false,n:1,hist:[1],stars:0};
  for(const key of ['times','days','first','recent']) {
    Object.defineProperty(record,key,{enumerable:true,get(){throw new Error(`Unexpected read: ${key}`);}});
  }
  prog.skills['g1-add-nc']=record;
  Object.defineProperty(prog.skills,'removed-skill',{enumerable:true,get(){throw new Error('Unexpected removed skill read');}});
  assert.deepEqual(skillViews(prog)['g1-add-nc'],{state:'learning',stars:0,ratio:0.2});
});
