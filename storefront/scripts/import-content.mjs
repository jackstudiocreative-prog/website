// Copies page body text and blog articles from the live Shopify storefront into ../data,
// so content moves machine-to-machine (nothing retyped). Runs in GitHub Actions
// (.github/workflows/import-content.yml) while jackstudio.com.my is still on Shopify.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = resolve(ROOT, 'data/content');
const SITE = process.env.SOURCE_SITE || 'https://www.jackstudio.com.my';
const BLOGS = ['news', 'promotions-genuine-leather-deals'];
const UA = { 'User-Agent': 'JackStudio-ContentImport/1.0 (+https://github.com/jackstudiocreative-prog/website)' };

async function get(url) {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// Inner HTML of the first <div class="...cls..."> (handles nested divs).
function innerDiv(html, cls) {
  const open = new RegExp(`<div[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'i').exec(html);
  if (!open) return null;
  let depth = 1;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = open.index + open[0].length;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, m.index).trim();
  }
  return null;
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');
const tag = (xml, name) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '') : '';
};
const meta = (html, prop) => {
  const m = new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, 'i').exec(html);
  return m ? decode(m[1]) : '';
};

// ---------- pages ----------
async function importPages() {
  const { pages } = JSON.parse(readFileSync(resolve(DATA, 'pages.json'), 'utf8'));
  mkdirSync(resolve(DATA, 'pages'), { recursive: true });
  let n = 0;
  for (const p of pages.filter((x) => x.published)) {
    try {
      const html = await get(`${SITE}/pages/${encodeURIComponent(p.handle)}`);
      const body = innerDiv(html, 'pp-body') ?? innerDiv(html, 'rte');
      if (body) {
        writeFileSync(resolve(DATA, 'pages', `${p.handle}.html`), body + '\n');
        n++;
      }
    } catch (e) {
      console.warn(`page ${p.handle}: ${e.message}`);
    }
  }
  console.log(`pages: saved ${n} page bodies`);
}

// ---------- blogs (Atom feed + each article page for its image and handle) ----------
async function importBlogs() {
  const blogs = [];
  for (const handle of BLOGS) {
    const xml = await get(`${SITE}/blogs/${handle}.atom`);
    const blogTitle = decode(tag(xml.split('<entry')[0], 'title'));
    const articles = [];
    for (const entry of xml.split('<entry').slice(1)) {
      const link = /<link[^>]+rel="alternate"[^>]+href="([^"]+)"/.exec(entry)?.[1] || '';
      const articleHandle = decodeURIComponent(link.split('/').pop() || '');
      let image = '';
      try { image = meta(await get(link), 'og:image'); } catch { /* keep going */ }
      articles.push({
        handle: articleHandle,
        title: decode(tag(entry, 'title')),
        author: decode(tag(tag(entry, 'author'), 'name')),
        published_at: tag(entry, 'published'),
        updated_at: tag(entry, 'updated'),
        tags: [...entry.matchAll(/<category[^>]+term="([^"]+)"/g)].map((m) => decode(m[1])),
        excerpt: decode(tag(entry, 'summary')),
        content: decode(tag(entry, 'content')),
        image: image.startsWith('//') ? `https:${image}` : image,
      });
    }
    blogs.push({ handle, title: blogTitle, articles });
    console.log(`blog ${handle}: ${articles.length} articles`);
  }
  writeFileSync(resolve(DATA, 'blogs.json'), JSON.stringify({
    _source: `Imported from ${SITE} (Atom feeds and article pages) by storefront/scripts/import-content.mjs`, blogs,
  }, null, 2) + '\n');
}

await importPages();
await importBlogs();
