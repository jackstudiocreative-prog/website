// Renders the original Shopify theme (../shopify-theme) with LiquidJS, so the
// new site keeps the exact same markup, CSS and Theme-Editor JSON settings.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { Liquid } from 'liquidjs';
import { THEME_DIR, DATA_DIR, SHOP } from './config.mjs';
import { shopImage, shopUrl } from './data.mjs';

// ---------- Shopify-only tags handled before parsing ----------
const schemas = new Map(); // section type -> parsed {% schema %}
const videos = JSON.parse(readFileSync(resolve(DATA_DIR, 'content/videos.json'), 'utf8'));

function preprocess(src, file) {
  return src
    .replace(/\{%-?\s*doc\s*-?%\}[\s\S]*?\{%-?\s*enddoc\s*-?%\}/g, '')
    .replace(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/g, (_, json) => {
      if (file) {
        try { schemas.set(file, JSON.parse(json)); } catch { schemas.set(file, {}); }
      }
      return '';
    })
    .replace(/\{%-?\s*(javascript)\s*-?%\}/g, '<script>')
    .replace(/\{%-?\s*endjavascript\s*-?%\}/g, '</script>')
    .replace(/\{%-?\s*(stylesheet|style)\s*-?%\}/g, '<style>')
    .replace(/\{%-?\s*end(stylesheet|style)\s*-?%\}/g, '</style>')
    // {% form 'type', obj, class: 'x' %} -> plain form (wired to our own endpoints later)
    .replace(/\{%-?\s*form\s+'([^']+)'[^%]*%\}/g, (_, type) => `<form method="post" action="/forms/${type}" accept-charset="UTF-8">`)
    .replace(/\{%-?\s*endform\s*-?%\}/g, '</form>')
    .replace(/\{%-?\s*(end)?paginate[^%]*%\}/g, '');
}

// File system for LiquidJS that applies the same preprocessing to snippets.
const themeFs = {
  existsSync: (f) => existsSync(f),
  exists: async (f) => existsSync(f),
  readFileSync: (f) => preprocess(readFileSync(f, 'utf8')),
  readFile: async (f) => preprocess(readFileSync(f, 'utf8')),
  resolve: (root, file, ext) => resolve(root, file.endsWith(ext) ? file : file + ext),
  contains: (root, file) => resolve(file).startsWith(resolve(root)),
  dirname: (f) => dirname(f),
  sep,
};

// ---------- helpers ----------
const kwargs = (args) => {
  const o = {};
  for (const a of args) if (Array.isArray(a) && a.length === 2) o[a[0]] = a[1];
  return o;
};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function withWidth(url, width) {
  if (!url || !width) return url;
  if (!/cdn\.shopify\.com/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + `width=${width}`;
}

export function createEngine() {
  const engine = new Liquid({
    root: [resolve(THEME_DIR, 'snippets')],
    partials: [resolve(THEME_DIR, 'snippets')],
    extname: '.liquid',
    fs: themeFs,
    cache: true,
    jsTruthy: false,
    ownPropertyOnly: false,
    timezoneOffset: 'Asia/Kuala_Lumpur', // Shopify formats dates in the shop's time zone
  });

  // image_url: accepts an image object or a URL string; returns a URL that remembers its alt text.
  engine.registerFilter('image_url', (input, ...args) => {
    if (!input) return '';
    const { width } = kwargs(args);
    const src = typeof input === 'object' ? (input.src || input.url || '') : String(input);
    const out = new String(withWidth(src, width));
    out.__alt = typeof input === 'object' ? input.alt || '' : '';
    out.__width = width;
    return out;
  });

  engine.registerFilter('image_tag', (url, ...args) => {
    if (!url) return '';
    const o = kwargs(args);
    const alt = o.alt ?? url.__alt ?? '';
    const attrs = [`src="${esc(url)}"`, `alt="${esc(alt)}"`];
    if (o.loading) attrs.push(`loading="${esc(o.loading)}"`);
    if (o.class) attrs.push(`class="${esc(o.class)}"`);
    if (o.width || url.__width) attrs.push(`width="${esc(o.width || url.__width)}"`);
    for (const k of Object.keys(o)) {
      if (!['alt', 'loading', 'class', 'width', 'widths', 'sizes', 'preload'].includes(k)) attrs.push(`${k}="${esc(o[k])}"`);
    }
    return `<img ${attrs.join(' ')}>`;
  });

  engine.registerFilter('money', (cents) => {
    const n = Number(cents || 0) / 100;
    const amount = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return SHOP.money_format.replace('{{amount}}', amount);
  });
  engine.registerFilter('money_with_currency', (cents) => engine.filters.money.call(null, cents));
  engine.registerFilter('asset_url', (name) => `/assets/${name}`);
  engine.registerFilter('absolute_url', (url) => {
    if (!url) return '';
    return new URL(String(url), SHOP.url).href;
  });
  engine.registerFilter('stylesheet_tag', (url) => `<link href="${esc(url)}" rel="stylesheet" type="text/css" media="all">`);
  engine.registerFilter('script_tag', (url) => `<script src="${esc(url)}" type="text/javascript"></script>`);
  engine.registerFilter('handleize', (s) => String(s ?? '').toLowerCase().trim()
    .replace(/['"]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''));
  engine.registerFilter('handle', (s) => engine.filters.handleize.call(null, s));
  engine.registerFilter('url_param_escape', (s) => encodeURIComponent(String(s ?? '')));
  engine.registerFilter('default_errors', () => '');
  engine.registerFilter('placeholder_svg_tag', (name, cls) =>
    `<svg class="${esc(cls || 'placeholder-svg')}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525 525" preserveAspectRatio="xMidYMid slice"><rect width="525" height="525" fill="#E9E2D5"/></svg>`);
  engine.registerFilter('video_tag', (video, ...args) => {
    const o = kwargs(args);
    const src = typeof video === 'object' ? video?.src || video?.url : video;
    if (!src) return '';
    const flags = ['autoplay', 'loop', 'muted', 'controls', 'playsinline'].filter((k) => o[k]).join(' ');
    return `<video ${flags}${o.class ? ` class="${esc(o.class)}"` : ''}${o.preload ? ` preload="${esc(o.preload)}"` : ''}${video.poster ? ` poster="${esc(video.poster)}"` : ''}><source src="${esc(src)}" type="video/mp4"></video>`;
  });
  engine.registerFilter('t', (key) => key);

  return engine;
}

// ---------- sections and theme blocks ----------
function schemaOf(dir, type) {
  const file = resolve(THEME_DIR, dir, `${type}.liquid`);
  if (!schemas.has(file)) preprocess(readFileSync(file, 'utf8'), file);
  return schemas.get(file) || {};
}
export const sectionSchema = (type) => schemaOf('sections', type);

function sourceOf(dir, type) {
  const file = resolve(THEME_DIR, dir, `${type}.liquid`);
  return preprocess(readFileSync(file, 'utf8'), file);
}
const sectionSource = (type) => sourceOf('sections', type);

// Shopify's built-in "_blocks" section: renders theme blocks from blocks/*.liquid one after another.
async function renderThemeBlocks(engine, data, ctx, store, section) {
  const order = data.block_order || Object.keys(data.blocks || {});
  const out = [];
  for (const bid of order) {
    const b = data.blocks?.[bid];
    if (!b || b.disabled || !existsSync(resolve(THEME_DIR, 'blocks', `${b.type}.liquid`))) continue;
    const schema = schemaOf('blocks', b.type);
    const block = { id: bid, type: b.type, shopify_attributes: '', settings: resolveSettings(schema.settings, b.settings, store) };
    const html = await engine.parseAndRender(sourceOf('blocks', b.type), { ...ctx, section, block });
    out.push(schema.tag === null ? html
      : `<${schema.tag || 'div'} id="shopify-block-${bid}" class="${esc(schema.class || '')}">${html}</${schema.tag || 'div'}>`);
  }
  return out.join('');
}

// Turn stored JSON settings into the objects Liquid expects, using the schema's setting types.
function resolveSettings(defs = [], values = {}, store) {
  const out = {};
  for (const d of defs) {
    if (!d.id) continue;
    let v = d.id in values ? values[d.id] : d.default;
    switch (d.type) {
      case 'image_picker': v = shopImage(v); break;
      case 'video': v = videos[v] || (/^https:\/\//.test(v || '') ? { src: v } : null); break;
      case 'collection': v = v ? store.collections.get(v) || null : null; break;
      case 'collection_list': v = (v || []).map((h) => store.collections.get(h)).filter(Boolean); break;
      case 'product': v = v ? store.products.get(v) || null : null; break;
      case 'product_list': v = (v || []).map((h) => store.products.get(h)).filter(Boolean); break;
      case 'metaobject': v = v ? store.metaobjects[d.metaobject_type]?.get(v) || null : null; break;
      case 'url': v = shopUrl(v); break;
      default: break;
    }
    out[d.id] = v;
  }
  // keep any stored values the schema does not declare
  for (const [k, v] of Object.entries(values)) if (!(k in out)) out[k] = v;
  return out;
}

export async function renderSection(engine, { id, type, data = {} }, ctx, store) {
  if (type === 'apps') return ''; // app blocks (e.g. Collabs) have no theme code to render
  if (type === '_blocks') {
    const section = { id, type, blocks: [], settings: data.settings || {} };
    return `<div id="shopify-section-${id}" class="shopify-section">${await renderThemeBlocks(engine, data, ctx, store, section)}</div>`;
  }
  const schema = sectionSchema(type);
  const blockDefs = Object.fromEntries((schema.blocks || []).map((b) => [b.type, b.settings || []]));
  const order = data.block_order || Object.keys(data.blocks || {});
  const blocks = order
    .map((bid) => ({ bid, b: data.blocks?.[bid] }))
    .filter(({ b }) => b && !b.disabled)
    .map(({ bid, b }) => ({
      id: bid, type: b.type, shopify_attributes: '',
      settings: resolveSettings(blockDefs[b.type], b.settings, store),
    }));
  const section = { id, type, blocks, settings: resolveSettings(schema.settings, data.settings, store) };
  const html = await engine.parseAndRender(sectionSource(type), { ...ctx, section });
  return `<div id="shopify-section-${id}" class="shopify-section">${html}</div>`;
}

export async function renderTemplate(engine, name, ctx, store) {
  // Shopify-generated template files can start with a /* ... */ comment header.
  const raw = readFileSync(resolve(THEME_DIR, 'templates', `${name}.json`), 'utf8').replace(/^\s*\/\*[\s\S]*?\*\//, '');
  const tpl = JSON.parse(raw);
  const parts = [];
  for (const key of tpl.order) {
    const s = tpl.sections[key];
    if (!s || s.disabled) continue;
    // IDs are also interpolated into CSS selectors by the original theme.
    // A template suffix separator (.) must not become a CSS class selector.
    parts.push(await renderSection(engine, { id: `template--${name.replace(/[^a-zA-Z0-9_-]/g, '-')}__${key}`, type: s.type, data: s }, ctx, store));
  }
  return parts.join('\n');
}

export async function renderLayout(engine, ctx, store, contentForLayout) {
  const settingsData = JSON.parse(readFileSync(resolve(THEME_DIR, 'config/settings_data.json'), 'utf8')).current;
  let src = preprocess(readFileSync(resolve(THEME_DIR, 'layout/theme.liquid'), 'utf8'));
  // Shopify returns protocol-relative image URLs; our adapter returns HTTPS URLs.
  // Normalize only the layout's explicit prefix, keeping the exported theme intact.
  src = src.replace(/https:\{\{\s*(og_image\s*\|\s*image_url:[^}]+)\}\}/g,
    '{{ $1 | absolute_url | escape }}');
  const staticSections = {};
  for (const [, type] of src.matchAll(/\{%-?\s*section\s+'([^']+)'\s*-?%\}/g)) {
    staticSections[type] = await renderSection(engine, { id: type, type, data: settingsData.sections?.[type] || {} }, ctx, store);
  }
  src = src.replace(/\{%-?\s*section\s+'([^']+)'\s*-?%\}/g, (_, t) => `{{ __static_sections['${t}'] }}`);
  return engine.parseAndRender(src, {
    ...ctx, content_for_layout: contentForLayout, __static_sections: staticSections,
  });
}
