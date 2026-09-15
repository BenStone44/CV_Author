<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ApiBlockSpecification, ApiCatalog } from './apiCatalog'
import type { GalleryItem } from './galleryCases'

const { galleryItems, apiCatalog } = defineProps<{
  galleryItems: GalleryItem[]
  apiCatalog: ApiCatalog | null
}>()
const galleryCasePath = '/site/gallery/cases'

type SitePage = 'home' | 'gallery' | 'galleryDetail' | 'tutorials' | 'api'

const normalizedPath = window.location.pathname.replace(/\/+$/, '')
const page: SitePage = normalizedPath.endsWith('/gallery/example')
  ? 'galleryDetail'
  : normalizedPath.endsWith('/gallery')
    ? 'gallery'
    : normalizedPath.endsWith('/tutorials')
      ? 'tutorials'
      : normalizedPath.endsWith('/api')
        ? 'api'
        : 'home'

const requestedGallerySlug = new URLSearchParams(window.location.search).get('example')
const selectedGalleryItem = galleryItems.find((item) => item.slug === requestedGallerySlug) ?? galleryItems[0]!
const galleryDetailHref = (item: GalleryItem) => `/gallery/example/?example=${encodeURIComponent(item.slug)}`
const galleryCardTags = (item: GalleryItem) => [...item.blocks, ...item.coordinateSystems]

type HeroChartNode = {
  title: string
  image: string
  slot: number
  emphasized?: boolean
}

const heroChartPath = '/site/home/charts'
const heroChartNodes: Record<string, HeroChartNode[]> = {
  'academic-scores': [
    { title: 'Streamgraph', image: `${heroChartPath}/streamgraph.png`, slot: 1 },
    { title: 'Scatterplot', image: `${heroChartPath}/scatterplot.png`, slot: 2 },
    { title: 'Pie Chart', image: `${heroChartPath}/pie-chart.png`, slot: 4 },
  ],
  'shared-hierarchy': [
    { title: 'Sunburst', image: `${heroChartPath}/sunburst.png`, slot: 1 },
    { title: 'Radial Dendrogram', image: `${heroChartPath}/radial-dendrogram.png`, slot: 4 },
  ],
  'geographic-network': [
    { title: 'Polygon', image: `${heroChartPath}/polygon-layer.png`, slot: 1 },
    { title: 'Scatterplot', image: `${heroChartPath}/scatterplot-layer.png`, slot: 2 },
    { title: 'Graph Link', image: `${heroChartPath}/graph-link-geographic.png`, slot: 3 },
    { title: 'Stacked Bar', image: `${heroChartPath}/stacked-bar.png`, slot: 4 },
  ],
  'polar-facet': [
    { title: 'Chord', image: `${heroChartPath}/chord.png`, slot: 1, emphasized: true },
    { title: 'Circular Stacked Bar', image: `${heroChartPath}/circular-stacked-bar.png`, slot: 4 },
  ],
  'matrix-network': [
    { title: 'Matrix', image: `${heroChartPath}/matrix.png`, slot: 1 },
    { title: 'Force Network', image: `${heroChartPath}/force-network.png`, slot: 2 },
    { title: 'Top Stacked Bar', image: `${heroChartPath}/stacked-bar.png`, slot: 3 },
    { title: 'Right Stacked Bar', image: `${heroChartPath}/stacked-bar.png`, slot: 4 },
  ],
  'tree-leaf-axis': [
    { title: 'Dendrogram', image: `${heroChartPath}/dendrogram.png`, slot: 1 },
    { title: 'Radial Stacked Bar', image: `${heroChartPath}/radial-stacked-bar.png`, slot: 3 },
    { title: 'Area Chart', image: `${heroChartPath}/area-chart.png`, slot: 4 },
  ],
}

const activeHeroCaseIndex = ref(0)
const activeHeroCase = computed(() => galleryItems[activeHeroCaseIndex.value] ?? galleryItems[0]!)
const activeHeroCharts = computed(() => heroChartNodes[activeHeroCase.value.slug] ?? [])

if (page === 'galleryDetail') document.title = `${selectedGalleryItem.title} · VisBricks Gallery`
if (page === 'api') document.title = 'API · VisBricks'

type CompositionTypeId = 'layer' | 'concat' | 'facet' | 'nested'
type ApiCoordinateSystem = ApiBlockSpecification['coordinateSystem']

const apiCoordinateSystems: Array<{
  id: ApiCoordinateSystem
  label: string
  symbol: string
}> = [
  { id: 'Cartesian', label: 'Cartesian', symbol: 'X / Y' },
  { id: 'Polar', label: 'Polar', symbol: 'θ / R' },
  { id: 'CoordinateFree', label: 'Free', symbol: '○' },
  { id: 'Geographic', label: 'Geographic', symbol: '⌖' },
]

const compositionTypes: Array<{
  id: CompositionTypeId
  number: string
  title: string
  description: string
  coordinateNotes: Record<ApiCoordinateSystem, string>
}> = [
  {
    id: 'layer',
    number: '01',
    title: 'Layer',
    description: 'Overlay compatible blocks in one spatial frame. Shared references determine which axes or projection remain common.',
    coordinateNotes: {
      Cartesian: 'Share X, Y, or both inside the plot area.',
      Polar: 'Share Angle, Radius, or both around one center.',
      CoordinateFree: 'No registered Layer surface.',
      Geographic: 'Stack deck.gl blocks on the same map projection.',
    },
  },
  {
    id: 'concat',
    number: '02',
    title: 'Concat',
    description: 'Join complete views at an outer drop zone while preserving a compatible positional reference.',
    coordinateNotes: {
      Cartesian: 'Horizontal shares Y; vertical shares X.',
      Polar: 'Radial shares Angle; angular shares Radius.',
      CoordinateFree: 'No registered Concat surface.',
      Geographic: 'No registered Concat surface.',
    },
  },
  {
    id: 'facet',
    number: '03',
    title: 'Facet',
    description: 'Repeat one block from selected dimension fields, producing small multiples with a declared layout.',
    coordinateNotes: {
      Cartesian: 'Use row and column dimensions.',
      Polar: 'Use theta and radius dimensions.',
      CoordinateFree: 'Repeat the block from a structural field clue.',
      Geographic: 'Not enabled for map blocks.',
    },
  },
  {
    id: 'nested',
    number: '04',
    title: 'Nested',
    description: 'Embed a child block into repeated marks or structural targets and inherit the parent context for filtering.',
    coordinateNotes: {
      Cartesian: 'Target bars, points, nodes, or other marks.',
      Polar: 'Target sectors, nodes, and other polar marks.',
      CoordinateFree: 'Target hierarchy or network structures.',
      Geographic: 'Point blocks can parent; every map block can be a child.',
    },
  },
]

const expandedApiBlockId = ref<string | null>(null)
const apiFamilies = computed(() => (apiCatalog?.families ?? []).map((family) => ({
  ...family,
  blocks: (apiCatalog?.blocks ?? [])
    .filter((block) => block.families.includes(family.id))
    .sort((left, right) => {
      const leftOrder = left.catalog.familyOrder?.[family.id] ?? Number.MAX_SAFE_INTEGER
      const rightOrder = right.catalog.familyOrder?.[family.id] ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder || left.label.localeCompare(right.label)
    }),
})).filter((family) => family.blocks.length))

function compositionSupportLabel(type: CompositionTypeId, coordinateSystem: ApiCoordinateSystem) {
  const blocks = (apiCatalog?.blocks ?? []).filter((block) => block.coordinateSystem === coordinateSystem)
  if (type === 'nested') {
    const parents = blocks.filter((block) => block.composition.nested.asParent).length
    const children = blocks.filter((block) => block.composition.nested.asChild).length
    return parents || children ? `${parents} parent · ${children} child` : 'Not registered'
  }
  const count = blocks.filter((block) => block.composition[type].enabled).length
  return count ? `${count} blocks` : 'Not registered'
}

function compositionIsSupported(type: CompositionTypeId, coordinateSystem: ApiCoordinateSystem) {
  return compositionSupportLabel(type, coordinateSystem) !== 'Not registered'
}

function compositionDropCue(type: CompositionTypeId, coordinateSystem: ApiCoordinateSystem) {
  if (!compositionIsSupported(type, coordinateSystem)) return 'No drop surface'
  if (type === 'layer') return coordinateSystem === 'Geographic' ? 'Drop on map' : 'Drop on plot'
  if (type === 'concat') return coordinateSystem === 'Polar' ? 'Drop at ring edge' : 'Drop at outer edge'
  if (type === 'facet') return coordinateSystem === 'Polar' ? 'Bind θ / R fields' : 'Bind facet fields'
  return coordinateSystem === 'Geographic' ? 'Drop on map point' : 'Drop on repeated mark'
}

function blockCompositionLabels(block: ApiBlockSpecification) {
  return [
    block.composition.layer.enabled ? 'Layer' : '',
    block.composition.concat.enabled ? 'Concat' : '',
    block.composition.facet.enabled ? 'Facet' : '',
    block.composition.nested.asParent || block.composition.nested.asChild ? 'Nested' : '',
  ].filter(Boolean)
}

function blockAnchor(familyId: string, block: ApiBlockSpecification) {
  return `${familyId}-${block.id}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
}

function toggleBlockSpecification(instanceId: string) {
  expandedApiBlockId.value = expandedApiBlockId.value === instanceId ? null : instanceId
}

function formatBlockSpecification(block: ApiBlockSpecification) {
  const { image: _image, ...specification } = block
  return JSON.stringify(specification, null, 2)
}

const tutorials = [
  {
    number: '01',
    title: 'Start with a chart block',
    description: 'Open the editor, choose a complete visualization unit, and place it on the canvas.',
    steps: ['Open the chart catalog', 'Drag a block onto the canvas', 'Move and resize the selected unit'],
  },
  {
    number: '02',
    title: 'Bind your own CSV data',
    description: 'Import a table and use a deliberate column drop to explore structurally legal encodings.',
    steps: ['Import a CSV file', 'Drag one column to a chart', 'Confirm one of the valid intents'],
  },
  {
    number: '03',
    title: 'Compose multiple views',
    description: 'Build Layer, Concat, Facet, and Nested structures while preserving each chart as a unit.',
    steps: ['Start a composition drag', 'Choose a visible drop zone', 'Inspect the resulting composite'],
  },
]
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="wordmark" href="/" aria-label="VisBricks home">
        <span class="wordmark-mark" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </span>
        <span>VisBricks</span>
      </a>

      <nav class="site-nav" aria-label="Primary navigation">
        <a href="/" :aria-current="page === 'home' ? 'page' : undefined">Home</a>
        <a href="/gallery/" :aria-current="page === 'gallery' || page === 'galleryDetail' ? 'page' : undefined">Gallery</a>
        <a href="/tutorials/" :aria-current="page === 'tutorials' ? 'page' : undefined">Tutorials</a>
        <a href="/api/" :aria-current="page === 'api' ? 'page' : undefined">API</a>
      </nav>

      <a class="header-cta" href="/editor/">Open editor <span aria-hidden="true">↗</span></a>
    </header>

    <main v-if="page === 'home'">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">COMPOSABLE VISUAL AUTHORING</p>
          <h1>Build visualizations<br><em>like building with bricks.</em></h1>
          <p class="hero-lede">
            VisBricks helps you author expressive data graphics by arranging complete chart blocks,
            binding data, and composing views directly on a visual canvas.
          </p>
          <div class="hero-actions">
            <a class="button button-primary" href="/editor/">Start creating <span aria-hidden="true">→</span></a>
            <a class="button button-secondary" href="/gallery/">Explore gallery</a>
          </div>
        </div>

        <div class="hero-visual" aria-label="Gallery compositions and the chart blocks used to build them">
          <Transition name="hero-case" mode="out-in">
            <div :key="activeHeroCase.slug" class="hero-network-stage">
              <div class="hero-network-grid" aria-hidden="true"></div>
              <svg class="hero-network-lines" viewBox="0 0 640 500" preserveAspectRatio="none" aria-hidden="true">
                <path v-if="activeHeroCharts.some((chart) => chart.slot === 1)" d="M112 75 C180 78 186 150 234 181" />
                <path v-if="activeHeroCharts.some((chart) => chart.slot === 2)" d="M528 82 C463 88 454 151 405 180" />
                <path v-if="activeHeroCharts.some((chart) => chart.slot === 3)" d="M110 423 C175 410 185 354 231 324" />
                <path v-if="activeHeroCharts.some((chart) => chart.slot === 4)" d="M531 419 C469 407 456 353 410 325" />
              </svg>

              <a class="hero-case-card" :href="galleryDetailHref(activeHeroCase)">
                <span class="hero-case-eyebrow">COMPOSED CASE · {{ activeHeroCase.number }}</span>
                <span class="hero-case-image">
                  <img :src="activeHeroCase.image" :alt="`${activeHeroCase.title} finished composition`">
                </span>
                <span class="hero-case-caption">
                  <strong>{{ activeHeroCase.title }}</strong>
                  <span aria-hidden="true">↗</span>
                </span>
              </a>

              <figure
                v-for="chart in activeHeroCharts"
                :key="`${activeHeroCase.slug}-${chart.title}`"
                class="hero-chart-node"
                :class="[`hero-chart-node--${chart.slot}`, { 'hero-chart-node--emphasized': chart.emphasized }]"
              >
                <img :src="chart.image" alt="">
                <figcaption>{{ chart.title }}</figcaption>
              </figure>
            </div>
          </Transition>

          <div class="hero-case-picker" role="group" aria-label="Choose a Gallery case to preview">
            <button
              v-for="(item, index) in galleryItems"
              :key="item.slug"
              type="button"
              :aria-label="`Show ${item.title}`"
              :aria-pressed="activeHeroCaseIndex === index"
              :title="item.title"
              @click="activeHeroCaseIndex = index"
            >
              <img :src="item.image" alt="">
              <span>{{ item.number }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="manifesto section-wrap">
        <p class="section-kicker">A VISUAL COMPOSITION WORKFLOW</p>
        <h2>Charts are complete units,<br>not anonymous marks.</h2>
        <p>
          Every block owns its data, encodings, transforms, marks, and coordinate system. Compose
          them without losing the structure that makes each visualization meaningful.
        </p>
        <div class="principle-grid">
          <article>
            <span>01</span>
            <h3>Choose a block</h3>
            <p>Begin with a chart contract that declares its roles and structural capabilities.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Bind your data</h3>
            <p>Drag the exact CSV column you intend to use and confirm a legal interpretation.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Compose the view</h3>
            <p>Layer, concatenate, facet, or nest complete units through explicit drop zones.</p>
          </article>
        </div>
      </section>

      <section class="featured section-wrap">
        <div class="section-heading">
          <div>
            <p class="section-kicker">MADE WITH VISBRICKS</p>
            <h2>Featured compositions</h2>
          </div>
          <a class="text-link" href="/gallery/">View the gallery <span aria-hidden="true">→</span></a>
        </div>
        <div class="featured-grid">
          <a v-for="item in galleryItems.slice(0, 3)" :key="item.title" class="gallery-card" :href="galleryDetailHref(item)">
            <div class="gallery-image"><img :src="item.image" :alt="item.title"></div>
            <div class="gallery-card-copy">
              <h3>{{ item.title }}</h3>
              <span>{{ item.tags.join(' · ') }}</span>
            </div>
          </a>
        </div>
      </section>

      <section class="learn-band">
        <div class="section-wrap learn-inner">
          <div>
            <p class="section-kicker">LEARN BY BUILDING</p>
            <h2>Your first composition,<br>one step at a time.</h2>
          </div>
          <div class="learn-copy">
            <p>Follow short, focused walkthroughs covering chart blocks, CSV binding, and structural composition.</p>
            <a class="button button-light" href="/tutorials/">Read the tutorials <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>
    </main>

    <main v-else-if="page === 'gallery'" class="subpage">
      <section class="page-intro section-wrap">
        <p class="section-kicker">GALLERY</p>
        <h1>Choose the pieces.<br>Compose the result.</h1>
        <p>Browse finished compositions, then open any example to inspect its blocks, source-file shape, and preset bindings.</p>
      </section>
      <section class="gallery-overview-grid section-wrap" aria-label="VisBricks examples">
        <a
          v-for="item in galleryItems"
          :key="item.title"
          class="gallery-overview-card"
          :href="galleryDetailHref(item)"
          :aria-label="`View ${item.title} example`"
        >
          <div class="gallery-overview-image">
            <img :src="item.image" :alt="`${item.title} finished composition preview`">
          </div>
          <div class="gallery-overview-copy">
            <ul class="tag-list gallery-overview-tags" aria-label="Chart and coordinate-system types">
              <li v-for="tag in galleryCardTags(item)" :key="tag">{{ tag }}</li>
            </ul>
            <span class="overview-link">View example <span aria-hidden="true">→</span></span>
          </div>
        </a>
      </section>
    </main>

    <main v-else-if="page === 'galleryDetail'" class="subpage gallery-detail-page">
      <article class="section-wrap">
        <a class="back-link" href="/gallery/"><span aria-hidden="true">←</span> Back to gallery</a>
        <div class="gallery-detail-hero">
          <div class="gallery-detail-image">
            <span class="gallery-item-number">{{ selectedGalleryItem.number }}</span>
            <img :src="selectedGalleryItem.image" :alt="`${selectedGalleryItem.title} finished composition preview`">
          </div>
          <div class="gallery-detail-intro">
            <ul class="tag-list" aria-label="Composition types">
              <li v-for="tag in selectedGalleryItem.tags" :key="tag">{{ tag }}</li>
            </ul>
            <p class="section-kicker">GALLERY STARTER</p>
            <h1>{{ selectedGalleryItem.title }}</h1>
            <p>{{ selectedGalleryItem.description }}</p>
            <div class="detail-intro-action">
              <a class="button button-primary" :href="selectedGalleryItem.tryHref">Try in editor <span aria-hidden="true">→</span></a>
              <a v-if="selectedGalleryItem.caseHref" class="button button-secondary" :href="selectedGalleryItem.caseHref">View completed case <span aria-hidden="true">→</span></a>
              <span>Data and bindings are prepared for you.</span>
            </div>
          </div>
        </div>

        <div class="gallery-detail-content">
          <section class="detail-section">
            <p class="detail-section-label">01 · BLOCKS</p>
            <div>
              <h2>What is already on the canvas</h2>
              <p>These complete visualization units open separately in the editor, so you can choose how to compose them.</p>
              <ul class="detail-block-list">
                <li v-for="block in selectedGalleryItem.blocks" :key="block"><span aria-hidden="true"></span>{{ block }}</li>
              </ul>
            </div>
          </section>

          <section class="detail-section">
            <p class="detail-section-label">02 · DATA</p>
            <div>
              <h2>Source-file format</h2>
              <div class="detail-file-card">
                <span>{{ selectedGalleryItem.file.type }}</span>
                <strong>{{ selectedGalleryItem.file.name }}</strong>
                <div>
                  <p>{{ selectedGalleryItem.file.description }}</p>
                  <ul class="detail-file-links" aria-label="Case data files">
                    <li v-for="fileName in selectedGalleryItem.file.files" :key="fileName">
                      <a :href="`${galleryCasePath}/${selectedGalleryItem.slug}/data/${fileName}`" download>{{ fileName }}</a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section class="detail-section">
            <p class="detail-section-label">03 · BINDING</p>
            <div>
              <h2>Fields selected for you</h2>
              <p>The starter applies these bindings before the editor opens.</p>
              <dl class="detail-binding-list">
                <div v-for="binding in selectedGalleryItem.bindings" :key="`${binding.field}-${binding.role}`">
                  <dt>{{ binding.field }}</dt>
                  <dd>{{ binding.role }}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="detail-compose-card">
            <div>
              <p class="detail-section-label">COMPOSITION IDEA</p>
              <h2>Now make it yours.</h2>
              <p>{{ selectedGalleryItem.composition }}</p>
            </div>
            <a class="button button-light" :href="selectedGalleryItem.tryHref">Open this starter <span aria-hidden="true">→</span></a>
          </section>
        </div>
      </article>
    </main>

    <main v-else-if="page === 'api'" class="subpage api-page">
      <section class="api-intro section-wrap">
        <p class="section-kicker">VISBRICKS API</p>
        <h1>Composition rules.<br>Block specifications.</h1>
        <p>
          A visual reference for how complete Chart Blocks compose, what data roles each block accepts,
          and which spatial surfaces its specification exposes.
        </p>
        <dl class="api-summary">
          <div><dt>Composition types</dt><dd>04</dd></div>
          <div><dt>Block families</dt><dd>{{ apiFamilies.length.toString().padStart(2, '0') }}</dd></div>
          <div><dt>Registered blocks</dt><dd>{{ (apiCatalog?.blocks.length ?? 0).toString().padStart(2, '0') }}</dd></div>
        </dl>
      </section>

      <div class="api-layout section-wrap">
        <aside class="api-index">
          <nav aria-label="API sections">
            <div>
              <p>01 · COMPOSITION TYPES</p>
              <a v-for="composition in compositionTypes" :key="composition.id" :href="`#composition-${composition.id}`">
                <span>{{ composition.number }}</span>{{ composition.title }}
              </a>
            </div>
            <div>
              <p>02 · BLOCK FAMILIES</p>
              <a v-for="family in apiFamilies" :key="family.id" :href="`#family-${family.id}`">
                {{ family.label }} <span>{{ family.blocks.length }}</span>
              </a>
            </div>
          </nav>
        </aside>

        <div class="api-reference">
          <section id="composition-types" class="api-reference-section">
            <div class="api-section-heading">
              <p class="detail-section-label">01 · COMPOSITION TYPES</p>
              <div>
                <h2>One operation, different spatial logic.</h2>
                <p>Availability is calculated from the current registered Block specifications. Counts show how many blocks expose each composition surface.</p>
              </div>
            </div>

            <div class="composition-reference-list">
              <article
                v-for="composition in compositionTypes"
                :id="`composition-${composition.id}`"
                :key="composition.id"
                class="composition-reference-card"
              >
                <header>
                  <div class="composition-reference-icon" :class="`composition-reference-icon--${composition.id}`" aria-hidden="true">
                    <i></i><i></i><i></i><i></i>
                  </div>
                  <div>
                    <span>{{ composition.number }}</span>
                    <h3>{{ composition.title }}</h3>
                  </div>
                  <code>{{ composition.id }}()</code>
                </header>
                <p>{{ composition.description }}</p>
                <div class="composition-coordinate-grid">
                  <section v-for="coordinate in apiCoordinateSystems" :key="coordinate.id">
                    <div class="composition-coordinate-heading">
                      <span aria-hidden="true">{{ coordinate.symbol }}</span>
                      <h4>{{ coordinate.label }}</h4>
                    </div>
                    <div
                      class="composition-flow-diagram"
                      :class="[
                        `composition-flow-diagram--${composition.id}`,
                        `composition-flow-diagram--${coordinate.id.toLowerCase()}`,
                        { 'composition-flow-diagram--unsupported': !compositionIsSupported(composition.id, coordinate.id) },
                      ]"
                      role="img"
                      :aria-label="`${composition.title} in ${coordinate.label}: ${compositionDropCue(composition.id, coordinate.id)}`"
                    >
                      <div class="composition-flow-inputs" aria-hidden="true">
                        <span><i></i><i></i><i></i><i></i></span>
                        <b>+</b>
                        <span><i></i><i></i><i></i><i></i></span>
                      </div>
                      <div class="composition-flow-action" aria-hidden="true">
                        <span>{{ compositionDropCue(composition.id, coordinate.id) }}</span>
                        <i>→</i>
                      </div>
                      <div class="composition-flow-result" aria-hidden="true">
                        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
                      </div>
                    </div>
                    <strong>{{ compositionSupportLabel(composition.id, coordinate.id) }}</strong>
                    <p>{{ composition.coordinateNotes[coordinate.id] }}</p>
                  </section>
                </div>
              </article>
            </div>
          </section>

          <section id="block-specifications" class="api-reference-section api-block-reference">
            <div class="api-section-heading">
              <p class="detail-section-label">02 · FAMILY &amp; BLOCK SPECIFICATION</p>
              <div>
                <h2>Every registered Chart Block.</h2>
                <p>Blocks follow the same immutable specification shape. Expand a card to inspect roles, spatial references, structural targets, drop areas, renderer identity, and the complete JSON.</p>
              </div>
            </div>

            <section
              v-for="family in apiFamilies"
              :id="`family-${family.id}`"
              :key="family.id"
              class="api-family-section"
            >
              <header class="api-family-heading">
                <div>
                  <p>{{ family.id }}</p>
                  <h3>{{ family.label }}</h3>
                </div>
                <span>{{ family.blocks.length.toString().padStart(2, '0') }} blocks</span>
              </header>

              <div class="api-block-grid">
                <article
                  v-for="block in family.blocks"
                  :id="blockAnchor(family.id, block)"
                  :key="block.id"
                  class="api-block-card"
                  :class="{
                    'api-block-card--expanded': expandedApiBlockId === blockAnchor(family.id, block),
                    'api-block-card--chord': block.chartType === 'Chord',
                  }"
                >
                  <div class="api-block-overview">
                    <div class="api-block-image">
                      <img :src="block.image" :alt="`${block.label} Chart Block preview`">
                    </div>
                    <div class="api-block-copy">
                      <div class="api-block-flags">
                        <span>{{ block.coordinateSystem }}</span>
                        <span>{{ block.dataShape }}</span>
                        <span v-if="block.catalog.unavailable">Unavailable</span>
                        <span v-if="block.catalog.hidden">Hidden</span>
                      </div>
                      <h4>{{ block.label }}</h4>
                      <code>{{ block.chartType }}</code>
                      <dl class="api-block-facts">
                        <div>
                          <dt>Required roles</dt>
                          <dd>{{ block.roles.filter((role) => role.required).map((role) => role.label).join(' · ') || 'None' }}</dd>
                        </div>
                        <div>
                          <dt>Composition</dt>
                          <dd>{{ blockCompositionLabels(block).join(' · ') || 'None' }}</dd>
                        </div>
                        <div>
                          <dt>Renderer</dt>
                          <dd>{{ block.renderer.kind }} · {{ block.renderer.key }}@{{ block.renderer.version }}</dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        :aria-expanded="expandedApiBlockId === blockAnchor(family.id, block)"
                        :aria-controls="`${blockAnchor(family.id, block)}-specification`"
                        @click="toggleBlockSpecification(blockAnchor(family.id, block))"
                      >
                        {{ expandedApiBlockId === blockAnchor(family.id, block) ? 'Hide specification' : 'View specification' }}
                        <span aria-hidden="true">{{ expandedApiBlockId === blockAnchor(family.id, block) ? '−' : '+' }}</span>
                      </button>
                    </div>
                  </div>

                  <section
                    v-if="expandedApiBlockId === blockAnchor(family.id, block)"
                    :id="`${blockAnchor(family.id, block)}-specification`"
                    class="api-block-specification"
                    :aria-label="`${block.label} specification`"
                  >
                    <dl class="api-spec-meta">
                      <div><dt>Block ID</dt><dd><code>{{ block.id }}</code></dd></div>
                      <div><dt>Schema / revision</dt><dd>v{{ block.schemaVersion }} / r{{ block.revision }}</dd></div>
                      <div><dt>Default size</dt><dd>{{ block.catalog.defaultSize.width }} × {{ block.catalog.defaultSize.height }}</dd></div>
                      <div><dt>Families</dt><dd>{{ block.families.join(' · ') }}</dd></div>
                    </dl>

                    <div class="api-spec-group">
                      <h5>Role bindings</h5>
                      <div class="api-table-wrap">
                        <table>
                          <thead><tr><th>Role</th><th>Kind</th><th>Channel</th><th>Cardinality</th><th>Accepts</th></tr></thead>
                          <tbody>
                            <tr v-for="role in block.roles" :key="role.id">
                              <td><strong>{{ role.label }}</strong><code>{{ role.id }}</code></td>
                              <td>{{ role.kind }}</td>
                              <td><code>{{ role.channel }}</code></td>
                              <td>{{ role.required ? 'required' : 'optional' }} · {{ role.minFields }}–{{ role.maxFields }}</td>
                              <td>{{ role.accepts.join(', ') }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div class="api-spec-columns">
                      <section class="api-spec-group">
                        <h5>Spatial references</h5>
                        <ul>
                          <li v-for="reference in block.spatialReferences" :key="reference.id">
                            <code>{{ reference.id }}</code>
                            <span>{{ reference.semantic }} · {{ reference.exposure }}</span>
                          </li>
                        </ul>
                      </section>
                      <section class="api-spec-group">
                        <h5>Structural targets</h5>
                        <ul v-if="block.structuralTargets.length">
                          <li v-for="target in block.structuralTargets" :key="target.id">
                            <code>{{ target.id }}</code>
                            <span>{{ target.markRole }} · {{ target.repeated ? 'repeated' : 'single' }}</span>
                          </li>
                        </ul>
                        <p v-else>None declared.</p>
                      </section>
                      <section class="api-spec-group">
                        <h5>Drop areas</h5>
                        <ul v-if="block.composition.dropAreas.length">
                          <li v-for="area in block.composition.dropAreas" :key="area.id">
                            <code>{{ area.id }}</code>
                            <span>{{ area.operation }} · {{ area.geometry.kind }}<template v-if="area.geometry.boundary"> · {{ area.geometry.boundary }}</template></span>
                          </li>
                        </ul>
                        <p v-else>None declared.</p>
                      </section>
                    </div>

                    <details class="api-json-specification">
                      <summary>Complete JSON specification</summary>
                      <pre><code>{{ formatBlockSpecification(block) }}</code></pre>
                    </details>
                  </section>
                </article>
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>

    <main v-else class="subpage tutorial-page">
      <section class="page-intro section-wrap">
        <p class="section-kicker">TUTORIALS</p>
        <h1>Learn VisBricks<br>by making a view.</h1>
        <p>Three practical introductions take you from an empty canvas to a composed visualization.</p>
      </section>
      <section class="tutorial-list section-wrap">
        <article v-for="tutorial in tutorials" :key="tutorial.number" class="tutorial-card">
          <div class="tutorial-number">{{ tutorial.number }}</div>
          <div class="tutorial-copy">
            <p class="tutorial-label">GETTING STARTED</p>
            <h2>{{ tutorial.title }}</h2>
            <p>{{ tutorial.description }}</p>
          </div>
          <ol>
            <li v-for="step in tutorial.steps" :key="step">{{ step }}</li>
          </ol>
        </article>
      </section>
      <section class="tutorial-cta section-wrap">
        <p>Ready to try it with your own data?</p>
        <a class="button button-primary" href="/editor/">Open the editor <span aria-hidden="true">→</span></a>
      </section>
    </main>

    <footer class="site-footer">
      <a class="wordmark wordmark-footer" href="/">
        <span class="wordmark-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span>VisBricks</span>
      </a>
      <p>Composable visual authoring for expressive data graphics.</p>
      <div class="footer-links">
        <a href="/gallery/">Gallery</a>
        <a href="/tutorials/">Tutorials</a>
        <a href="/api/">API</a>
        <a href="/editor/">Editor</a>
      </div>
    </footer>
  </div>
</template>
