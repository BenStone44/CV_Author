# VisBricks Website Branch Guidelines

## Branch Purpose

This branch is exclusively for the public VisBricks website. Make website-facing changes here; develop the visualization editor, data engine, renderers, chart contracts, canvas interactions, and tests on `master`.

The public site follows this structure:

- `/`: product landing page
- `/gallery/`: visualization gallery
- `/tutorials/`: tutorials and learning content
- `/editor/`: entry point for the existing VisBricks authoring application

Keep the website shell separate from the editor. A website change must not alter editor behavior.

## In-Scope Files

Website work should normally be limited to:

- `cv-author-app/src/site/`: website Vue components, content, and styles
- `cv-author-app/public/site/`: website images and other static assets
- `cv-author-app/index.html`: landing-page metadata and entry
- `cv-author-app/gallery/`: Gallery HTML entry
- `cv-author-app/tutorials/`: Tutorials HTML entry
- `cv-author-app/editor/index.html`: editor entry metadata or website navigation integration only
- `cv-author-app/vite.config.ts`: website multi-page build configuration only
- `cv-author-app/README.md` and this file: website documentation

If an example image is needed by the Gallery or a tutorial, place a website-owned copy under `cv-author-app/public/site/`. Do not make the website depend on research notes, test fixtures, or files outside the deployable app directory.

## Protected Editor Code

Treat the following paths as read-only on this branch unless the user explicitly expands the task:

- `cv-author-app/src/components/`
- `cv-author-app/src/stores/`
- `cv-author-app/src/utils/`
- `cv-author-app/src/chart-blocks/`
- `cv-author-app/src/config/`
- `cv-author-app/src/workers/`
- `cv-author-app/src/main.ts`
- `cv-author-app/src/style.css`
- `data/`
- `cv-author-app/public/deckgl-examples/`
- `cv-author-app/public/geodata/`

Do not originate editor fixes or refactors on this branch. Implement and commit them on `master` first, then synchronize the focused `master` commit into this website branch when it needs the updated editor.

## Excluded Content

Do not add research datasets, paper archives, user-study materials, test backups, application test suites, generated logs, development screenshots, or internal design notes to this branch. Do not edit or commit `dist/`.

## Development Commands

Run commands from `cv-author-app/` with Node `^22.18.0` or `>=24.12.0`:

- `npm install`: install locked dependencies
- `npm run dev`: serve all website entries during local development
- `npm run type-check`: validate Vue and TypeScript
- `npm run build`: build the production website and editor entries

Agents may run type checks, targeted or full test suites, production builds, browser automation, screenshots, and snapshots whenever relevant to implementing or validating a change, without additional user approval. Verify visual and interaction changes in the browser. Keep generated verification artifacts in a temporary directory outside the tracked source and website assets; direct build output to a temporary directory instead of `dist/`. Report the checks performed and any remaining failures.

## Development Server Ownership

The user owns all development services and controls when they are started, stopped, or restarted. Agents may select and use ports for website development, capture, browser, and integration work. For this workspace, `http://localhost:5173` is the approved default Vite endpoint. Do not stop or restart a user-owned service unless the user explicitly requests it.

## Website Coding Conventions

Use Vue 3 Composition API, TypeScript, and two-space indentation. Use PascalCase component names and camelCase variables. Keep page content structured and reusable rather than duplicating markup between entries.

Do not use Vue `watch`, `watchEffect`, `watchPostEffect`, `watchSyncEffect`, component `$watch`, or equivalent open-ended subscriptions. Prefer pure computed state and explicit event handlers. Verify relevant additions with `rg` when reactive code is changed.

Use semantic HTML, visible keyboard focus, meaningful alternative text, sufficient contrast, and responsive layouts. Respect `prefers-reduced-motion`. Avoid controls that exist only on hover.

## Website Architecture

The landing page, Gallery, and Tutorials share the website application in `src/site/`. They must not import the editor's stores, canvas components, renderers, or data engine. The `/editor/` entry may load the existing editor through `src/main.ts`, but website components must remain independent of it.

Keep navigation URLs compatible with the `visbricks.github.io` root deployment. When adding a new top-level page, give it an explicit HTML entry and add it to Vite's multi-page build inputs.

Gallery entries and tutorial content should be represented as structured data where practical. Preserve distinct examples rather than ranking or silently hiding them. Clearly label unfinished content instead of presenting placeholders as complete documentation.

## Gallery Examples and Editor-Rendered Previews

The Gallery is a two-level experience:

- `/gallery/` is a responsive grid of finished-example preview cards.
- On desktop, the Gallery grid uses three cards per row with square preview areas. Each overview card stays intentionally compact: show chart and coordinate-system values directly as tags without visible field labels, followed by the `View example` action; keep titles available to assistive technology and reserve prose for the detail page.
- Selecting a card opens `/gallery/example/?example=<slug>`, an independent website page that explains the displayed result, its blocks, source-file format, configured bindings, and intended composition.
- The detail page owns the `Try in editor` action. Do not place the full block/data/binding walkthrough directly in the Gallery grid.

Represent Gallery entries as structured data in each case’s `case.json` and give every entry a stable slug, preview path, block list, file description, binding description, composition description, and editor starter URL. The home-page Featured section and Gallery grid must link to the matching detail page rather than directly to the editor.

Keep every Gallery example self-contained under `cv-author-app/public/site/gallery/cases/<slug>/`:

- `case.json` records the stable slug, Starter/Case identifiers, Gallery content, data files, block types, bindings, composition operations, expected render structure, and preview digest.
- `configure.js` owns the executable bindings, frames, and composition replay shared by starter and completed case. The editor supplies its existing operations through `galleryCaseLoader.ts`; do not copy case-specific setup back into stores. Shared Hierarchy also owns `chart-specs.json`.
- `index.json` in the cases directory lists all Gallery slugs in display order. The website and capture script read this manifest and each case’s metadata.
- `_editor-samples/` retains the existing chart defaults and data-menu samples still required by the editor; it is not a Gallery entry. Root-level `data/` duplicates and the duplicate public GeoJSON were removed from this website branch after byte-for-byte verification; master retains its research/source copies.
- `data/` contains website-owned CSV copies for every table used by that case. Graph examples keep node and edge CSVs beside their primary table. Do not point a Gallery case at research data or a root-level fixture without also preserving its deployable case-owned copy here.
- `preview.svg` is the preferred completed Editor export. A legacy `preview.png` is allowed only for an example that does not yet have a completed recording Case, and its unfinished status must remain explicit in `case.json`.

The Gallery detail page should expose the case-owned CSV files as direct downloads so its data description is verifiable.

Gallery previews must be exact exports of results authored and rendered by the VisBricks editor. Do not hand-draw, approximate, or visually imitate an editor result in SVG, HTML, canvas, or an image tool. A preview must use the same dataset, chart specifications, bindings, transforms, and composition operations as the corresponding editor example.

Each interactive Gallery example has two related editor entry modes:

- `?starter=<slug>` loads the example dataset and places all required blocks as independent canvas items. Every block must already have its real bindings configured so the Encoding Config Panel reflects the intended fields. The user performs the composition.
- `?case=<case-id>` is the completed recording version. It starts from the same block configuration, applies the real editor composition operations, and reaches the exact finished state shown by the website preview.

Keep starter and completed-case configuration shared where practical so bindings cannot drift. Adding a Gallery card alone is not sufficient when its `Try in editor` link promises prepared content.

To produce or refresh a preview:

1. Implement or update the configured starter using the real source data.
2. Implement the paired completed case with the editor's existing Nested, Layer, Facet, or Concat operations. Do not reproduce the composition with custom SVG markup.
3. Use the approved `http://localhost:5173` Vite endpoint unless the user supplies another endpoint. Agents may select a different port when needed, but must not stop or restart a user-owned service without explicit permission.
4. Open the completed `?case=` URL and wait for its explicit ready state. Rendering code should expose the serialized canvas output produced by `createCanvasNodesSvgMarkup`; the current capture bridge uses `window.__VISBRICKS_CASE_SVG__`.
5. Save that serialized editor output as the website-owned preview under `cv-author-app/public/site/gallery/` and reference this file from the Gallery entry.
6. Confirm the detail page and `?starter=` URL use the same dataset and bindings as the recorded case. The starter must remain uncomposed.

Run the repository capture helper from `cv-author-app/`, passing the active Vite endpoint explicitly:

```sh
npm run capture:gallery-preview -- --base-url=http://localhost:5173 --case=academic-scores-nested-concat
```

The capture is successful only when the page reports the matching `data-case-id`, reaches `data-case-status="ready"`, exposes a valid `window.__VISBRICKS_CASE_SVG__`, and the helper records the case URL, output path, and SHA-256 digest. The helper writes the case's registered asset path directly; do not redirect an arbitrary case into another Gallery item's preview.

Treat a manually created placeholder as unfinished content and label it clearly; never present it as the finished editor preview. Do not edit or commit `dist/` while generating Gallery assets.

The Academic Scores example is the reference implementation for this workflow:

- Source data: `cv-author-app/public/site/gallery/cases/academic-scores/data/academic_scores_wide.csv`
- Starter: `/editor/?starter=academic-scores`
- Completed recording case: `/editor/?case=academic-scores-nested-concat`
- Scatterplot axes: `academic_level` on X and `university_size` on Y
- Streamgraph and nested Pie values: the eight academic subject columns, configured through fold bindings
- Finished composition: Pie nested into Scatterplot points, with the Streamgraph vertically concatenated above the Scatterplot on their shared X axis

Current Academic Scores preview record (captured 2026-09-16):

- Editor source: `http://localhost:5173/editor/?case=academic-scores-nested-concat`
- Website asset: `cv-author-app/public/site/gallery/cases/academic-scores/preview.svg`
- SHA-256: `92a1ec5e8222f446023d7ebc0c03749ff41144a7652971163be89b82862e3a31`
- Editor frame: the Streamgraph and Scatterplot are each `720 × 330`, producing a `720 × 597.2175` vertically composed preview
- Export structure: one 8-series Streamgraph, one 100-point Scatterplot, and 100 nested Pie marks containing 800 arcs

Refresh this record whenever the data, bindings, editor renderer, composition operations, or generated preview changes. A screenshot may be generated temporarily for visual inspection, but it is never the Gallery preview artifact and must not be added under `public/site/gallery/`.

Current Matrix Network preview record (captured 2026-09-14 from the completed `master` configuration):

- Editor source: `http://localhost:5173/editor/?case=matrix-force-heatmap-marginal-bars`
- Website asset: `cv-author-app/public/site/gallery/cases/matrix-network/preview.svg`
- Case configuration: `cv-author-app/public/site/gallery/cases/matrix-network/case.json`
- Case data: `matrix_force_heatmap.csv`, `matrix_force_nodes.csv`, and `matrix_force_edges.csv` under the case's `data/` directory
- SHA-256: `7822a86caf45b0c936b7666dd28879bde1897ba40a597f2fe5f8d1c6ad26afe8`
- Export structure: 400 Matrix cells, 72 weighted Force nodes, 360 node Pie slices, 163 links, two Stacked Bars, and 200 marginal bar segments

Current Shared Hierarchy preview record (captured 2026-09-15):

- Gallery order: second, after Academic Scores
- Starter: `/editor/?starter=shared-hierarchy` (two independent, fully bound blocks)
- Editor source: `http://localhost:5173/editor/?case=sunburst-radial-dendrogram-shared-r`
- Case data: `cv-author-app/public/site/gallery/cases/shared-hierarchy/data/tree.csv`, the website-owned hierarchy data formerly copied from master’s `data/tree.csv` with 55 unique hierarchy nodes
- Website asset: `cv-author-app/public/site/gallery/cases/shared-hierarchy/preview.svg`
- SHA-256: `de77012aef7484eabbc30c01498bd128122fb936af2f849ef782d8bc98e2803c`
- Editor frame: `640 × 640`; real angular Concat with shared Radius, common center, and six hierarchy levels below the root
- Export structure: 54 Sunburst arcs in the lower 180°, 55 Radial Dendrogram nodes and 54 links in the upper 180°; node labels hidden, tooltips retained

Current Geographic Network preview record (captured 2026-09-16):

- Gallery order: third, after Shared Hierarchy; existing examples remain available.
- Starter: `/editor/?starter=geographic-network` (Polygon, geographic Scatterplot, and Stacked Bar are independent; Link is added by dragging its catalog item onto the Scatterplot).
- Completed case: `/editor/?case=geographic-network-layer-nested-bars`.
- Data: case-owned copies of `case2.csv`, `case2_graph_nodes.csv`, `case2_graph_links.csv`, and `nyc-zip-boundaries.geojson` under `public/site/gallery/cases/geographic-network/data/`.
- Joins: Polygon uses `incident_zip`; Scatterplot uses `geo.point`; graph endpoints use `id` / `source` / `target`.
- Composition: real Graph Link catalog drop → Polygon/Scatterplot Layer → Stacked Bar Nested on every node.
- Preview: `cv-author-app/public/site/gallery/cases/geographic-network/preview.svg`.
- SHA-256: `7941d6e0e295de740873afa7d7934411be762bdecc145d9d37c89ae79b7bc664`.
- Frame: `900 × 800`; 177 matched ZIP geometry features, 10 graph nodes, 13 links, and 10 nested charts with 12 months × 5 travel-mode series (600 bar segments).
- Export: serialized editor SVG containing the actual Mapbox/deck.gl canvas output as two embedded raster layers and the editor-rendered vector Nested charts. This is an explicit renderer export, not a browser screenshot. The case uses the editor light Mapbox style from master with the configured environment token. Polygon color aggregates sighting_count by matched ZIP geometry; ten offset message frames point back to the ten original nodes, each drawn as one closed path combining the rounded frame and tail.
- Verification: all 600 exported bar values equal their corresponding node/month/field values in the case-owned graph CSV. ZIP values absent from the supplied GeoJSON are recorded in `case.json`.

Current Dendrogram Profiles preview record (captured 2026-09-16):

- Gallery order: last; replaces the former Tree & Leaf Axis starter while preserving the `tree-leaf-axis` slug.
- Starter: `/editor/?starter=tree-leaf-axis` (three independent, fully bound blocks).
- Completed case: `/editor/?case=dendrogram-nested-radial-area`.
- Data: `public/site/gallery/cases/tree-leaf-axis/data/tree_nodes.csv`, originally copied from master’s `data/tree_nodes.csv`; 15 nodes × 12 months, with five numeric metrics.
- Bindings: Dendrogram `node_id` / `parent_id`; Sector Radial Stacked Bar `month` with `metric_1`–`metric_5` folded to `metric` / `metric_value`; Area Chart `month` / `metric_1`.
- Composition: left-to-right Dendrogram; two real Nested operations on every node, radial stacks on the left and areas on the right. Both inherit only `node_id`; original node dots are hidden. Links leave the right edge of the combined child footprint and enter the next pair’s left edge.
- Frame: `1600 × 1800`; exported footprint `1818.007817864418 × 2002`, approximately square.
- Export structure: 15 structural nodes, 14 links, 30 Nested relationships, 900 radial sectors, and 15 areas with 12 monthly points each.
- Preview: `cv-author-app/public/site/gallery/cases/tree-leaf-axis/preview.svg`.
- SHA-256: `a8a823685fc8ae9c353cfb09a1c8690aed916bfcd18d835632461ed6fd8cabb7`.

## Anonymous Production Publishing

- For every future production release, follow the [reusable publishing procedure in `cv-author-app/README.md`](cv-author-app/README.md#repeatable-anonymous-publishing-procedure). This is the required default workflow, not merely a record of the first deployment. A documentation or local commit request alone does not authorize a new deployment.
- The primary public deployment target is `https://visbricks.github.io/`, backed by `VisBricks/visbricks.github.io` on `main`. A local source commit is not a deployment. The release command performs all automated checks before pushing; post-push production verification is user-owned and must not be run by agents unless the user explicitly requests it.
- Anonymity is a release requirement. Audit rendered pages, HTML metadata, bundled JavaScript/CSS, SVG/image metadata, downloadable files, public links, commit metadata, and the publishing identity before any external write.
- Publish only reviewed production artifacts from a temporary build directory into a separate checkout of the Pages repository. Never push or merge this development repository's source history, remote configuration, research files, logs, credentials, source maps, or internal documentation into that public repository. Preserve required third-party licenses and attribution.
- Use the existing project-only release identity for both Git author and committer: `VisBricks <visbricks-site@users.noreply.github.com>`. Apply it only to the isolated publishing checkout/command; do not overwrite global Git identity or rewrite development history. Do not include personal signatures, co-author trailers, source-repository links, or development commit hashes in public release messages.
- Anonymous commit metadata alone is insufficient. Verify the authenticated publisher independently; use a repository-scoped deploy key or a project-owned GitHub App/automation identity that has been reviewed for public identity leakage. Do not publish with a personal-account SSH key or token. Never request that private keys or tokens be pasted into chat or committed.
- If a suitable publishing identity is unavailable, stop before pushing, report that the release remains unpublished, and ask the user to configure project-scoped credentials securely. Do not weaken anonymity requirements or promise absolute anonymity from GitHub or repository administrators.
- Audit existing public history and visible organization/profile links; do not force-push or delete history to conceal identity without explicit user approval. Use a normal fast-forward update of the verified target.
- Before pushing, verify the isolated production build at `/`, `/gallery/`, `/gallery/example/?example=shared-hierarchy`, `/tutorials/`, `/api/`, `/editor/`, every prepared starter, and every completed case. After pushing, report the exact deployment commit as published and awaiting user verification. Move it into the verified release record only after the user confirms the production checks documented in `cv-author-app/README.md`.

### Latest Published Release Awaiting User Verification

- Pushed on `2026-09-16` to `VisBricks/visbricks.github.io`, `main`.
- Deployment commit: `c4b0583c78366f2b01d7d9ee83c2064e280dd5d9` (`Publish on-demand editor data loading`).
- Authentication used the repository-scoped deploy key; both author and committer are `VisBricks <visbricks-site@users.noreply.github.com>`.
- All automated pre-push gates passed: source cleanliness, generated assets, publishing identity and dry-run, type checking, fresh temporary production build, anonymity and source-map audit, stale-file review, staged diff checks, and the isolated browser matrix for the website entries, all 16 prepared starters, and all 16 completed cases.
- The release adds raster Gallery thumbnails and on-demand editor data loading. A normal editor launch makes no initial case CSV requests; selecting a sample loads that sample, and Gallery starter/completed-case routes load only their case-owned data.
- Post-push checks were intentionally not completed by the agent. This release remains published but unverified until the user confirms the Pages workflow and production behavior.

### Latest Verified Production Release

- Published and verified on `2026-09-15` at `https://visbricks.github.io/`.
- Public repository and branch: `VisBricks/visbricks.github.io`, `main`.
- Deployment commit: `11161403630971581423a3bcc3304cdc814dac3e` (`Publish API catalog and polar concat improvements`).
- Authentication used the repository-scoped deploy key; both author and committer are `VisBricks <visbricks-site@users.noreply.github.com>`. The update preserved public history and did not publish development repository history.
- GitHub's `pages build and deployment` workflow [34937923699](https://github.com/VisBricks/visbricks.github.io/actions/runs/34937923699) succeeded for this exact commit.
- Staged and live browser verification passed for the homepage, Gallery, Shared Hierarchy detail, Tutorials, API reference, editor entry, all six prepared starters, and all six completed cases. Completed cases reached their explicit ready state and exposed valid serialized SVG; Shared Hierarchy remains the second Gallery card.
- All 169 non-hidden public files matched the staged production bytes during live verification, including the homepage, API catalog and block assets, Gallery case metadata/data/previews, editor bundles, and third-party license notice. Eleven obsolete hashed assets were backed up outside the publishing checkout, removed from the release, and confirmed unavailable on the live site.
- Type checking and a fresh production build passed. The release publishes the API catalog, homepage chart imagery, Gallery editor guidance, and the real Facet/drop-zone Polar Concat with working radial handles and a refreshed editor-rendered preview. Build chunk-size warnings remain.
- User-approved identity exception: the user explicitly approved retaining the existing Mapbox style URLs and public client token, including their map-account identifiers. This exception applies to the unchanged map configuration; it does not permit publishing other personal identifiers or development credentials. The rest of the scoped audit found no known personal/development identifiers or source maps. Do not describe this release as fully anonymous.
- Public `case.json` preview source URLs were normalized to the production origin and internal source-branch fields removed from the release artifacts. Internal release notes and local verification scripts were not published.

## Git Boundaries

Commit website changes only to this branch. Keep each commit focused on website structure, content, styling, assets, accessibility, or deployment configuration. Do not merge website-only cleanup back into `master`, because the removed tests, research files, and development documentation remain intentionally owned by `master`.
