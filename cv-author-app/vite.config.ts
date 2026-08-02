import { fileURLToPath, URL } from 'node:url'
import { basename, dirname, extname, resolve } from 'node:path'
import { unlink } from 'node:fs/promises'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const chartsDirectory = fileURLToPath(new URL('../charts_svg', import.meta.url))

function svgDeletePlugin(): Plugin {
  return {
    name: 'delete-svg-candidate',
    configureServer(server) {
      server.middlewares.use('/api/svg-candidates', async (request, response, next) => {
        if (request.method !== 'DELETE') {
          next()
          return
        }

        const fileName = decodeURIComponent((request.url ?? '').replace(/^\//, ''))
        if (
          !fileName
          || basename(fileName) !== fileName
          || extname(fileName).toLowerCase() !== '.svg'
        ) {
          response.statusCode = 400
          response.end('Invalid SVG filename')
          return
        }

        const filePath = resolve(chartsDirectory, fileName)
        if (dirname(filePath) !== chartsDirectory) {
          response.statusCode = 400
          response.end('Invalid SVG path')
          return
        }

        try {
          await unlink(filePath)
          response.statusCode = 204
          response.end()
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          response.statusCode = code === 'ENOENT' ? 404 : 500
          response.end(code === 'ENOENT' ? 'SVG file not found' : 'Unable to delete SVG file')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    svgDeletePlugin(),
  ],
  server: {
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
