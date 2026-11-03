# Jack Studio Website

Source code for the Jack Studio website (jackstudio.com.my), being moved off Shopify to a self-built platform.

## Structure

| Folder | Contents |
|---|---|
| `data/products/` | Shopify products CSV export (178 products, 851 variants), 3 Nov 2026. |
| `shopify-theme/` | Full export of the Shopify theme "Website design 2026 (with showroom)", exported 3 Nov 2026. Source of truth for the design. |

## Rules

- **Never commit customer or order data** (PDPA) or any password / API key / eGHL credentials.
- Product images and videos go to cloud storage, not this repo.
- Keep the existing design: Bebas Neue (headings), Inter (body), Georgia Italic (taglines); palette Dark Espresso `#401410`, Warm Ivory `#FBF8F0`, Saddle Tan `#C38239`, Sage Green `#8DA68A`.
