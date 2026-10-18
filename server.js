import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRatesProvider } from './exchange-rates.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const RATES_API = '/api/exchange-rates.json';

const getRates = createRatesProvider();

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function resolveFile(pathname) {
  if (pathname === '/') return path.join(PUBLIC_DIR, 'index.html');
  const file = path.resolve(PUBLIC_DIR, `.${pathname}`);
  return file.startsWith(PUBLIC_DIR + path.sep) ? file : null;
}

// Exchange rates for yesterday's local date are fetched from public APIs by
// /api/exchange-rates.json and cached in memory per day. If every API fails the
// endpoint answers 502 with the reason, which the page shows in its banner.
async function serveRates(req, res) {
  let body;
  try {
    body = JSON.stringify(await getRates(), null, 2);
  } catch (e) {
    return send(res, 502, e.message);
  }
  send(res, 200, req.method === 'HEAD' ? undefined : body, CONTENT_TYPES['.json']);
}

// Files are read from disk on every request. Exchange rates come from
// /api/exchange-rates.json, which is cached per day.
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (pathname === RATES_API) return serveRates(req, res);
  const file = resolveFile(pathname);
  if (!file) return send(res, 403, 'Forbidden');

  try {
    const body = await readFile(file);
    const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
    send(res, 200, req.method === 'HEAD' ? undefined : body, type);
  } catch {
    send(res, 404, 'Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Ratewise: http://${HOST}:${PORT}`);
});
