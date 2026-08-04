import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, normalizePath, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { selectedChartNames } from './src/selectedCharts'

const virtualChartAssetsId = 'virtual:chart-assets'
const resolvedVirtualChartAssetsId = `\0${virtualChartAssetsId}`
const visAnatomyDirectory = fileURLToPath(new URL('../VisAnatomy', import.meta.url))
const coordinateSystemsPath = resolve(visAnatomyDirectory, 'charts_svg_separated', 'coordinate-systems.json')

function chartAssetsPlugin(): Plugin {
  return {
    name: 'cv-author-chart-assets',
    resolveId(id) {
      return id === virtualChartAssetsId ? resolvedVirtualChartAssetsId : null
    },
    load(id) {
      if (id !== resolvedVirtualChartAssetsId) return null

      const previewImports = selectedChartNames.map((name, index) => {
        const path = normalizePath(resolve(visAnatomyDirectory, 'charts_png', `${name}.png`))
        return `import preview${index} from ${JSON.stringify(path)};`
      })
      const previewEntries = selectedChartNames.map(
        (name, index) => `[${JSON.stringify(name)}, preview${index}]`,
      )
      const svgEntries = selectedChartNames.map((name) => {
        const path = normalizePath(resolve(visAnatomyDirectory, 'charts_svg_separated', 'data-binding', `${name}.svg`))
        const sourceId = `../../VisAnatomy/charts_svg_separated/data-binding/${name}.svg`
        return `${JSON.stringify(name)}: { id: ${JSON.stringify(sourceId)}, loader: () => import(${JSON.stringify(`${path}?raw`)}).then((module) => module.default) }`
      })
      let coordinateAxesByName: Record<string, unknown> = {}
      try {
        const metadata = JSON.parse(readFileSync(coordinateSystemsPath, 'utf8'))
        coordinateAxesByName = metadata?.charts ?? {}
      } catch {
        // Coordinate metadata is optional until the layer split command has run.
      }
      const coordinateEntries = selectedChartNames.map((name) =>
        `${JSON.stringify(name)}: ${JSON.stringify(coordinateAxesByName[name] ?? null)}`,
      )

      return [
        ...previewImports,
        `export const previewSrcByName = new Map([${previewEntries.join(',')}]);`,
        `export const rawSvgSourceByName = {${svgEntries.join(',')}};`,
        `export const coordinateAxesByName = {${coordinateEntries.join(',')}};`,
      ].join('\n')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    chartAssetsPlugin(),
    vue(),
    vueDevTools(),
  ],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
