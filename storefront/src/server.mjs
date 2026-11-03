// Local development server: static files from dist/, everything else rendered by src/app.mjs.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, normalize } from 'node:path';
import { OUT_DIR } from './config.mjs';
import { render } from './app.mjs';

const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 4173);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith('/assets/') || path === '/cart.js') {
    const file = normalize(resolve(OUT_DIR, '.' + path));
    if (file.startsWith(OUT_DIR)) {
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
        return res.end(body);
      } catch { /* fall through */ }
    }
  }
  const out = await render(req.url);
  if (out.location) { res.writeHead(out.status, { Location: out.location }); return res.end(); }
  res.writeHead(out.status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(out.html);
}).listen(port, () => console.log(`Storefront on http://localhost:${port}`));
