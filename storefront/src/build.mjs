// Builds static HTML pages from the original theme into ./dist
import { mkdirSync, writeFileSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { THEME_DIR, OUT_DIR, SHOP } from './config.mjs';
import { loadStore } from './data.mjs';
import { createEngine, renderTemplate, renderLayout } from './engine.mjs';

const store = loadStore();
const engine = createEngine();

// Global theme settings (config/settings_schema.json defaults)
const themeSettings = {};
for (const group of JSON.parse(readFileSync(resolve(THEME_DIR, 'config/settings_schema.json'), 'utf8'))) {
  for (const s of group.settings || []) if (s.id) themeSettings[s.id] = s.default;
}

function baseContext(path, pageType, title) {
  return {
    shop: { name: SHOP.name, url: SHOP.url, description: SHOP.description, currency: SHOP.currency, brand: {} },
    routes: {
      root_url: '/', cart_url: '/cart', search_url: '/search', account_url: '/account',
      account_login_url: '/account/login', collections_url: '/collections', all_products_collection_url: '/collections/all',
    },
    request: { path, page_type: pageType, design_mode: false, locale: { iso_code: 'en' } },
    settings: themeSettings,
    cart: { item_count: 0, items: [], total_price: 0 },
    customer: null,
    collections: Object.fromEntries(store.collections),
    all_products: Object.fromEntries(store.products),
    page_title: title,
    page_description: '',
    canonical_url: SHOP.url + path,
    content_for_header: '',
  };
}

const pages = [
  { path: '/', out: 'index.html', template: 'index', type: 'index', title: SHOP.name },
];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
cpSync(resolve(THEME_DIR, 'assets'), resolve(OUT_DIR, 'assets'), { recursive: true });
// Temporary empty-cart response for the theme's cart badge until our own cart API exists.
writeFileSync(resolve(OUT_DIR, 'cart.js'), JSON.stringify({ item_count: 0, items: [], total_price: 0 }));

for (const p of pages) {
  const ctx = baseContext(p.path, p.type, p.title);
  const content = await renderTemplate(engine, p.template, ctx, store);
  const html = await renderLayout(engine, ctx, store, content);
  const file = resolve(OUT_DIR, p.out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  console.log(`built ${p.path} -> dist/${p.out} (${(html.length / 1024).toFixed(1)} KB)`);
}
