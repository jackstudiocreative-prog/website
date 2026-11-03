# Storefront

The new Jack Studio website. It renders the **original Shopify theme** (`../shopify-theme`) with
[LiquidJS](https://liquidjs.com), so the design, markup, CSS and section settings stay exactly as
they are on Shopify — nothing is redrawn by hand. Pages are rendered on request by a Vercel
function, so Shopify-style URLs keep working: `?page=2`, `?sort_by=…`, `?filter.p.product_type=…`,
`?filter.v.availability=1`, and the URL redirects from `data/redirects`.

## How it works

| File | Role |
|---|---|
| `src/data.mjs` | Loads `../data` (products CSV, collections, outlets) into Shopify-style objects |
| `src/engine.mjs` | LiquidJS + the Shopify-only filters/tags the theme uses (`image_url`, `money`, `{% schema %}`, `{% form %}` …) |
| `src/app.mjs` | Router: `/`, `/collections/:handle`, `/products/:handle`, redirects, 404; sorting, filters, pagination |
| `api/render.mjs` | Vercel function that serves every page through `src/app.mjs` |
| `src/server.mjs` | Same thing locally for development |
| `src/build.mjs` | Copies theme assets to `dist/` and the theme + data to `bundle/` for the function |

Section content is still edited in the theme's JSON files (`shopify-theme/templates/*.json`,
`config/settings_data.json`) — the same structure as the Shopify Theme Editor.

## Commands

```bash
npm install
npm run build      # dist/ + bundle/
npm run dev        # http://localhost:4173
```

## Content import

Policy page text and blog articles are copied from the live Shopify site by
`scripts/import-content.mjs`, run by the GitHub Actions workflow **Import content from Shopify**
(daily, or manually from the Actions tab). It writes `data/content/pages/*.html` and
`data/content/blogs.json`. Disable the workflow once the site no longer runs on Shopify.

## Before going live

- Remove the `X-Robots-Tag: noindex` header from `vercel.json` (it keeps the preview out of Google while jackstudio.com.my is still on Shopify).

## Status

- Done: header, footer, homepage, collection pages (filters, sort, pagination, series templates), product pages, redirects, 404
- Only products that are active and published on Shopify are shown; drafts return 404
- Temporary: images load from the Shopify CDN; `/cart.js` is an empty stub; forms post to `/forms/*` (not wired yet)
- Sorting by date uses collection order (the product export has no creation dates)
- Next: content pages (About, Corporate, Outlets, Contact, policies, blog), then cart and checkout (eGHL)
