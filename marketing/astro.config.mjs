// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://tarione.com',
  trailingSlash: 'never',
  build: {
    format: 'file'
  },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});