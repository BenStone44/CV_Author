import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptsDirectory, '..')
const publicDirectory = resolve(appDirectory, 'public')
const outputDirectory = resolve(publicDirectory, 'site/api')
const previewDirectory = resolve(outputDirectory, 'blocks')

const families = [
  { id: 'barchart', label: 'Bar chart' },
  { id: 'areachart', label: 'Area chart' },
  { id: 'point', label: 'Point' },
  { id: 'linechart', label: 'Line chart' },
  { id: 'radar', label: 'Radar' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'arc', label: 'Arc' },
  { id: 'tree', label: 'Tree' },
  { id: 'network', label: 'Network' },
  { id: 'chord', label: 'Chord' },
  { id: 'sankey', label: 'Sankey' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'boxplot', label: 'Boxplot' },
  { id: 'geographic-point', label: 'Geographic point' },
  { id: 'geographic-line', label: 'Geographic line' },
  { id: 'geographic-area', label: 'Geographic area' },
]

const previewCandidateFallbacks = {
  'chart-block:boxplot': 'builtin-template:single-boxplot',
}

function previewSlug(specification) {
  return specification.id
    .replace(/^chart-block:/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

async function writePreview(specification, candidate) {
  if (!candidate?.src) throw new Error(`Missing catalog preview for ${specification.id}`)
  const slug = previewSlug(specification)
  if (candidate.src.startsWith('data:image/svg+xml')) {
    const separator = candidate.src.indexOf(',')
    const metadata = candidate.src.slice(0, separator)
    const encoded = candidate.src.slice(separator + 1)
    const markup = (metadata.endsWith(';base64')
      ? Buffer.from(encoded, 'base64').toString('utf8')
      : decodeURIComponent(encoded))
      .replace('<rect width="100%" height="100%" fill="#fefae0"/>', '')
    await writeFile(resolve(previewDirectory, `${slug}.svg`), markup, 'utf8')
    return `/site/api/blocks/${slug}.svg`
  }
  if (candidate.src.startsWith('/')) {
    const sourcePath = candidate.src.split('?')[0]
    const extension = sourcePath.split('.').pop() ?? 'png'
    const bytes = await readFile(resolve(publicDirectory, sourcePath.replace(/^\//, '')))
    await writeFile(resolve(previewDirectory, `${slug}.${extension}`), bytes)
    return `/site/api/blocks/${slug}.${extension}`
  }
  throw new Error(`Unsupported preview source for ${specification.id}: ${candidate.src}`)
}

await mkdir(previewDirectory, { recursive: true })

const vite = await createServer({
  root: appDirectory,
  appType: 'custom',
  logLevel: 'error',
  server: {
    middlewareMode: true,
    watch: { ignored: ['**/public/site/api/**'] },
  },
})

try {
  const registryModule = await vite.ssrLoadModule('/src/chart-blocks/registry.ts')
  const catalogModule = await vite.ssrLoadModule('/src/stores/canvas/catalog.ts')
  const specifications = registryModule.getChartBlockSpecifications()
  const candidatesById = new Map(catalogModule.implementedTemplateDefinitions
    .map((candidate) => [candidate.id, candidate]))
  const blocks = []
  for (const specification of specifications) {
    const candidate = candidatesById.get(specification.catalog.candidateId)
      ?? candidatesById.get(previewCandidateFallbacks[specification.id])
    blocks.push({
      ...specification,
      image: await writePreview(specification, candidate),
    })
  }
  await writeFile(
    resolve(outputDirectory, 'chart-blocks.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      source: 'chartBlockRegistry',
      families,
      blocks,
    }, null, 2)}\n`,
    'utf8',
  )
  process.stdout.write(`Generated API reference for ${blocks.length} Chart Blocks.\n`)
} finally {
  await vite.close()
}
