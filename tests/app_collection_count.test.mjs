import './setup.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, collectionCount, isUnlocked } from '../app/js/unlocks.js';

const individuallyCount = got => ITEMS.filter(item=>isUnlocked(item,got)).length;

test('one collection-count call matches individual eligibility over sparse and dense maps', () => {
  const trophies=ITEMS.filter(item=>item.trophy).map(item=>item.trophy);
  const states=[{},Object.fromEntries(trophies.map(id=>[id,1]))];
  for(let i=0;i<48;i++) {
    states.push(Object.fromEntries(trophies
      .filter((_,index)=>(index+i)%Math.max(2,i%9)!==0)
      .map((id,index)=>[id,[0,false,null,'',1,12345,'earned'][((index*3)+i)%7]])));
  }
  for(const got of states) assert.equal(collectionCount(got),individuallyCount(got));
  assert.equal(collectionCount(),ITEMS.filter(item=>item.base).length);
});

test('collection totals observe mutations immediately without caching trophy maps', () => {
  const got={};
  const base=collectionCount(got);
  for(const item of ITEMS.filter(item=>item.trophy)) {
    got[item.trophy]=17;
    assert.equal(collectionCount(got),individuallyCount(got));
  }
  assert.equal(collectionCount(got),ITEMS.length);
  for(const id of Object.keys(got)) {
    got[id]=0;
    assert.equal(collectionCount(got),individuallyCount(got));
    delete got[id];
    assert.equal(collectionCount(got),individuallyCount(got));
  }
  assert.equal(collectionCount(got),base);
});

test('count projection never reads display-only item fields', () => {
  const item=ITEMS[0];
  const name=Object.getOwnPropertyDescriptor(item,'name');
  const id=Object.getOwnPropertyDescriptor(item,'id');
  const cat=Object.getOwnPropertyDescriptor(item,'cat');
  try {
    for(const key of ['name','id','cat']) Object.defineProperty(item,key,{configurable:true,get(){throw new Error(`Display field read: ${key}`);}});
    assert.equal(typeof collectionCount({}),'number');
  } finally {
    Object.defineProperty(item,'name',name);
    Object.defineProperty(item,'id',id);
    Object.defineProperty(item,'cat',cat);
  }
});
