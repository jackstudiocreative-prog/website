# Storefront

The new Jack Studio website. It renders the **original Shopify theme** (`../shopify-theme`) with
[LiquidJS](https://liquidjs.com), so the design, markup, CSS and section settings stay exactly as
they are on Shopify — nothing is redrawn by hand.

## How it works

| File | Role |
|---|---|
| `src/data.mjs` | Loads `../data` (products CSV, collections, outlets) into Shopify-style objects |
| `src/engine.mjs` | LiquidJS + the Shopify-only filters/tags the theme uses (`image_url`, `money`, `{% schema %}`, `{% form %}` …) |
| `src/build.mjs` | Renders JSON templates through `layout/theme.liquid` into static HTML in `dist/` |

Section content is still edited in the theme's JSON files (`shopify-theme/templates/*.json`,
`config/settings_data.json`) — the same structure as the Shopify Theme Editor.

## Commands

```bash
npm install
npm run build      # -> dist/
npm run preview    # serve dist/ on http://localhost:4173
```

## Status

- Done: header, footer, homepage
- Temporary: images load from the Shopify CDN; `/cart.js` is an empty stub; forms post to `/forms/*` (not wired yet)
- Next: product, collection and content pages, then cart and checkout (eGHL)
