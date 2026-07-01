import { createReadStream, existsSync, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 4173);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

function distPathFor(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const pathname = normalizedPath === sep ? 'index.html' : normalizedPath.slice(1);
  const candidate = resolve(join(root, pathname));

  if (!candidate.startsWith(`${root}${sep}`) && candidate !== root) {
    return join(root, 'index.html');
  }

  if (!existsSync(candidate)) {
    return join(root, 'index.html');
  }

  const stats = statSync(candidate);
  return stats.isDirectory() ? join(candidate, 'index.html') : candidate;
}

function cacheControl(filePath) {
  const relative = filePath.slice(root.length + 1);
  if (relative === 'index.html' || relative === 'sw.js') {
    return 'no-store';
  }
  if (relative.startsWith('assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=3600';
}

function setHeaders(response, filePath) {
  response.setHeader('Cache-Control', cacheControl(filePath));
  response.setHeader(
    'Content-Type',
    mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
  );
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/index.html was not found. Run `pnpm run build` before starting the server.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  if (!request.url || !['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const filePath = distPathFor(request.url);

  try {
    const stats = await stat(filePath);
    setHeaders(response, filePath);
    response.setHeader('Content-Length', stats.size);
    response.writeHead(200);

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Emberbench is serving ${root} at http://${host}:${port}`);
});
