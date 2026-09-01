import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, normalizePath, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const virtualChartAssetsId = 'virtual:chart-assets'
const resolvedVirtualChartAssetsId = `\0${virtualChartAssetsId}`
const templateDirectory = fileURLToPath(new URL('./templates', import.meta.url))
const templateDefinitions = (existsSync(templateDirectory)
  ? readdirSync(templateDirectory, { withFileTypes: true })
  : [])
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const directory = resolve(templateDirectory, entry.name)
    const metadata = JSON.parse(readFileSync(resolve(directory, 'template.json'), 'utf8'))
    return {
      name: metadata.name,
      chartType: metadata.chartType,
      coordinateSystem: metadata.coordinateSystem,
      renderedSvgPath: resolve(directory, metadata.renderedSvg),
      previewPath: resolve(directory, metadata.preview),
    }
  })
  .filter((template) => existsSync(template.renderedSvgPath) && existsSync(template.previewPath))
  .sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }))

function chartAssetsPlugin(): Plugin {
  return {
    name: 'cv-author-chart-assets',
    resolveId(id) {
      return id === virtualChartAssetsId ? resolvedVirtualChartAssetsId : null
    },
    load(id) {
      if (id !== resolvedVirtualChartAssetsId) return null

      const previewImports = templateDefinitions.map((template, index) => {
        const path = normalizePath(template.previewPath)
        return `import preview${index} from ${JSON.stringify(path)};`
      })
      const previewEntries = templateDefinitions.map(
        (template, index) => `[${JSON.stringify(template.name)}, preview${index}]`,
      )
      const svgEntries = templateDefinitions.map((template) => {
        const path = normalizePath(template.renderedSvgPath)
        const sourceId = `../../templates/${template.name}/rendered.svg`
        return `${JSON.stringify(template.name)}: { id: ${JSON.stringify(sourceId)}, loader: () => import(${JSON.stringify(`${path}?raw`)}).then((module) => module.default) }`
      })
      const catalog = templateDefinitions.map(({ name, chartType, coordinateSystem }) => ({ name, chartType, coordinateSystem }))

      return [
        ...previewImports,
        `export const templateCatalog = ${JSON.stringify(catalog)};`,
        `export const previewSrcByName = new Map([${previewEntries.join(',')}]);`,
        `export const rawSvgSourceByName = {${svgEntries.join(',')}};`,
        'export const coordinateAxesByName = {};',
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
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        dendrogramPlayground: fileURLToPath(new URL('./dendrogram-playground.html', import.meta.url)),
      },
    },
  },
})
