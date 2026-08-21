# Repository Guidelines

## Project Structure

The app is in `cv-author-app/`; source and tests are in `src/`. Samples are under `data/`, templates under `cv-author-app/templates/`, and notes under `docs/`. Do not edit `dist/`.

## Development Commands

Run commands from `cv-author-app/` with Node `^22.18.0` or `>=24.12.0`:

- `npm install`: install locked dependencies.
- `npm run dev`: start Vite.
- `npm test`: run Vitest once.
- `npm run type-check`: validate Vue and TypeScript.
- `npm run build`: create the production bundle.

## Coding Conventions

Use Vue 3 Composition API, TypeScript, and two-space indentation. Use PascalCase components, camelCase functions/variables, and `use` prefixes for stores/composables. Preserve `noUncheckedIndexedAccess`.

## CSV-Native Data Engine

Raw CSV rows are the source of truth; do not recreate `CubeResult`, `CubeBinding`, or permanent dimension/measure classes. The primary interaction is user-triggered inference: a user drags one CSV column into a chart, and that column becomes the explicit inference input. Keep the existing automatic-detection code available for diagnostics or explicitly requested workflows, but do not invoke it automatically on CSV import, chart creation, rendering, or background state changes.

### Column-Triggered Intent Inference

The interactive engine receives the dataset, current chart contract, existing bindings `B`, one `inputColumn`, and the drop context. Treat the drag as evidence that the user wants to use that exact column. Enumerate every structurally legal intent involving `inputColumn`, such as binding it to a channel, using it as a series, faceting, aggregating, or upgrading the chart structure. Return the resulting action and complete role binding for each intent. Preserve distinct valid bindings and do not silently substitute another unused column.

Dropping on a specific axis or channel supplies the intended role, so validate that binding directly. Dropping on the chart body leaves the role ambiguous, so enumerate all legal interpretations for the input column and let the user choose. Do not scan unrelated columns to create unsolicited recommendations, and do not mutate the chart until an intent is confirmed.

Each chart contract must declare required and optional roles, allowed field types per role, minimum and maximum role counts, whether one field may occupy multiple roles, relevant cardinality or structural constraints, its aggregation policy, and whether visual dimensions must functionally determine values. `ChartValid` checks the complete proposed binding rather than applying chart-name patches in the search algorithm.

Classify each proposed interpretation as `VALID`, `DIMENSION_OVERFLOW`, `DIMENSION_UNDERFLOW`, `TYPE_MISMATCH`, or `UNRESOLVABLE`. One input column may produce multiple valid intents. If it cannot satisfy the selected interpretation, report that result instead of automatically choosing another field.

### Optional Automatic Repair Model

The existing full-dataset repair path may remain as a separate, explicitly invoked API. In that mode, let `U` be all remaining CSV fields and enumerate every inclusion-minimal repair: no proper subset of its added field set has any binding that makes the chart valid. Do not reduce this to globally minimum cardinality, and preserve distinct role bindings for the same field set. Interactive drag inference must not call this mode implicitly.

### Dimension Overflow

Dimension overflow means the current dimensions `K` do not functionally determine values `V`. For interactive inference, test whether adding `inputColumn` resolves the conflicts; do not search for a different column. The optional automatic mode may use `analyzeCsvGrain(dataset, keyFields, valueFields)` to find every inclusion-minimal supplemental dimension set as a minimal hitting-set problem:

1. Group rows by the complete tuple of values in `K`.
2. Within each group, create a conflict pair `(ri, rj)` for every pair whose complete `V` tuples differ. Ignore non-conflict pairs.
3. For each conflict pair `p`, compute `Dp = { f in U | f(ri) != f(rj) }`.
4. If any `Dp` is empty, the overflow is unresolvable using `U`.
5. Otherwise enumerate all inclusion-minimal hitting sets `S` of the family of sets `Dp`; each one satisfies `K union S -> V` and no field can be removed while retaining that dependency.

### Dimension Underflow

Dimension underflow means required chart roles or independent grouping structure are missing. It is a role-assignment constraint problem, not generally a conflict-pair hitting-set problem. In the interactive path, enumerate compatible assignments of `inputColumn` to the available roles. The optional automatic path may enumerate assignments of fields in `U` with backtracking or another complete CSP, SAT, or ILP approach.

Check role counts, type compatibility, exclusivity, maximum dimension counts, cardinality limits, and cross-field structural constraints. If a chart contract requires a newly added dimension to create a real partition, require that it varies within at least one existing dimension group. Do not impose that rule for contracts that only require a syntactically filled role.

If aggregation is disabled, the completed dimension set must functionally determine the value fields, so underflow repair and overflow repair constraints must both hold. If aggregation such as `sum`, `mean`, or `count` is enabled, duplicate visual keys may be legal and `dimensions -> values` is not required unless the contract explicitly says otherwise.

In automatic mode, remove field supersets for which a proper subset has any valid assignment. Return both `addedFields` and the role `binding`; a single field set may appear more than once with different bindings. If no assignment satisfies all constraints, return `UNRESOLVABLE`.

### Structural Neutrality

Do not rank, score, truncate, or use beam search over valid intents or repairs. Do not add dataset names, column-name rules, chart-specific patches outside declarative contracts, fixture-tuned thresholds, or business-semantic preferences. Do not specially recognize row numbers, UUIDs, or other identifiers. Apply type constraints only when declared by a chart role; do not infer that every numeric field is a measure. The dragged column expresses field choice; the engine determines its structurally legal uses, not the user's business meaning.

### VisAnatomy Audit Boundaries

The sampled `data/VisAnatomy/data_tables` audit found no correctness failure in inclusion-minimal grain repairs: 112 sampled grain analyses and 120 validity/minimality checks passed. Data-quality cases are deferred and must not drive fixture-specific algorithm patches: missing cells, fully empty trailing columns, ragged or multi-row-header tables, and duplicate or blank headers.

Remaining non-data issues are narrow temporal inference for formats such as `M/D/YYYY`, misleading `UndetectableDelimiter` warnings for valid one-column CSVs, and unproven scale limits. Conflict-pair construction is quadratic within a key group, while complete minimal hitting-set enumeration and chart role assignment can have exponential output or search size. Add resource safeguards and worst-case tests without replacing the requirement to return every inclusion-minimal repair.

## Integration Files

- `src/utils/csvDataEngine.ts`: grain validation, overflow conflict-pair construction, and optional automatic minimal hitting-set enumeration.
- `src/utils/dimensionInference.ts`: column-triggered intent enumeration plus separately callable automatic analysis.
- `src/utils/csvColumnDrag.ts`: carries the single `inputColumn` and dataset identity from the data panel.
- Chart compatibility modules: declarative chart contracts and the `ChartValid` predicate, including aggregation and structural policies.
- `src/utils/chartDataPipeline.ts`: materializes selected wide `valueFields` into `__csv_measure__` / `__csv_value__` long rows.
- `src/utils/encodingConfig.ts`, `src/components/EncodingConfigPanel.vue`, and `src/stores/useCanvasStore.ts`: direct CSV bindings while preserving templates and encodings.
- `src/stores/useCanvasStore.ts` and `src/components/App.vue`: pass the dropped column and drop context to the engine, present every legal intent, and apply only the user's confirmed choice.

## Testing

Test drag-triggered inference independently from optional automatic detection. Cover axis drops, ambiguous chart-body drops, one input column with multiple valid intents, incompatible and constant inputs, no silent substitution of other columns, and confirmation before mutation. Retain overflow and underflow coverage for automatic analysis, including multiple inclusion-minimal solutions. Primary coverage is in `csvColumnDrag.test.ts`, `useCanvasStore.test.ts`, `csvDataEngine.test.ts`, `dimensionInference.test.ts`, and `chartDataPipeline.test.ts`. The user performs verification; do not run tests, type-check, build, code-level diff checks, or `git diff --check` unless explicitly requested.

Do not start a development server or choose a new port. The user starts the server before coding work and provides the port to use.

Never run screenshots, Playwright checks, or snapshots unless requested. Use `rg`, read relevant ranges, and never send whole datasets, lockfiles, generated output, or repository dumps to a model.

## Commits and Pull Requests

Use imperative subjects such as `fix: infer CSV grain candidates`. Pull requests must describe behavior, affected modules, and tests.
