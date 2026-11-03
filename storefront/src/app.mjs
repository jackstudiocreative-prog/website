// Request router: maps Shopify-style URLs to the theme's JSON templates and renders them.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME_DIR, SHOP } from './config.mjs';
import { loadStore } from './data.mjs';
import { createEngine, renderTemplate, renderLayout } from './engine.mjs';

const store = loadStore();
const engine = createEngine();

const themeSettings = {};
for (const group of JSON.parse(readFileSync(resolve(THEME_DIR, 'config/settings_schema.json'), 'utf8'))) {
  for (const s of group.settings || []) if (s.id) themeSettings[s.id] = s.default;
}
const savedSettings = JSON.parse(readFileSync(resolve(THEME_DIR, 'config/settings_data.json'), 'utf8')).current;
for (const key of Object.keys(themeSettings)) {
  if (Object.hasOwn(savedSettings, key)) themeSettings[key] = savedSettings[key];
}

const templateExists = (name) => existsSync(resolve(THEME_DIR, 'templates', `${name}.json`));
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function baseContext(url, pageType, title, description) {
  return {
    shop: { name: SHOP.name, url: SHOP.url, description: SHOP.description, currency: SHOP.currency, brand: {},
      metaobjects: Object.fromEntries(Object.entries(store.metaobjects).map(([type, records]) =>
        [type, { ...Object.fromEntries(records), values: [...records.values()] }])) },
    routes: {
      root_url: '/', cart_url: '/cart', search_url: '/search', account_url: SHOP.membership_url,
      account_login_url: SHOP.membership_url, collections_url: '/collections', all_products_collection_url: '/collections/all',
    },
    request: { path: url.pathname, page_type: pageType, design_mode: false, locale: { iso_code: 'en' } },
    settings: themeSettings,
    cart: { item_count: 0, items: [], total_price: 0 },
    customer: null,
    collections: Object.fromEntries(store.collections),
    all_products: Object.fromEntries(store.products),
    pages: Object.fromEntries(store.pages),
    blogs: Object.fromEntries(store.blogs),
    page_title: title,
    page_description: description || SHOP.description,
    canonical_url: SHOP.url + url.pathname,
    content_for_header: '',
  };
}

async function page(url, { template, type, title, description, extra = {}, canonical }) {
  const ctx = { ...baseContext(url, type, title, description), ...extra };
  if (canonical) ctx.canonical_url = SHOP.url + canonical;
  const content = await renderTemplate(engine, template, ctx, store);
  const html = await renderLayout(engine, ctx, store, content);
  return { status: 200, html };
}

// ---------- collection: sorting, filters (Search & Discovery style) and pagination ----------
const SORT_OPTIONS = [
  ['manual', 'Featured'], ['most-relevant', 'Most relevant'], ['best-selling', 'Best selling'],
  ['title-ascending', 'Alphabetically, A-Z'], ['title-descending', 'Alphabetically, Z-A'],
  ['price-ascending', 'Price, low to high'], ['price-descending', 'Price, high to low'],
  ['created-ascending', 'Date, old to new'], ['created-descending', 'Date, new to old'],
].map(([value, name]) => ({ value, name }));

function sortProducts(list, sortBy) {
  const a = [...list];
  switch (sortBy) {
    case 'title-ascending': return a.sort((x, y) => x.title.localeCompare(y.title));
    case 'title-descending': return a.sort((x, y) => y.title.localeCompare(x.title));
    case 'price-ascending': return a.sort((x, y) => x.price - y.price);
    case 'price-descending': return a.sort((x, y) => y.price - x.price);
    case 'created-ascending': return a.reverse(); // no creation dates in the export; collection order is newest-first
    default: return a; // manual / best-selling / most-relevant / created-descending keep collection order
  }
}

const FILTERS = [
  { param: 'filter.p.product_type', label: 'Product type', valuesOf: (p) => (p.type ? [p.type] : []) },
  {
    param: 'filter.v.availability', label: 'Availability',
    valuesOf: (p) => [...new Set(p.variants.map((v) => (v.available ? '1' : '0')))],
    labelOf: (v) => (v === '1' ? 'In stock' : 'Out of stock'), order: ['1', '0'],
  },
];

function buildFilters(url, products) {
  const active = Object.fromEntries(FILTERS.map((f) => [f.param, url.searchParams.getAll(f.param)]));
  const matches = (p, except) => FILTERS.every((f) =>
    f.param === except || !active[f.param].length || f.valuesOf(p).some((v) => active[f.param].includes(v)));

  const filters = FILTERS.map((f) => {
    const pool = products.filter((p) => matches(p, f.param));
    const counts = new Map();
    for (const p of pool) for (const v of f.valuesOf(p)) counts.set(v, (counts.get(v) || 0) + 1);
    for (const v of products.flatMap((p) => f.valuesOf(p))) if (!counts.has(v)) counts.set(v, 0);
    const keys = f.order ? f.order.filter((k) => counts.has(k)) : [...counts.keys()].sort((a, b) => a.localeCompare(b));
    const values = keys.map((v) => {
      const isActive = active[f.param].includes(v);
      const add = new URL(url); add.searchParams.delete('page'); add.searchParams.append(f.param, v);
      const remove = new URL(url); remove.searchParams.delete('page'); remove.searchParams.delete(f.param);
      for (const o of active[f.param]) if (o !== v) remove.searchParams.append(f.param, o);
      return {
        value: v, label: f.labelOf ? f.labelOf(v) : v, count: counts.get(v) || 0, active: isActive,
        param_name: f.param, url_to_add: add.pathname + add.search, url_to_remove: remove.pathname + remove.search,
      };
    });
    return { label: f.label, param_name: f.param, type: 'list', values, active_values: values.filter((x) => x.active) };
  });
  return { filters, filtered: products.filter((p) => matches(p)) };
}

function paginate(url, list, perPage) {
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1), pages);
  const link = (n) => { const u = new URL(url); if (n === 1) u.searchParams.delete('page'); else u.searchParams.set('page', n); return u.pathname + u.search; };
  return {
    items: list.slice((current - 1) * perPage, current * perPage),
    paginate: {
      pages, current_page: current, items: list.length, page_size: perPage,
      previous: current > 1 ? { url: link(current - 1), title: '&laquo; Previous', is_link: true } : null,
      next: current < pages ? { url: link(current + 1), title: 'Next &raquo;', is_link: true } : null,
      parts: Array.from({ length: pages }, (_, i) => ({ title: i + 1, url: link(i + 1), is_link: i + 1 !== current })),
    },
  };
}

async function collectionPage(url, handle) {
  const base = store.collections.get(handle);
  if (!base) return null;
  const sortBy = url.searchParams.get('sort_by') || base.default_sort_by;
  const { filters, filtered } = buildFilters(url, base.products);
  const sorted = sortProducts(filtered, sortBy);
  const { items, paginate: pg } = paginate(url, sorted, 24);
  const collection = {
    ...base, products: items, products_count: filtered.length, all_products_count: base.products.length,
    sort_by: sortBy, sort_options: SORT_OPTIONS, filters,
  };
  const suffix = base.template_suffix && templateExists(`collection.${base.template_suffix}`) ? `.${base.template_suffix}` : '';
  return page(url, {
    template: `collection${suffix}`, type: 'collection',
    title: base.seo_title || base.title,
    description: base.seo_description || stripHtml(base.description),
    extra: { collection, paginate: pg, current_page: pg.current_page },
  });
}

async function productPage(url, handle) {
  const product = store.products.get(handle);
  if (!product || !product.visible) return null;
  return page(url, {
    template: 'product', type: 'product',
    title: product.seo_title || product.title,
    description: product.seo_description || stripHtml(product.description).slice(0, 320),
    extra: { product, page_image: product.featured_image },
    canonical: product.url,
  });
}

async function contentPage(url, handle) {
  const pg = store.pages.get(handle);
  if (!pg || !pg.published) return null;
  const suffix = pg.template_suffix && templateExists(`page.${pg.template_suffix}`) ? `.${pg.template_suffix}` : '';
  return page(url, {
    template: `page${suffix}`, type: 'page', title: pg.title,
    description: stripHtml(pg.content).slice(0, 320) || undefined,
    extra: { page: pg },
  });
}

function blogPage(url, handle) {
  const blog = store.blogs.get(handle);
  if (!blog) return null;
  return page(url, { template: 'blog', type: 'blog', title: blog.title, extra: { blog } });
}

function articlePage(url, blogHandle, handle) {
  const blog = store.blogs.get(blogHandle);
  const article = blog?.articles.find((a) => a.handle === handle);
  if (!article) return null;
  return page(url, {
    template: 'article', type: 'article', title: article.title,
    description: (stripHtml(article.excerpt) || stripHtml(article.content)).slice(0, 320),
    extra: { blog, article, page_image: article.image },
  });
}

function searchPage(url) {
  const q = (url.searchParams.get('q') || '').trim();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? [...store.products.values()].filter((p) => p.visible && terms.every((t) =>
        `${p.title} ${p.type} ${p.tags.join(' ')} ${p.variants.map((v) => v.sku).join(' ')}`.toLowerCase().includes(t)))
    : [];
  const items = results.map((p) => ({ ...p, object_type: 'product' }));
  const search = { performed: terms.length > 0, terms: q, results: items, results_count: items.length, types: ['product'] };
  return page(url, { template: 'search', type: 'search', title: q ? `Search: ${q}` : 'Search', extra: { search } });
}

// ---------- router ----------
export async function render(rawUrl) {
  const url = new URL(rawUrl, SHOP.url);
  let path = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';

  const to = store.redirects.get(path.toLowerCase());
  if (to) return { status: 301, location: to };

  let m;
  if (path === '/') {
    return page(url, { template: 'index', type: 'index', title: SHOP.home_title });
  }
  if (path === '/collections') {
    return page(url, { template: 'list-collections', type: 'list-collections', title: 'Collections' });
  }
  if (path === '/cart') return page(url, { template: 'cart', type: 'cart', title: 'Your Shopping Cart' });
  if (path === '/search') return searchPage(url);
  if ((m = path.match(/^\/pages\/([^/]+)$/))) {
    const res = await contentPage(url, m[1]);
    if (res) return res;
  }
  if ((m = path.match(/^\/blogs\/([^/]+)$/))) {
    const res = await blogPage(url, m[1]);
    if (res) return res;
  }
  if ((m = path.match(/^\/blogs\/([^/]+)\/([^/]+)$/))) {
    const res = await articlePage(url, m[1], m[2]);
    if (res) return res;
  }
  if ((m = path.match(/^\/collections\/([^/]+)$/))) {
    const res = await collectionPage(url, m[1]);
    if (res) return res;
  }
  if ((m = path.match(/^(?:\/collections\/[^/]+)?\/products\/([^/]+)$/))) {
    const res = await productPage(url, m[1]);
    if (res) return res;
  }
  return notFound(url);
}

async function notFound(url) {
  const ctx = baseContext(url, '404', 'Page not found');
  const content = `<div style="max-width:720px;margin:0 auto;padding:96px 24px;text-align:center;font-family:Inter,sans-serif;color:#2B2420;">
    <h1 style="font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:1px;margin:0 0 12px;">Page not found</h1>
    <p style="margin:0 0 24px;color:#7A7263;">The page you were looking for does not exist.</p>
    <a href="/collections/all" style="display:inline-block;background:#C38239;color:#fff;text-decoration:none;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;padding:12px 20px;border-radius:4px;">Continue shopping</a>
  </div>`;
  return { status: 404, html: await renderLayout(engine, ctx, store, content) };
}
