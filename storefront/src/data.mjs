// Loads the exported store data (../data) and turns it into Shopify-style
// objects that the original theme's Liquid can read unchanged.
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { DATA_DIR, CDN_FILES } from './config.mjs';

const readJSON = (p) => JSON.parse(readFileSync(`${DATA_DIR}/${p}`, 'utf8'));

// ---------- images ----------
// An image object behaves like Shopify's: `src`, `url`, `alt`, and it can be
// passed to image_url / image_tag.
export function makeImage(src, alt = '') {
  if (!src) return null;
  return { __image: true, src, url: src, alt, width: null, height: null, toString: () => src };
}

// "shopify://shop_images/foo.png" -> image object on the existing CDN
export function shopImage(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const m = ref.match(/^shopify:\/\/shop_images\/(.+)$/);
  if (m) return makeImage(`${CDN_FILES}${m[1]}`);
  if (/^https?:\/\//.test(ref)) return makeImage(ref);
  return null;
}

// "shopify://pages/outlets" -> "/pages/outlets"
export function shopUrl(ref) {
  if (!ref || typeof ref !== 'string') return ref;
  const m = ref.match(/^shopify:\/\/(pages|collections|products|blogs)\/(.+)$/);
  return m ? `/${m[1]}/${m[2]}` : ref;
}

// ---------- products ----------
function loadProducts() {
  const rows = parse(readFileSync(`${DATA_DIR}/products/products_export.csv`), {
    columns: true, bom: true, skip_empty_lines: true, relax_column_count: true,
  });
  const byHandle = new Map();
  for (const r of rows) {
    const h = r['Handle'];
    if (!h) continue;
    let p = byHandle.get(h);
    if (!p) {
      p = { handle: h, title: '', description: '', vendor: '', type: '', tags: [], status: '',
            options: [], variants: [], images: [] };
      byHandle.set(h, p);
    }
    if (r['Title']) {
      p.title = r['Title'];
      p.description = r['Body (HTML)'] || '';
      p.vendor = r['Vendor'] || '';
      p.type = r['Type'] || '';
      p.tags = (r['Tags'] || '').split(',').map((t) => t.trim()).filter(Boolean);
      p.status = r['Status'] || '';
      p.published = r['Published'] === 'true';
      p.seo_title = r['SEO Title'] || '';
      p.seo_description = r['SEO Description'] || '';
      for (let i = 1; i <= 3; i++) {
        const name = r[`Option${i} Name`];
        if (name) p.options.push(name);
      }
    }
    if (r['Option1 Value'] || r['Variant Price']) {
      const qty = parseInt(r['Variant Inventory Qty'] || '0', 10) || 0;
      const tracked = !!r['Variant Inventory Tracker'];
      const policy = r['Variant Inventory Policy'] || 'deny';
      p.variants.push({
        id: `${h}--${p.variants.length + 1}`,
        sku: r['Variant SKU'] || '',
        option1: r['Option1 Value'] || null,
        option2: r['Option2 Value'] || null,
        option3: r['Option3 Value'] || null,
        price: Math.round(parseFloat(r['Variant Price'] || '0') * 100),
        compare_at_price: r['Variant Compare At Price'] ? Math.round(parseFloat(r['Variant Compare At Price']) * 100) : null,
        inventory_quantity: qty,
        available: !tracked || policy === 'continue' || qty > 0,
        image: r['Variant Image'] ? makeImage(r['Variant Image']) : null,
      });
    }
    if (r['Image Src']) p.images.push(makeImage(r['Image Src'], r['Image Alt Text'] || p.title));
  }

  for (const p of byHandle.values()) {
    p.url = `/products/${p.handle}`;
    p.featured_image = p.images[0] || null;
    p.featured_media = p.featured_image;
    p.media = p.images;
    for (const v of p.variants) {
      v.title = [v.option1, v.option2, v.option3].filter(Boolean).join(' / ');
      v.options = [v.option1, v.option2, v.option3].filter(Boolean);
    }
    const prices = p.variants.map((v) => v.price).filter((n) => n > 0);
    p.price = prices.length ? Math.min(...prices) : 0;
    p.price_min = p.price;
    p.price_max = prices.length ? Math.max(...prices) : 0;
    const compares = p.variants.map((v) => v.compare_at_price || 0);
    p.compare_at_price = compares.length ? Math.max(...compares) : 0;
    p.compare_at_price_max = p.compare_at_price;
    p.available = p.variants.some((v) => v.available);
    p.visible = p.status === 'active' && p.published; // what Shopify's storefront shows
    p.selected_or_first_available_variant = p.variants.find((v) => v.available) || p.variants[0] || null;
    p.first_available_variant = p.selected_or_first_available_variant;
    p.has_only_default_variant = p.variants.length <= 1 && (p.options.length === 0 || p.options[0] === 'Title');
    p.options_with_values = p.options.map((name, i) => ({
      name,
      position: i + 1,
      values: [...new Set(p.variants.map((v) => v[`option${i + 1}`]).filter(Boolean))],
      selected_value: p.selected_or_first_available_variant?.[`option${i + 1}`] ?? null,
    }));
  }
  return byHandle;
}

// ---------- collections ----------
// Only products that are active and published appear on the storefront, as on Shopify.
function makeCollection(c, list) {
  return {
    handle: c.handle, title: c.title, url: `/collections/${c.handle}`,
    description: c.description || '', template_suffix: c.template_suffix || '',
    seo_title: c.seo_title || '', seo_description: c.seo_description || '',
    image: makeImage(c.image), products: list, all_products: list,
    products_count: list.length, all_products_count: list.length,
    sort_by: '', default_sort_by: c.default_sort_by || 'manual', filters: [],
  };
}

function loadCollections(products) {
  const map = new Map();
  for (const c of readJSON('collections/collections.json').collections) {
    const list = c.product_handles.map((h) => products.get(h)).filter((p) => p && p.visible);
    map.set(c.handle, makeCollection(c, list));
  }
  // /collections/all: every visible product
  map.set('all', makeCollection({ handle: 'all', title: 'Products', default_sort_by: 'title-ascending' }, [...products.values()].filter((p) => p.visible)));
  return map;
}

// ---------- metaobjects (outlets) ----------
function loadOutlets() {
  const map = new Map();
  for (const o of readJSON('content/outlets.json').outlets) {
    const field = (v) => ({ value: v });
    map.set(o.handle, {
      handle: o.handle, name: field(o.name), region: field(o.region),
      location_label: field(o.location_label), address: field(o.address),
      hours: field(o.hours), phone: field(o.phone), photo: field(makeImage(o.photo, o.name)),
      directions_url: field(o.directions_url), call_url: field(o.call_url),
    });
  }
  return map;
}

// ---------- pages ----------
function loadPages() {
  const map = new Map();
  for (const p of readJSON('content/pages.json').pages) {
    let content = '';
    const file = `${DATA_DIR}/content/pages/${p.handle}.html`;
    if (existsSync(file)) content = readFileSync(file, 'utf8');
    map.set(p.handle, { ...p, id: p.handle, url: `/pages/${p.handle}`, content, template_suffix: p.template_suffix || '' });
  }
  return map;
}

// ---------- blogs (imported by scripts/import-content.mjs) ----------
function loadBlogs() {
  const map = new Map();
  if (!existsSync(`${DATA_DIR}/content/blogs.json`)) return map;
  for (const b of readJSON('content/blogs.json').blogs) {
    // Atom feed titles are "<shop name> - <blog name>"
    const blog = { handle: b.handle, title: b.title.replace(/^.*? - /, ''), url: `/blogs/${b.handle}`, articles: [] };
    blog.articles = b.articles.map((a) => ({
      ...a, id: `${b.handle}/${a.handle}`, url: `/blogs/${b.handle}/${a.handle}`, blog,
      image: makeImage(a.image, a.title), published_at: a.published_at, created_at: a.published_at,
    }));
    blog.articles_count = blog.articles.length;
    map.set(b.handle, blog);
  }
  return map;
}

// ---------- URL redirects (Shopify: Navigation > URL redirects) ----------
function loadRedirects() {
  const rows = parse(readFileSync(`${DATA_DIR}/redirects/redirects_export.csv`), { columns: true, bom: true, skip_empty_lines: true });
  const map = new Map();
  for (const r of rows) {
    const from = (r['Redirect from'] || '').trim();
    let to = (r['Redirect to'] || '').trim();
    if (!from || !to) continue;
    to = to.replace(/^https?:\/\/(www\.)?jackstudio\.com\.my/, '') || '/';
    map.set(from.toLowerCase(), to);
  }
  return map;
}

export function loadStore() {
  const products = loadProducts();
  const collections = loadCollections(products);
  const outlets = loadOutlets();
  return { products, collections, pages: loadPages(), blogs: loadBlogs(), metaobjects: { outlet: outlets }, redirects: loadRedirects() };
}
