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

Do not use this branch to fix or refactor the editor. Put such work on `master`, then rebase the website branch if the website needs the updated editor.

## Excluded Content

Do not add research datasets, paper archives, user-study materials, test backups, application test suites, generated logs, development screenshots, or internal design notes to this branch. Do not edit or commit `dist/`.

## Development Commands

Run commands from `cv-author-app/` with Node `^22.18.0` or `>=24.12.0`:

- `npm install`: install locked dependencies
- `npm run dev`: serve all website entries during local development
- `npm run type-check`: validate Vue and TypeScript
- `npm run build`: build the production website and editor entries

Verification is user-triggered. Do not run type checks, builds, tests, or browser automation unless the user requests them.

## Development Server Ownership

The user owns all development services. The user starts and stops Vite or any backend and provides the ports. Agents must not start, stop, restart, or choose ports. Use only user-provided running endpoints for browser or integration checks.

## Website Coding Conventions

Use Vue 3 Composition API, TypeScript, and two-space indentation. Use PascalCase component names and camelCase variables. Keep page content structured and reusable rather than duplicating markup between entries.

Do not use Vue `watch`, `watchEffect`, `watchPostEffect`, `watchSyncEffect`, component `$watch`, or equivalent open-ended subscriptions. Prefer pure computed state and explicit event handlers. Verify relevant additions with `rg` when reactive code is changed.

Use semantic HTML, visible keyboard focus, meaningful alternative text, sufficient contrast, and responsive layouts. Respect `prefers-reduced-motion`. Avoid controls that exist only on hover.

## Website Architecture

The landing page, Gallery, and Tutorials share the website application in `src/site/`. They must not import the editor's stores, canvas components, renderers, or data engine. The `/editor/` entry may load the existing editor through `src/main.ts`, but website components must remain independent of it.

Keep navigation URLs compatible with the `visbricks.github.io` root deployment. When adding a new top-level page, give it an explicit HTML entry and add it to Vite's multi-page build inputs.

Gallery entries and tutorial content should be represented as structured data where practical. Preserve distinct examples rather than ranking or silently hiding them. Clearly label unfinished content instead of presenting placeholders as complete documentation.

## Git Boundaries

Commit website changes only to this branch. Keep each commit focused on website structure, content, styling, assets, accessibility, or deployment configuration. Do not merge website-only cleanup back into `master`, because the removed tests, research files, and development documentation remain intentionally owned by `master`.
