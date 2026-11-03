# Jack Studio Website

Source code for the Jack Studio website (jackstudio.com.my), being moved off Shopify to a self-built platform.

## Structure

| Folder | Contents |
|---|---|
| `data/products/` | Shopify products CSV export (178 products, 851 variants), 3 Nov 2026. |
| `data/redirects/` | Shopify URL redirects export (41 redirects), 3 Nov 2026. Must be carried over as 301s on the new site. |
| `storefront/` | The new website: renders the theme with LiquidJS into static pages. See `storefront/README.md`. |
| `data/collections/` | Collections and their products (for the homepage tabs). |
| `data/content/` | Navigation menus and outlet records. |
| `shopify-theme/` | Full export of the Shopify theme "Website design 2026 (with showroom)", exported 3 Nov 2026. Source of truth for the design. |

## Rules

- **Never commit customer or order data** (PDPA) or any password / API key / eGHL credentials.
- Product images and videos go to cloud storage, not this repo.
- Keep the existing design: Bebas Neue (headings), Inter (body), Georgia Italic (taglines); palette Dark Espresso `#401410`, Warm Ivory `#FBF8F0`, Saddle Tan `#C38239`, Sage Green `#8DA68A`.
