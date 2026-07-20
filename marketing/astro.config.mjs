// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Must match the domain Vercel serves without a redirect. The apex
  // (tarione.com) 308s to this host, so declaring it as canonical here
  // made every canonical/sitemap URL require a redirect hop before
  // resolving — which is why Search Console flagged them as unindexable.
  site: 'https://www.tarione.com',
  trailingSlash: 'never',
  build: {
    format: 'file'
  },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});