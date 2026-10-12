import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILES = new Set(['/data/presets.json', '/data/exchange-rates.json']);
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;

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
  const root = DATA_FILES.has(pathname) ? ROOT : PUBLIC_DIR;
  const file = path.resolve(root, `.${pathname}`);
  const allowed = DATA_FILES.has(pathname) ? DATA_DIR : PUBLIC_DIR;
  return file.startsWith(allowed + path.sep) ? file : null;
}

// Files are read from disk on every request, so editing a data file and
// reloading the page is enough.
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'Bad Request');
  }
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
  console.log(`Income rate matrix: http://${HOST}:${PORT}`);
});
