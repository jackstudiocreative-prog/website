import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/app.mjs';
import { loadStore } from '../src/data.mjs';

test('product sharing images use a valid HTTPS URL', async () => {
  const { html } = await render('/products/mens-leather-wallet');
  const urls = [...html.matchAll(/<meta property="og:image(?:\:secure_url)?" content="([^"]+)"/g)].map(m => m[1]);
  assert.equal(urls.length, 2);
  for (const url of urls) {
    assert.equal(new URL(url).protocol, 'https:');
    assert.ok(!url.includes('https:https:'));
    assert.ok(new URL(url).hostname.includes('shopify.com'));
  }
});

test('all products default order matches explicit alphabetical order and preserves pagination', async () => {
  const first = await render('/collections/all');
  const explicit = await render('/collections/all?sort_by=title-ascending');
  const products = html => [...html.matchAll(/href="(\/products\/[^"?]+)"/g)].map(m => m[1]);
  assert.deepEqual(products(first.html), products(explicit.html));
  const second = await render('/collections/all?page=2');
  assert.notDeepEqual(products(first.html), products(second.html));
  const expected = [...loadStore().products.values()].filter(p => p.visible).sort((a,b) => a.title.localeCompare(b.title));
  assert.equal(products(first.html)[0], expected[0].url);
});

test('migrated outlet, service and series content remains complete', async () => {
  const outlets = await render('/pages/outlets-design-draft');
  assert.equal((outlets.html.match(/<article class="ol-card">/g) || []).length, 13);
  const services = await render('/pages/our-service');
  assert.equal((services.html.match(/<video /g) || []).length, 2);
  assert.ok(!services.html.includes('src="shopify://'));
  const series = await render('/pages/产品系列-product-series-design-draft');
  assert.ok(series.html.includes('template--page-product-series'));
  assert.ok(!series.html.includes('template--page.product-series'));
});
