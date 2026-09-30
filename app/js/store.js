import { coreCall, syncInto } from './math-core.js';
// Local-only persistence (localStorage). Nothing is sent to a server.
// Every read tolerates missing, blocked, or corrupted storage.

const KEY = 'dopa-drill:v1';
const VERSION = 1;

export function defaultState() {
  return {
    version: VERSION,
    guideSeen: false,
    settings: { count: 10, sound: true, volume: 0.8, motion: null },
    history: [],
  };
}

function backend() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

let cache = null;
let lastSaveSucceeded = null;
export const saveStatus = () => lastSaveSucceeded;

export function load(storage = backend()) {
  if (cache) return cache;
  const base = defaultState();
  let raw = null;
  try { raw = storage ? storage.getItem(KEY) : null; } catch { raw = null; }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.version === VERSION) {
        const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
        base.settings = {
          count: [6, 10, 14].includes(settings.count) ? settings.count : 10,
          sound: typeof settings.sound === 'boolean' ? settings.sound : true,
          volume: Number.isFinite(settings.volume) ? Math.max(0, Math.min(1, settings.volume)) : 0.8,
          motion: settings.motion === null || !Number.isFinite(settings.motion) ? null : Math.max(0, Math.min(1, settings.motion)),
        };
        base.history = Array.isArray(data.history) ? data.history : [];
        base.guideSeen = data.guideSeen === true;
        for (const [k, v] of Object.entries(data)) if (!(k in base)) base[k] = v;
      }
    } catch { /* corrupted: start fresh */ }
  }
  cache = base;
  return cache;
}

export function save(storage = backend()) {
  let saved = false;
  if (cache && storage) {
    try { storage.setItem(KEY, JSON.stringify(cache)); saved = true; } catch { /* Keep this visit playable. */ }
  }
  lastSaveSucceeded = saved;
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('dopa-storage', { detail: saved }));
  return saved;
}

export function settings() { return load().settings; }

export function hasSeenGuide() { return load().guideSeen === true; }
export function markGuideSeen() { load().guideSeen = true; save(); }

export function updateSettings(patch) {
  Object.assign(load().settings, patch);
  save();
}

// ---------------------------------------------------------------- history
const MAX_HISTORY = 3000;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// rec: { mode, score, ok, ng, timeMs, dopaL, ... }; returns the stored entry.
export function addRecord(rec, at = new Date()) {
  const st = load();
  const entry = { id: `${at.getTime().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, day: dayKey(at), at: at.getTime(), ...rec };
  st.history.push(entry);
  if (st.history.length > MAX_HISTORY) st.history.splice(0, st.history.length - MAX_HISTORY);
  save();
  return entry;
}

export function updateRecord(id, patch) {
  const e = load().history.find((h) => h.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  save();
  return e;
}

// Map of day -> { best, plays, entries } for one month (month: 0-11).
export function monthSummary(year, month) {
  return coreCall('storeMonthSummary',{state:{history:load().history},year,month});
}

export function playedDays() { return new Set(load().history.map((h) => h.day)); }
// Days made "no count" with the hammer (id034): they keep a streak going
// but are not counted as played.
export const nocountDays = () => load().nocount || {};
// Project only calendar/reward data. Skill histories never cross this ABI.
const calendarState = () => { const st=load();return {
  history:st.history.map(({day})=>({day})),nocount:st.nocount,
  items:st.items,bonus:st.bonus,
}; };
function rewardOperation(op,args={}) {
  const st=load();
  const state=(op==='storeItems'||op==='storeAddHammer')?{items:st.items}:calendarState();
  const out=coreCall(op,{state,...args});
  for(const key of ['items','nocount','bonus']) if(key in out.state) {
    if(st[key] && typeof st[key]==='object') syncInto(st[key],out.state[key]);
    else st[key]=out.state[key];
  }
  return out.result;
}
export const streak = (today=new Date()) => coreCall('storeStreak',{state:calendarState(),today:dayKey(today)});
export const bestStreak = () => coreCall('storeBestStreak',{state:calendarState()});

// ---------------------------------------------------------------- items (id034)
// The first item: the "no count" hammer. One hammer turns one missed day into
// a no-count day. Provisional: at most 3 held, only for the last 7 days, one
// given at the start; more come from completing the daily quests (id035).
export const HAMMER = { max: 3, reach: 7, first: 1 };
export function items() { rewardOperation('storeItems');return load().items; }
export function addHammer(n=1) { const added=rewardOperation('storeAddHammer',{n});save();return added; }
export function hammerOffer(today=new Date()) { return rewardOperation('storeHammerOffer',{today:dayKey(today)}); }
export function declineHammer(today = new Date()) { items().asked = dayKey(today); save(); }
export function useHammer(days,today=new Date()) {
  const result=rewardOperation('storeUseHammer',{days,today:dayKey(today),at:today.getTime()});
  if(result) save();return result;
}

// ---------------------------------------------------------------- login bonus
// A 7-day stamp card: the first visit of a day earns one sticker; day 7 is
// special. Missing a day restarts the card from day 1.
export const STICKERS = ['star', 'heart', 'flower', 'note', 'clover', 'hanamaru', 'crown'];

export function claimLogin(today=new Date()) {
  const result=rewardOperation('storeClaimLogin',{today:dayKey(today)});
  if(result) save();return result;
}

export const stickerOn = (key) => (load().bonus?.stickers || {})[key] || null;
export const bonusState = () => load().bonus || { last: null, run: 0, stickers: {}, total: 0 };

// Erase all versions of this app's data, including the in-memory copy.
export function reset(storage = backend()) {
  cache = null;
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith('dopa-drill')) {
        try { storage.removeItem(key); } catch { /* Keep trying the remaining keys. */ }
      }
    }
  } catch { /* Storage may be unavailable or blocked. */ }
}
