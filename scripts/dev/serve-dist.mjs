#!/usr/bin/env node
/**
 * Static server over dist/ that resolves URLs the way Cloudflare Pages does.
 *
 * US-570 prerenders each route to `dist/<route>/index.html`, and Pages serves
 * those files directly -- public/_redirects says so in its own closing comment:
 * "Static files are served first, then index.html for all other routes".
 *
 * `vite preview` does NOT do this. It SPA-falls-back, so a request for /pricing
 * comes back as the 106kb prerendered homepage instead of the 70kb
 * dist/pricing/index.html that production actually serves. Asserting SEO
 * against it would compare every route to the homepage's <head> and call it
 * correct. Neither does the prerenderer's own server, which deliberately serves
 * the pre-prerender shell for anything without a file extension -- it has to,
 * or rendering `/` first would make every later route boot from an
 * already-prerendered homepage.
 *
 * So this exists as the third one: the server that answers "what does a crawler
 * receive", which is the question US-570 is about.
 *
 * Resolution order, matching Pages:
 *   1. the exact file
 *   2. <path>/index.html      <- the prerendered route
 *   3. <path>.html
 *   4. index.html with 200    <- SPA fallback for client-only routes
 *
 * What it does NOT model: _redirects (the 301/302 rules) and _headers. A test
 * that needs those needs `wrangler pages dev`, not this.
 *
 * Usage: node scripts/dev/serve-dist.mjs [--dist dist] [--port 4173]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const DIST = path.resolve(projectRoot, getArg('dist', 'dist'));
const PORT = Number(getArg('port', process.env.PORT || 4173));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const isFile = (p) => {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
};

/** The candidate list Pages walks, in order. Exported so a test can pin it. */
export function resolveCandidates(distDir, pathname) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const joined = path.join(distDir, clean);
  return [joined, path.join(joined, 'index.html'), `${joined}.html`];
}

export function resolveRequest(distDir, pathname) {
  for (const candidate of resolveCandidates(distDir, pathname)) {
    // Traversal guard: a decoded `..` must not escape dist/.
    if (candidate !== distDir && !candidate.startsWith(distDir + path.sep)) continue;
    if (isFile(candidate)) return { file: candidate, fallback: false };
  }
  const shell = path.join(distDir, 'index.html');
  return isFile(shell) ? { file: shell, fallback: true } : null;
}

/**
 * Everything above is pure and importable; everything below only runs when this
 * file is the entry point. A module that binds a port the moment it is imported
 * cannot be unit tested, and resolveRequest is the part worth testing.
 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export function startServer(distDir = DIST, port = PORT) {
  const server = createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Bad Request');
      return;
    }

    const hit = resolveRequest(distDir, pathname);
    if (!hit) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }

    try {
      const body = await readFile(hit.file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(hit.file)] || 'application/octet-stream',
        // Names which of the four rules answered, so a test that gets the shell
        // when it expected a prerendered route can tell the difference.
        'X-Served-By': hit.fallback ? 'spa-fallback' : 'static',
      });
      res.end(body);
    } catch {
      res.writeHead(500).end('Internal Server Error');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[serve-dist] ${distDir} on http://127.0.0.1:${port} (Pages-style resolution)`);
  });
  return server;
}

if (isMain) {
  if (!existsSync(DIST)) {
    console.error(`[serve-dist] ${DIST} does not exist. Run \`npm run build\` first.`);
    process.exit(1);
  }
  startServer();
}
