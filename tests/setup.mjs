import { readFile } from 'node:fs/promises';
import { initCore } from '../app/js/math-core.js';
await initCore(await readFile(new URL('../app/wasm/dopa_core.wasm', import.meta.url)));
