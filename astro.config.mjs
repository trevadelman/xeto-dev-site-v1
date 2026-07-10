import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// tailwind v4 via @tailwindcss/postcss (postcss.config.mjs) — the vite plugin
// is incompatible with astro 6's rolldown-vite as of this writing
export default defineConfig({
  site: 'https://xetodev-trev-site-v1.netlify.app',
  output: 'static',
  adapter: netlify(),
});
