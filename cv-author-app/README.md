# cv-author-app

The chart library uses the curated names in `src/selectedCharts.ts`. Preview
images are loaded from `../VisAnatomy/charts_png`, and editable SVG sources are
loaded from `../VisAnatomy/charts_svg`.

## Generate separated chart layers

The curated charts can be split into coordinate-system and content SVGs using
their matching VisAnatomy annotations:

```sh
npm run split:charts
```

The command reads `src/selectedCharts.ts` and writes transparent coordinate
layers, complete non-coordinate content layers, data-binding-only mark layers,
and `manifest.json` to
`../VisAnatomy/charts_svg_separated`. Source SVGs are never overwritten. Use
`npm run split:charts -- --charts BarChart1,PolarAreaChart1` to process a small
named subset. Known upstream SVG/annotation export mismatches are documented in
`scripts/chart-layer-overrides.json` and reported as fallbacks in the manifest.
The `data-binding` directory is the minimal layer for composition: it contains
only graphical elements with non-empty `encodingInfo` (including expanded
group bindings), without chart titles, legends, annotations, or backgrounds.
The same command also writes `../VisAnatomy/charts_svg_separated/coordinate-systems.json`.
It records each generated chart's axis origin and unit directions; unavailable
values are `null` when the annotation does not provide enough axis geometry.
Coordinates use the source SVG coordinate space (therefore positive Y points
downward), and direction vectors are normalized.
When a chart carrying this metadata is selected on the canvas, the editor draws
the two corresponding arrows from the recorded origin; charts with `null`
metadata remain unchanged.

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Run the API (Linux)

Install the Python dependencies once, then start the FastAPI service:

```sh
python3 -m venv .venv
./.venv/bin/python -m pip install -r server_python/requirements.txt
npm run dev:api
```

The API listens on `http://127.0.0.1:8787`.

### Run Frontend and API Together (Linux)

```sh
npm run dev:all
```

The frontend is available at `http://127.0.0.1:5173` and proxies `/api` requests to the API service.

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
