import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// tailwind v4 via @tailwindcss/postcss (postcss.config.mjs) — the vite plugin
// is incompatible with astro 6's rolldown-vite as of this writing
//
// Fully static site — no adapter. All Netlify routing rules live in
// public/_redirects (copied verbatim into dist/).
export default defineConfig({
  site: 'https://xetodev-trev-site-v1.netlify.app',
  output: 'static',
  integrations: [sitemap()],
});
