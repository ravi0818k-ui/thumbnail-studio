import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { htmlForRoute, ROUTES } from './src/router'

/**
 * Writes a copy of index.html at every routed path (dist/remove-background/
 * index.html), rewritten with that page's title and description. GitHub Pages
 * would otherwise answer a direct visit with its 404 fallback — the app still
 * loads, but with a 404 status a search engine will not index, and with the
 * home page's link preview.
 */
function routePages(): Plugin {
  return {
    name: 'route-pages',
    apply: 'build',
    // After vite's own HTML plugin, which is what puts index.html in the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') return
      const html = String(index.source)
      for (const route of ROUTES) {
        this.emitFile({
          type: 'asset',
          fileName: `${route.path.replace(/^\//, '')}/index.html`,
          source: htmlForRoute(html, route),
        })
      }
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), routePages()],
  server: { port: 5173 },
  worker: { format: 'es' },
})
