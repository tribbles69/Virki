import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// Emits sw.js with a per-build cache name and the list of every built file,
// so the whole game is cached on first visit and old caches are cleared on update.
function serviceWorker(): Plugin {
  return {
    name: 'virki-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = ['./', ...Object.keys(bundle).map((f) => `./${f}`)];
      const extra = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
      const precache = [...new Set([...files, ...extra.map((f) => `./${f}`)])];
      const template = readFileSync('sw/sw.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace('__CACHE_NAME__', `virki-${pkg.version}-${Date.now().toString(36)}`)
          .replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  // Relative paths so the same build works at /virki/ on GitHub Pages or anywhere else.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorker()],
});
