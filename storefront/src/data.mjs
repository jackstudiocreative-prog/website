// Loads the exported store data (../data) and turns it into Shopify-style
// objects that the original theme's Liquid can read unchanged.
import { readFileSync } from 'node:fs';
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
      for (let i = 1; i <= 3; i++) {
        const name = r[`Option${i} Name`];
        if (name) p.options.push(name);
      }
    }
    if (r['Option1 Value'] || r['Variant Price']) {
      p.variants.push({
        sku: r['Variant SKU'] || '',
        option1: r['Option1 Value'] || null,
        option2: r['Option2 Value'] || null,
        option3: r['Option3 Value'] || null,
        price: Math.round(parseFloat(r['Variant Price'] || '0') * 100),
        compare_at_price: r['Variant Compare At Price'] ? Math.round(parseFloat(r['Variant Compare At Price']) * 100) : null,
        image: r['Variant Image'] || '',
      });
    }
    if (r['Image Src']) p.images.push(makeImage(r['Image Src'], r['Image Alt Text'] || p.title));
  }

  for (const p of byHandle.values()) {
    p.url = `/products/${p.handle}`;
    p.featured_image = p.images[0] || null;
    const prices = p.variants.map((v) => v.price).filter((n) => n > 0);
    p.price = prices.length ? Math.min(...prices) : 0;
    p.price_min = p.price;
    p.price_max = prices.length ? Math.max(...prices) : 0;
    p.available = p.status === 'active';
    p.options_with_values = p.options.map((name, i) => ({
      name,
      values: [...new Set(p.variants.map((v) => v[`option${i + 1}`]).filter(Boolean))],
    }));
  }
  return byHandle;
}

// ---------- collections ----------
function loadCollections(products) {
  const map = new Map();
  for (const c of readJSON('collections/collections.json').collections) {
    const list = c.product_handles.map((h) => products.get(h)).filter(Boolean);
    map.set(c.handle, {
      handle: c.handle, title: c.title, url: `/collections/${c.handle}`,
      image: makeImage(c.image), products: list, products_count: c.product_count,
      all_products_count: c.product_count,
    });
  }
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

export function loadStore() {
  const products = loadProducts();
  const collections = loadCollections(products);
  const outlets = loadOutlets();
  return { products, collections, metaobjects: { outlet: outlets } };
}
