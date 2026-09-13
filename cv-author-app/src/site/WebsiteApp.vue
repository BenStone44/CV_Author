<script setup lang="ts">
import areaPreview from '../../../docs/screenshots/area-chart-block-dense-preview.png'
import chordPreview from '../../../docs/screenshots/chord-polar-line-facet-concat.png'
import matrixPreview from '../../../docs/screenshots/matrix-pie-network-marginal-bars.png'
import radialPreview from '../../../docs/screenshots/sunburst-radial-dendrogram-shared-r.png'
import treePreview from '../../../docs/screenshots/tree-leaf-labels-black.png'

type SitePage = 'home' | 'gallery' | 'tutorials'

type GalleryItem = {
  title: string
  description: string
  image: string
  tags: string[]
}

const normalizedPath = window.location.pathname.replace(/\/+$/, '')
const page: SitePage = normalizedPath.endsWith('/gallery')
  ? 'gallery'
  : normalizedPath.endsWith('/tutorials')
    ? 'tutorials'
    : 'home'

const galleryItems: GalleryItem[] = [
  {
    title: 'Dense Area Composition',
    description: 'A layered area-chart block composed from reusable visual units.',
    image: areaPreview,
    tags: ['Cartesian', 'Layer'],
  },
  {
    title: 'Polar Facet Concat',
    description: 'Chord and polar line views joined through explicit shared channels.',
    image: chordPreview,
    tags: ['Polar', 'Facet', 'Concat'],
  },
  {
    title: 'Matrix, Pie & Network',
    description: 'A multiview arrangement built by composing heterogeneous chart blocks.',
    image: matrixPreview,
    tags: ['Matrix', 'Nested'],
  },
  {
    title: 'Shared Hierarchy Depth',
    description: 'Sunburst and radial dendrogram views aligned on one hierarchy scale.',
    image: radialPreview,
    tags: ['Hierarchy', 'Polar'],
  },
  {
    title: 'Tree & Leaf Axis',
    description: 'A Cartesian tree exposing its ordered terminal leaves as a shared axis.',
    image: treePreview,
    tags: ['Tree', 'Cartesian'],
  },
]

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
        <a href="/gallery/" :aria-current="page === 'gallery' ? 'page' : undefined">Gallery</a>
        <a href="/tutorials/" :aria-current="page === 'tutorials' ? 'page' : undefined">Tutorials</a>
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

        <div class="hero-visual" aria-label="An abstract composition of visualization blocks">
          <div class="hero-grid"></div>
          <div class="visual-card visual-card-area">
            <span class="card-label">AREA</span>
            <svg viewBox="0 0 260 120" role="img" aria-label="Layered area chart">
              <path d="M8 102 C45 84 54 91 82 62 C110 33 133 83 160 52 C191 17 214 52 252 24 L252 112 L8 112 Z" fill="#ff775f" opacity=".9" />
              <path d="M8 106 C38 70 67 94 94 76 C122 58 143 84 174 64 C204 44 226 70 252 52 L252 112 L8 112 Z" fill="#ffd05b" opacity=".88" />
            </svg>
          </div>
          <div class="visual-card visual-card-donut">
            <span class="card-label">POLAR</span>
            <div class="donut-art"><span></span></div>
          </div>
          <div class="visual-card visual-card-bars">
            <span class="card-label">CONCAT</span>
            <div class="bar-art"><i></i><i></i><i></i><i></i><i></i></div>
          </div>
          <div class="composition-link" aria-hidden="true">+</div>
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
          <a v-for="item in galleryItems.slice(0, 3)" :key="item.title" class="gallery-card" href="/gallery/">
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
        <h1>Compositions made<br>from complete chart blocks.</h1>
        <p>Explore examples across Cartesian, Polar, Tree, and heterogeneous coordinate systems.</p>
      </section>
      <section class="gallery-page-grid section-wrap" aria-label="VisBricks examples">
        <article v-for="item in galleryItems" :key="item.title" class="gallery-card gallery-card-large">
          <div class="gallery-image"><img :src="item.image" :alt="item.title"></div>
          <div class="gallery-card-copy">
            <div>
              <h2>{{ item.title }}</h2>
              <p>{{ item.description }}</p>
            </div>
            <ul class="tag-list" aria-label="Composition types">
              <li v-for="tag in item.tags" :key="tag">{{ tag }}</li>
            </ul>
          </div>
        </article>
      </section>
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
        <a href="/editor/">Editor</a>
      </div>
    </footer>
  </div>
</template>
