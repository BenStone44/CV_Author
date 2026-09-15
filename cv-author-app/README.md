# VisBricks Website

This branch contains the public VisBricks website and its browser-based editor. It is built with Vue 3 and Vite.

Website-only components live in `src/site/`. The existing authoring application remains under `src/components/` and is exposed through the separate `/editor/` entry. Research datasets, archived tests, development notes, and paper artifacts are intentionally kept on `master` rather than this deployment-focused branch.

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

### Website Entries

The primary public site is **https://visbricks.github.io/**. Publication must preserve author anonymity: deploy reviewed production artifacts to the separate `VisBricks/visbricks.github.io` repository (`main`), without copying development Git history or private project files.

Use the project-only Git author and committer `VisBricks <visbricks-site@users.noreply.github.com>` in the isolated deployment checkout. This does not anonymize the authenticated pusher: publishing also requires a reviewed repository-scoped deploy key or project-owned automation identity, not personal-account credentials. Configure credentials securely outside the repository; never paste secrets into chat. If that identity is not available, publication must remain paused.

Before publishing, inspect the complete production output for personal identifiers, source-repository references, metadata, and source maps, while retaining required third-party attribution. Build outside `dist/`, preserve existing public history, and verify the live site and Gallery/editor entry modes before reporting the release as deployed. See the root `AGENTS.md` for the full anonymity and release checklist.

Latest verified release: `2026-09-15`, public deployment commit `fe4de535aa2d2af039275bbb99d91502c392a00d`. Publication used the repository-scoped deploy key and project-only author/committer identity, preserving public history. GitHub Pages workflow `34920222219` succeeded. Staged and live checks passed for all website entries, six Gallery details, six prepared starters, and six completed cases; every case's metadata, SVG preview, and data download matched the release bytes. The user approved retaining the existing Mapbox account identifiers in its style URLs/public token; all other scoped identity checks passed. See `AGENTS.md` for the full verification record.

The production site is split into focused static entries:

- `/`: product landing page
- `/gallery/`: visualization composition gallery
- `/tutorials/`: guided introductions
- `/editor/`: the complete VisBricks authoring application

Vite builds all four entries together. The editor remains isolated from the public website shell, so website design work does not alter the canvas application's component hierarchy.

### Repeatable Anonymous Publishing Procedure

Use this workflow for subsequent user-authorized releases to `https://visbricks.github.io/`. It records the procedure used successfully on `2026-09-15`. Do not publish merely because source files or this documentation have changed. Run the command blocks step by step in the same Bash session, stopping on failures and completing the manual review gates between them. Do not reuse an old temporary build as a new release.

#### 1. Confirm the source and dedicated publishing identity

Inspect the source branch, worktree changes, and applicable `AGENTS.md` instructions. Preserve unrelated local changes. Editor changes must first be committed on `master` and deliberately synchronized into this website branch. Publishing the website does not mean committing all dirty source files or pushing this development repository.

The existing repository-scoped key is stored at `/home/jovyan/.ssh/visbricks_pages_deploy`, outside the repository. Its verified public fingerprint is `SHA256:F/IfvYwTRWEPRoM/r7Fv8LHiTMpuGaS1FvrHkSy1JFE`. Reuse this key; do not generate a replacement or fall back to personal credentials without approval. Never print, copy into documentation, or publish private key contents. These workspace paths are operational documentation, not public website assets.

```sh
cd /home/jovyan/CV_Author
git status --short
git branch --show-current
ssh-keygen -lf /home/jovyan/.ssh/visbricks_pages_deploy.pub
ssh -T -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o ConnectTimeout=10 -i /home/jovyan/.ssh/visbricks_pages_deploy git@github.com
```

The successful authentication message must identify `VisBricks/visbricks.github.io`, not a personal account. GitHub's successful SSH authentication test returns exit code `1` because it does not provide shell access; judge this test by the explicit authentication message. Missing keys, unexpected identity, or denied access block publication.

#### 2. Prepare an isolated checkout and fresh production build

```sh
visbricks_release_dir=$(mktemp -d /tmp/visbricks-release.XXXXXX)
visbricks_deploy_ssh='ssh -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 -i /home/jovyan/.ssh/visbricks_pages_deploy'
GIT_SSH_COMMAND="$visbricks_deploy_ssh" git clone --branch main --single-branch git@github.com:VisBricks/visbricks.github.io.git "$visbricks_release_dir/pages"
git -C "$visbricks_release_dir/pages" config --local core.sshCommand "$visbricks_deploy_ssh"
git -C "$visbricks_release_dir/pages" config --local user.name VisBricks
git -C "$visbricks_release_dir/pages" config --local user.email visbricks-site@users.noreply.github.com
git -C "$visbricks_release_dir/pages" config --local commit.gpgsign false
git -C "$visbricks_release_dir/pages" remote -v
git -C "$visbricks_release_dir/pages" log --format='%h %an <%ae> | %cn <%ce> | %s'
git -C "$visbricks_release_dir/pages" push --dry-run origin HEAD:refs/heads/main
cd /home/jovyan/CV_Author/cv-author-app
npm run type-check
./node_modules/.bin/vite build --outDir "$visbricks_release_dir/build"
```

Confirm every command succeeded before continuing. Use the repository-required Node version and locked dependencies. The dry run checks the publishing connection; only the eventual push establishes that the update was accepted. Review existing public commit identities and visible organization/profile links for anonymity risks. Do not rewrite history to hide unexpected identifiers. Do not modify global Git identity, the source repository's remote, or `dist/`.

#### 3. Review and stage production artifacts only

Audit the fresh build and then the entire proposed public file tree, including retained files. The existing Mapbox style URLs and public token have an explicit user-approved exception recorded in `AGENTS.md`; do not treat this as approval to publish other identity-bearing configuration. Check HTML, JavaScript/CSS, SVG/image metadata, CSV/JSON downloads, public links, filenames, and commit metadata for personal names/emails, source-repository names/URLs, local filesystem paths, credentials, and source maps. Obtain known local Git identities for the audit without printing private information. Investigate matches; retain required third-party licenses and attribution. Stop if the anonymity review fails. Never copy `.git`, source history, internal Markdown, logs, screenshots, research files, or credentials into the publishing tree.

Before staging, normalize `preview.source` in built Gallery `case.json` files to the public completed-case URL and remove internal source-branch fields. Retain source-worktree capture records locally. Include the installed runtime dependencies' full license notices in `THIRD_PARTY_LICENSES.txt` and expose them with a `rel="license"` link in the HTML entries; preserve third-party attribution. Do not copy package manifests, `node_modules`, private configuration, or internal publishing scripts as a substitute for license notices. Preserve CSV contents and line endings; `git -c core.whitespace=cr-at-eol diff --cached --check` accepts existing CSV CRLF without rewriting the data.

Compare the new build with tracked files in the isolated Pages checkout. Move explicitly identified obsolete generated assets into a backup directory under the new temporary release directory, outside `pages/`. Do not use a blanket recursive deletion or delete-sync against the checkout. Preserve `.git`, `.nojekyll`, and any reviewed deployment configuration such as `CNAME` or `.github/` when present. Do not retain obsolete downloadable assets unintentionally.

After reviewing the copy targets and obsolete assets:

```sh
cp -a "$visbricks_release_dir/build/." "$visbricks_release_dir/pages/"
git -C "$visbricks_release_dir/pages" status --short
git -C "$visbricks_release_dir/pages" diff --stat
git -C "$visbricks_release_dir/pages" diff --check
```

Test the staged production bundle in a browser before pushing. The successful release used Playwright request routing to serve staged files at the production origin, without starting or restarting a development service. Use equivalent isolated production verification for later releases; a Vite development-page check alone is insufficient. Temporary checking scripts and reports belong outside the source and publishing tree and may need to be recreated if a previous temporary directory is gone.

#### 4. Commit and push only the reviewed release

Run this block only after all previous gates pass. `git add -A` is intentionally restricted to the isolated public-artifact checkout, never the source worktree.

```sh
git -C "$visbricks_release_dir/pages" add -A
git -C "$visbricks_release_dir/pages" diff --cached --stat
git -C "$visbricks_release_dir/pages" diff --cached --check
```

Review the staged changes, including removals and all newly added files. If there are no changes, do not manufacture a release commit. Otherwise use a project-only message describing the actual release; the following is the title used for the recorded deployment:

```sh
GIT_AUTHOR_NAME=VisBricks GIT_AUTHOR_EMAIL=visbricks-site@users.noreply.github.com GIT_COMMITTER_NAME=VisBricks GIT_COMMITTER_EMAIL=visbricks-site@users.noreply.github.com git -C "$visbricks_release_dir/pages" -c commit.gpgsign=false commit -m "Publish VisBricks website and gallery updates"
git -C "$visbricks_release_dir/pages" log -1 --format='%H%n%an <%ae>%n%cn <%ce>%n%s'
```

Verify both identities are exactly `VisBricks <visbricks-site@users.noreply.github.com>` and that the message contains no personal signatures, development commit hashes, or source-repository links. Then publish:

```sh
GIT_SSH_COMMAND="$visbricks_deploy_ssh" git -C "$visbricks_release_dir/pages" push origin HEAD:refs/heads/main
git -C "$visbricks_release_dir/pages" status --short
```

Use a normal fast-forward push only. If the remote advanced, fetch and review it before preparing a new release; never force-push. If SSH times out, retry with the same dedicated identity after inspecting the connection; do not switch to personal credentials. If push completion is uncertain, compare the remote branch with the local release commit before retrying.

#### 5. Verify the actual public deployment and record the outcome

Wait for GitHub's `pages build and deployment` workflow to report success for the exact release commit. Check the repository's Actions page or public API at `https://api.github.com/repos/VisBricks/visbricks.github.io/actions/runs?per_page=5`. A successful push alone is not successful publication. If the workflow or live checks fail, report the release as pushed but not verified; do not silently roll back or report completion.

Repeat the staged browser checks against the real public origin, with no local request interception:

- `/`, `/gallery/`, `/gallery/example/?example=shared-hierarchy`, `/tutorials/`, and `/editor/`: successful responses, correct page content, loaded assets, and no application errors or failed same-origin requests. Confirm Shared Hierarchy remains the second Gallery card.
- `/editor/?starter=<slug>` for every Gallery entry in `/site/gallery/cases/index.json`: matching starter identity, `data-starter-status="ready"`, and independent blocks with their intended bindings. The current six include `geographic-network` and `tree-leaf-axis`.
- `/editor/?case=<case-id>` using each manifest entry’s `completedCase`: matching `data-case-id`, `data-case-status="ready"`, and valid SVG in `window.__VISBRICKS_CASE_SVG__`. Verify all six completed cases, including Geographic Network and Dendrogram Profiles.
- Compare the live homepage, `/site/gallery/cases/shared-hierarchy/preview.svg`, and `/site/gallery/cases/shared-hierarchy/data/tree.csv` byte-for-byte or by SHA-256 with the staged release. Also verify assets affected by the new release. Account for cache propagation before concluding the deployed bytes are wrong.

Expand this matrix whenever new Gallery entries or routes are added. After successful live verification, update the release record in root `AGENTS.md` and this README with the actual date, public deployment commit, publishing identity, checks performed, and unresolved warnings or failures. Do not copy these internal records into the public artifact repository or trigger another deployment just to record the completed release. Keep recovery artifacts outside the repository; any cleanup must target explicitly verified temporary paths. Never delete the deploy key as part of cleanup.

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

## Geographic Network Gallery case

The third Gallery example is `/gallery/example/?example=geographic-network`. Its case-owned CSVs, ZIP GeoJSON, recording metadata, and exported preview are in `public/site/gallery/cases/geographic-network/`.

- `/editor/?starter=geographic-network` prepares independent Polygon, geographic Scatterplot, and Stacked Bar blocks with real data bindings.
- `/editor/?case=geographic-network-layer-nested-bars` replays the Graph Link drop onto Scatterplot, geographic Layer, and per-node Nested operations.
- Polygon joins `case2.csv.incident_zip`; Scatterplot joins `geo.point`. The ten nested charts inherit `point` and fold the five travel-mode fields over twelve months. All 600 exported values have been checked against the case CSV.
- Map export embeds the live Mapbox/deck.gl renderer output and retains the actual nested chart SVG, including message frames with integrated tails anchored to the nodes; each frame and tail form one closed SVG path. The case uses the editor light map style from master and the configured VITE_MAPBOX_TOKEN environment value. Polygon color aggregates sighting_count by matched ZIP geometry.

Refresh with the running endpoint:

```sh
npm run capture:gallery-preview -- --base-url=http://localhost:5173 --case=geographic-network-layer-nested-bars
```

The latest local preview digest and unmatched ZIP values are recorded in `case.json`; the production release record above is unchanged. Include this detail route, starter, completed case, preview, and all four downloads in the next authorized production verification.

## Dendrogram Profiles Gallery case

The final Gallery example, `/gallery/example/?example=tree-leaf-axis`, uses the matching `tree_nodes.csv`: fifteen hierarchy nodes with twelve monthly observations and five metrics per node.

- `/editor/?starter=tree-leaf-axis` prepares an independent Dendrogram, Sector Radial Stacked Bar, and Area Chart with real bindings.
- `/editor/?case=dendrogram-nested-radial-area` enters the tree node level and performs two real Nested batches on all fifteen nodes. The tree grows left to right; radial stacks sit on the left and areas on the right, replacing the original node dots. Links connect the outer edges of the combined child footprints, including their offsets.
- Both child charts inherit `node_id`, retaining all twelve months. Radial stacks fold `metric_1`–`metric_5`; areas use `metric_1` over `month`.
- The `1600 × 1800` tree frame yields an approximately square `1827.5 × 2002` export with 900 sectors and fifteen monthly areas. The case-owned CSV, metadata, and completed SVG are in `public/site/gallery/cases/tree-leaf-axis/`.

Refresh from the running endpoint:

```sh
npm run capture:gallery-preview -- --base-url=http://localhost:5173 --case=dendrogram-nested-radial-area
```

The recorded preview digest is in `case.json` and `AGENTS.md`. Include this detail route, starter, completed case, preview, and CSV download in the next authorized production verification.

## Case-owned data and configuration

All deployable example data now lives in `public/site/gallery/cases/`:

```text
cases/
  index.json                 # Six Gallery slugs in display order
  <slug>/
    case.json                # Gallery text, files, bindings, operations, preview record
    configure.js             # Executable starter/completed-case configuration
    data/                    # CSVs and any GeoJSON owned by this case
    preview.svg              # Exact recorded editor output
  shared-hierarchy/
    chart-specs.json          # Shared Sunburst / Radial Dendrogram definitions
  _editor-samples/
    case.json                # Inventory of retained editor support data
    data/                    # Existing chart defaults and data-menu samples
```

The website reads `index.json` and each `case.json`. The editor loads each case’s configuration through `src/utils/galleryCaseLoader.ts`, which exposes the existing editor operations to the case module. Starter and completed case execute the same configuration, with composition enabled only for the completed case. Update bindings and layout in `configure.js` and keep the descriptive record in `case.json` consistent. Update Gallery prose only in `case.json`.

The capture script discovers IDs and output paths from the same manifests. After changing a rendered case, capture its preview; the capture script updates the source URL, capture date, and digest in `case.json` automatically. Image URLs use that digest to refresh browser caches. Keep preview SVGs unchanged during a pure file reorganization unless verification finds an existing mismatch. This cleanup refreshed the outdated Academic Scores export after confirming the extracted configuration renders identically to the original setup.

Cleanup removed 22 root-level CSV copies, the duplicate ZIP GeoJSON, the obsolete Shared Hierarchy monthly CSV, and two unused legacy images. Every removed data copy was checked byte-for-byte against its retained case-owned file. The eleven CSVs under `_editor-samples` remain because the editor still uses them; they are not additional Gallery examples.
