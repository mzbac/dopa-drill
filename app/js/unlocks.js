// Unlockable show (id041): backgrounds, correct marks, particles, music,
// Dopakichi's costume and colour, the crowd and the finale. Each item is the
// reward of one trophy (never random), so what is unlocked follows from the
// trophies earned; only the player's choice per category is saved.
import { TROPHY } from './trophies.js';
import { coreCall } from './math-core.js';

export const CATS = [
  { key: 'bg', name: 'Backgrounds' },
  { key: 'mark', name: 'Correct-answer marks' },
  { key: 'particle', name: 'Confetti' },
  { key: 'music', name: 'Music' },
  { key: 'costume', name: 'Outfits' },
  { key: 'color', name: 'Dopakichi colors' },
  { key: 'crowd', name: 'Crowd' },
  { key: 'finale', name: 'Finale' },
];

// base: available from the start. trophy: the trophy whose reward it is.
export const ITEMS = [];
export const ITEM = {};
export function addItems(list) {
  for (const it of list) {
    ITEMS.push(it); ITEM[it.id] = it;
    if (it.trophy && TROPHY[it.trophy]) TROPHY[it.trophy].reward = it.id;
  }
}
addItems([
  { id: 'bg:classic', cat: 'bg', name: 'Sunburst', base: true },
  { id: 'mark:hanamaru', cat: 'mark', name: 'Flower stamp', base: true },
  { id: 'particle:classic', cat: 'particle', name: 'Confetti', base: true },
  { id: 'music:classic', cat: 'music', name: 'Marimba march', base: true },
  { id: 'costume:none', cat: 'costume', name: 'None', base: true },
  { id: 'color:pink', cat: 'color', name: 'Pink', base: true },
  { id: 'crowd:classic', cat: 'crowd', name: 'Colorful crowd', base: true },
  { id: 'finale:classic', cat: 'finale', name: 'Giant Dopakichi', base: true },
]);
// id041: one sample per category, to prove the pipeline end to end.
// Rewards follow effort and coming back (plays, days, streaks, stars earned by
// practice), not the placement check, which can master many skills at once.
addItems([
  { id: 'costume:cap', cat: 'costume', name: 'Cap', trophy: 'days-1' },
  { id: 'particle:note', cat: 'particle', name: 'Music notes', trophy: 'days-3' },
  { id: 'mark:stamp', cat: 'mark', name: 'Great job stamp', trophy: 'plays-3' },
  { id: 'bg:night', cat: 'bg', name: 'Night sky', trophy: 'streak-3' },
  { id: 'color:blue', cat: 'color', name: 'Blue', trophy: 'plays-5' },
  { id: 'finale:fireworks', cat: 'finale', name: 'Fireworks show', trophy: 'extras-5' },
  { id: 'music:chip', cat: 'music', name: '8-bit', trophy: 'plays-10' },
  { id: 'crowd:costume', cat: 'crowd', name: 'Dress-up crowd', trophy: 'firstTry-50' },
]);
// id042: backgrounds, correct marks and particles.
addItems([
  { id: 'bg:sea', cat: 'bg', name: 'Ocean bubbles', trophy: 'problems-100' },
  { id: 'bg:festival', cat: 'bg', name: 'Festival', trophy: 'days-15' },
  { id: 'bg:paper', cat: 'bg', name: 'Paper crafts', trophy: 'problems-200' },
  { id: 'bg:space', cat: 'bg', name: 'Space', trophy: 'extras-10' },
  { id: 'mark:medal', cat: 'mark', name: 'Medal', trophy: 'streak-7' },
  { id: 'mark:crown', cat: 'mark', name: 'Crown', trophy: 'perfects-3' },
  { id: 'mark:ring', cat: 'mark', name: 'Firework ring', trophy: 'combo-30' },
  { id: 'particle:petal', cat: 'particle', name: 'Flower petals', trophy: 'stickers-7' },
  { id: 'particle:digit', cat: 'particle', name: 'Numbers', trophy: 'cells-1000' },
  { id: 'particle:bubble', cat: 'particle', name: 'Bubbles', trophy: 'review-10' },
  { id: 'particle:candy', cat: 'particle', name: 'Candy', trophy: 'extraBest-10' },
]);
// id043: songs (8-bit is the id041 sample).
addItems([
  { id: 'music:matsuri', cat: 'music', name: 'Festival rhythm', trophy: 'streak-5' },
  { id: 'music:brass', cat: 'music', name: 'Brass band', trophy: 'days-5' },
  { id: 'music:electro', cat: 'music', name: 'Electro', trophy: 'extras-3' },
]);
// id044: costumes, colours, crowd and finales (id045 moved three rewards to the new series).
addItems([
  { id: 'costume:hachimaki', cat: 'costume', name: 'Headband', trophy: 'problems-50' },
  { id: 'costume:cape', cat: 'costume', name: 'Cape', trophy: 'combo-20' },
  { id: 'costume:glasses', cat: 'costume', name: 'Round glasses', trophy: 'firstTry-100' },
  { id: 'costume:ribbon', cat: 'costume', name: 'Ribbon', trophy: 'stickers-14' },
  { id: 'costume:crown', cat: 'costume', name: 'Crown', trophy: 'streak-14' },
  { id: 'costume:wizard', cat: 'costume', name: 'Wizard hat', trophy: 'star5-1' },
  { id: 'costume:headphones', cat: 'costume', name: 'Headphones', trophy: 'capsules-1' },
  { id: 'color:mint', cat: 'color', name: 'Mint green', trophy: 'days-7' },
  { id: 'color:snow', cat: 'color', name: 'Snow white', trophy: 'questDays-7' },
  { id: 'color:yellow', cat: 'color', name: 'Yellow', trophy: 'problems-300' },
  { id: 'color:violet', cat: 'color', name: 'Purple', trophy: 'extraSolved-100' },
  { id: 'color:gold', cat: 'color', name: 'Gold', trophy: 'streak-30' },
  { id: 'color:rainbow', cat: 'color', name: 'Rainbow', trophy: 'days-100' },
  { id: 'crowd:rainbow', cat: 'crowd', name: 'Rainbow crowd', trophy: 'days-30' },
  { id: 'crowd:twins', cat: 'crowd', name: 'Matching crowd', trophy: 'starsTotal-100' },
  { id: 'finale:parade', cat: 'finale', name: 'Parade', trophy: 'streak-10' },
  { id: 'finale:rocket', cat: 'finale', name: 'Rocket', trophy: 'extras-20' },
]);

// Cosmetic eligibility and random selection are non-UI rules in Rust.
export const isUnlocked = (item,got={}) => coreCall('isItemUnlocked',{item,got});
// One eligibility batch for collection totals; labels and asset IDs stay in JS.
// The count needs neither category-completion work nor display metadata.
export const collectionCount = (got={}) => coreCall('collectionMetrics',{
  got,items:ITEMS.map(({base,trophy})=>({base,trophy})),
}).itemsOwned;
export const unlockedIn = (cat,got) => coreCall('unlockedIn',{cat,got,items:ITEMS}).map(item=>ITEM[item.id]);
export const defaultEquip = () => coreCall('defaultEquip',{cats:CATS});
export function pickLook(equip={},got={},rng=Math.random) {
  const args={equip,got,items:ITEMS,cats:CATS};
  // Ask how many random draws are needed before drawing, preserving generic
  // caller-owned RNG streams even when some categories have fixed choices.
  const {consumed}=coreCall('pickLook',{...args,random:[]});
  return coreCall('pickLook',{...args,random:Array.from({length:consumed},()=>rng())}).result;
}
// Asset-name suffix decoding is presentation, kept local to animation frames.
export const variant = (id) => id ? id.split(':')[1] : 'classic';
