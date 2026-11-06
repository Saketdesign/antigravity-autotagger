import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Eagle opens dist/index.html straight from disk (file://). Module scripts and
// crossorigin attributes are unreliable there, so emit one classic script.
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      const scripts: string[] = [];
      const rest = html
        .replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>\s*/g, (_, src) => {
          scripts.push(`<script defer src="${src}"></script>`);
          return '';
        })
        .replace(/ crossorigin/g, '');
      return rest.replace('</body>', `${scripts.join('\n')}\n</body>`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), classicScript()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife' } },
  },
});
