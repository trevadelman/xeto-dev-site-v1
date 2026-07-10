import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

// tailwind v4 via @tailwindcss/postcss (postcss.config.mjs) — the vite plugin
// is incompatible with astro 6's rolldown-vite as of this writing
export default defineConfig({
  site: 'https://xetodev-trev-site-v1.netlify.app',
  output: 'static',
  adapter: netlify(),
  // dev server doesn't serve public/ directory indexes (Netlify does);
  // hash fragments survive the redirect client-side
  redirects: {
    '/explorer': '/explorer/index.html',
    // marketing intro moved to /learn; /docs is now the language reference
    '/docs': '/docs/lang',
  },
});
