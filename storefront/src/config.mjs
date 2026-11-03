import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(here, '..');
export const THEME_DIR = resolve(ROOT, '../shopify-theme');
export const DATA_DIR = resolve(ROOT, '../data');
export const OUT_DIR = resolve(ROOT, 'dist');

// Images still live on the existing Shopify CDN until they are moved to our own storage.
export const CDN_FILES = 'https://cdn.shopify.com/s/files/1/0745/2550/7871/files/';

export const SHOP = {
  name: 'Jack Studio Marketing Sdn Bhd',
  url: 'https://www.jackstudio.com.my',
  currency: 'MYR',
  money_format: 'RM{{amount}}',
  description: '',
};
