import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(here, '..');
// On Vercel the build copies the theme and data into ./bundle so the server function can read them.
const BUNDLE = resolve(ROOT, 'bundle');
const useBundle = existsSync(resolve(BUNDLE, 'shopify-theme'));
export const THEME_DIR = useBundle ? resolve(BUNDLE, 'shopify-theme') : resolve(ROOT, '../shopify-theme');
export const DATA_DIR = useBundle ? resolve(BUNDLE, 'data') : resolve(ROOT, '../data');
export const BUNDLE_DIR = BUNDLE;
export const OUT_DIR = resolve(ROOT, 'dist');

// Images still live on the existing Shopify CDN until they are moved to our own storage.
export const CDN_FILES = 'https://cdn.shopify.com/s/files/1/0745/2550/7871/files/';

export const SHOP = {
  membership_url: 'https://js-customer-portal-staging-qkns26jte-troy-tan.vercel.app/',
  name: 'Jack Studio Marketing Sdn Bhd',
  url: 'https://www.jackstudio.com.my',
  currency: 'MYR',
  money_format: 'RM{{amount}}',
  description: 'Jack Studio is a leading leather shop in Klang, Selangor, Malaysia since 2013. We offer affordable premium leather wallets, bags, belts, luggage & gift sets. FREE embossing, gift packaging & polishing. Trusted with 5,000+ 5-star reviews (2025). Visit our store in Klang Selangor, Kuala Lumpur or order online nationwide.',
  // Homepage SEO title (Shopify: Online Store > Preferences)
  home_title: 'Jack Studio Leather Shop | Premium Bag & Wallets & Belts in Malaysia',
};
