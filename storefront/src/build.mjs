// Build step: static assets into dist/, and a copy of the theme + data into bundle/
// so the server function (api/render.mjs) can read them on Vercel.
import { mkdirSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, OUT_DIR, BUNDLE_DIR } from './config.mjs';

const themeSrc = resolve(ROOT, '../shopify-theme');
const dataSrc = resolve(ROOT, '../data');

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
cpSync(resolve(themeSrc, 'assets'), resolve(OUT_DIR, 'assets'), { recursive: true });
// Temporary empty-cart response for the theme's cart badge until our own cart API exists.
writeFileSync(resolve(OUT_DIR, 'cart.js'), JSON.stringify({ item_count: 0, items: [], total_price: 0 }));

if (existsSync(themeSrc)) {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
  cpSync(themeSrc, resolve(BUNDLE_DIR, 'shopify-theme'), { recursive: true });
  cpSync(dataSrc, resolve(BUNDLE_DIR, 'data'), { recursive: true });
}
console.log('build complete: dist/ (static) + bundle/ (theme and data for the server)');
