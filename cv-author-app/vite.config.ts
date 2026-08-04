import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, normalizePath, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { selectedChartNames } from './src/selectedCharts'

const virtualChartAssetsId = 'virtual:chart-assets'
const resolvedVirtualChartAssetsId = `\0${virtualChartAssetsId}`
const candidateSvgsDirectory = fileURLToPath(new URL('../candidate_svgs', import.meta.url))
const dataBindingDirectory = resolve(candidateSvgsDirectory, 'charts_svg_separated', 'data-binding')
const coordinateSystemsPath = resolve(candidateSvgsDirectory, 'charts_svg_separated', 'coordinate-systems.json')
const selectedDataBindingChartNames = selectedChartNames.filter((name) =>
  existsSync(resolve(dataBindingDirectory, `${name}.svg`)),
)

function chartAssetsPlugin(): Plugin {
  return {
    name: 'cv-author-chart-assets',
    resolveId(id) {
      return id === virtualChartAssetsId ? resolvedVirtualChartAssetsId : null
    },
    load(id) {
      if (id !== resolvedVirtualChartAssetsId) return null

      const previewImports = selectedDataBindingChartNames.map((name, index) => {
        const previewName = name === 'ConnectedDotplot19' ? 'ConnectedDotPlot19' : name
        const path = normalizePath(resolve(candidateSvgsDirectory, 'charts_png', `${previewName}.png`))
        return `import preview${index} from ${JSON.stringify(path)};`
      })
      const previewEntries = selectedDataBindingChartNames.map(
        (name, index) => `[${JSON.stringify(name)}, preview${index}]`,
      )
      const svgEntries = selectedDataBindingChartNames.map((name) => {
        const path = normalizePath(resolve(dataBindingDirectory, `${name}.svg`))
        const sourceId = `../../candidate_svgs/charts_svg_separated/data-binding/${name}.svg`
        return `${JSON.stringify(name)}: { id: ${JSON.stringify(sourceId)}, loader: () => import(${JSON.stringify(`${path}?raw`)}).then((module) => module.default) }`
      })
      let coordinateAxesByName: Record<string, unknown> = {}
      try {
        const metadata = JSON.parse(readFileSync(coordinateSystemsPath, 'utf8'))
        coordinateAxesByName = metadata?.charts ?? {}
      } catch {
        // Coordinate metadata is optional until the layer split command has run.
      }
      const coordinateEntries = selectedDataBindingChartNames.map((name) =>
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
