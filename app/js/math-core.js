// One Rust/WASM instance owns calculation and learning rules. This bridge only
// copies serializable data; it never substitutes a JavaScript game engine.
let wasm = null;
let pending = null;
let lastError = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getCoreStatus() {
  return { ready: !!wasm, backend: 'rust-wasm', error: lastError };
}
export const isRustReady = () => !!wasm;

// bytes is optional for Node tests. Browser URLs stay relative on GitHub Pages.
export async function initCore(bytes = null) {
  if (wasm) return getCoreStatus();
  if (pending) return pending;
  pending = (async () => {
    try {
      let result;
      if (bytes) result = await WebAssembly.instantiate(bytes, {});
      else {
        const response = await fetch(new URL('../wasm/dopa_core.wasm', import.meta.url));
        if (!response.ok) throw new Error(`Math engine download failed (${response.status})`);
        // A byte-buffer instantiation also works on hosts serving a generic MIME.
        result = await WebAssembly.instantiate(await response.arrayBuffer(), {});
      }
      wasm = result.instance.exports;
      lastError = null;
      console.info('Dopa Drill: Rust/WASM math engine ready');
      return getCoreStatus();
    } catch (error) {
      lastError = error.message;
      throw new Error(`The Rust math engine could not start: ${error.message}`, { cause: error });
    } finally { pending = null; }
  })();
  return pending;
}

function engine() {
  if (!wasm) throw new Error('Rust math engine is not ready. Await initCore() before playing.');
  return wasm;
}
function resultAt(ptr) {
  const core = engine();
  // Decode before another call overwrites the reusable output buffer.
  const response = JSON.parse(decoder.decode(new Uint8Array(core.memory.buffer, ptr, core.core_output_len())));
  if (!response.ok) throw new Error(response.error);
  return response.value;
}
export function coreCall(op, args = {}) {
  const core = engine();
  const input = encoder.encode(JSON.stringify({ op, args }));
  const ptr = core.core_alloc(input.length);
  try {
    new Uint8Array(core.memory.buffer, ptr, input.length).set(input);
    return resultAt(core.core_call(ptr, input.length));
  } finally { core.core_dealloc(ptr, input.length); }
}
export function generateRecipe(skillIndex, rng) {
  const core = engine();
  // A seed-aware stream maintains exact original generator consumption. Generic
// RNG callbacks are supported by deriving a seed, not by crossing WASM per draw.
  const seed = typeof rng.getState === 'function' ? rng.getState() : Math.floor(rng() * 4294967296) >>> 0;
  const out = resultAt(core.core_generate(skillIndex, seed));
  if (typeof rng.setState === 'function') rng.setState(out.seed);
  return out.recipe;
}
export function checkDigit(expected, entered) {
  if (!/^\d$/.test(String(expected)) || !/^\d$/.test(String(entered))) return false;
  return !!engine().check_digit(Number(expected), Number(entered));
}
export const gcd = (a, b) => engine().gcd(a, b);
export const countCarries = (a, b) => engine().count_carries(a, b);
export const countBorrows = (a, b) => engine().count_borrows(a, b);
export const extraPoints = (k) => engine().extra_points(k);
export const extraTotal = (n) => engine().extra_total(n);
export const basicDopaL = (fraction) => engine().basic_dopa_l(fraction);
export const extraDopaL = (n) => engine().extra_dopa_l(n);
export const extraProblemGain = (k) => engine().extra_problem_gain(k);
export const comboMult = (combo) => engine().combo_mult(combo);
export const addDopa = (level, base, combo) => engine().add_dopa(level, base, combo);
export const comboWindowMs = (grade = 3, first = false) => engine().combo_window(grade || 3, Number(first));
export const comboMilestone = (combo) => !!engine().combo_milestone(combo);

// Rust returns immutable JSON; reconcile it into the original JS objects so
// callers holding a skill/quest reference keep observing updates.
export function syncInto(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    for (let i = 0; i < source.length; i++) {
      const value = source[i];
      if (value && typeof value === 'object' && target[i] && typeof target[i] === 'object' && Array.isArray(value) === Array.isArray(target[i])) syncInto(target[i], value);
      else target[i] = value;
    }
    target.length = source.length;
  } else {
    for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object' && Array.isArray(value) === Array.isArray(target[key])) syncInto(target[key], value);
      else target[key] = value;
    }
  }
  return target;
}
