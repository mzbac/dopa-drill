// Small dependency-free preview with GitHub Pages project-path parity.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('app');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain' };
createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') { res.writeHead(302, { Location: '/dopa-drill/' }); res.end(); return; }
  if (!path.startsWith('/dopa-drill/')) { res.writeHead(404); res.end('Not found'); return; }
  const file = resolve(root, path.slice('/dopa-drill/'.length) || 'index.html');
  if (!file.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  try { const bytes = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(bytes); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '0.0.0.0', () => console.log(`Dopa Drill: http://localhost:${port}/dopa-drill/`));
