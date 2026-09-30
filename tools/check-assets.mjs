import { readFile, access, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve('app');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
assert.match(html, /<html lang="en">/);
assert.doesNotMatch(html, /user-scalable=no/);
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const p = match[1];
  if (/^(https?:|data:)/.test(p)) continue;
  assert(!p.startsWith('/'), `Root-absolute path breaks Pages: ${p}`);
  await access(resolve(root, p));
}
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
for (const icon of manifest.icons) await access(resolve(root, icon.src));
for (const name of await readdir(resolve(root, 'js'))) {
  if (!name.endsWith('.js')) continue;
  const path = resolve(root, 'js', name);
  const result = spawnSync(process.execPath, ['--check', path]);
  assert.equal(result.status, 0, result.stderr.toString());
}
const wasm = await readFile(resolve(root, 'wasm/dopa_core.wasm'));
assert.equal(wasm.subarray(0, 4).toString('hex'), '0061736d');
console.log('English HTML, relative Pages assets, JS syntax, PWA icons and WASM validated');
