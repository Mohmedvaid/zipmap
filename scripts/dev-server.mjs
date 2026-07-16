#!/usr/bin/env node
// Static file server for local development.
//
// Usage:  npm run dev            (port 8765)
//         PORT=9000 npm run dev
//
// Exists for one reason: `python3 -m http.server` sends no Cache-Control, so
// browsers heuristically cache the ES modules and keep running stale code after
// an edit. With no bundler and no cache-busting hashes in our <script> URLs,
// there's nothing to invalidate them — you get a silently outdated app and
// debug a bug you already fixed. This sends `no-store` so a reload is always
// the current file.
//
// Dev-time only. Nothing here ships: GitHub Pages serves the repo directly.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8765;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  // Strip the query string (?data=local) before touching the filesystem.
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // normalize() collapses ".." so a crafted path can't escape the repo root.
  const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, rel);

  try {
    const info = await stat(file);
    if (info.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});

server.listen(PORT, () => {
  console.log(`[dev-server] http://localhost:${PORT}  (serving ${ROOT})`);
  console.log('[dev-server] add ?data=local to use a locally built dist/');
});
