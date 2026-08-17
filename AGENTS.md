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

Raw CSV rows are the source of truth; do not recreate `CubeResult`, `CubeBinding`, or permanent dimension/measure classes. Model chart correction as enumeration of all inclusion-minimal repairs, but keep dimension overflow and dimension underflow as distinct constraint problems.

### Unified Repair Model

Let `B` be the currently selected or bound fields and `U` the remaining CSV fields. A repair consists of added fields `S` and a binding from those fields to chart roles. It is valid when `ChartValid(B, S, binding)` satisfies the chart contract. Return every repair whose `S` is inclusion-minimal: no proper subset of `S` has any binding that makes the chart valid. Do not reduce this to globally minimum cardinality. Preserve distinct valid role bindings even when they use the same field set.

Each chart contract must declare required and optional roles, allowed field types per role, minimum and maximum role counts, whether one field may occupy multiple roles, relevant cardinality or structural constraints, its aggregation policy, and whether visual dimensions must functionally determine values. `ChartValid` checks the complete binding against that contract rather than applying chart-name patches in the search algorithm.

Classify the current binding as `VALID`, `DIMENSION_OVERFLOW`, `DIMENSION_UNDERFLOW`, `TYPE_MISMATCH`, or `UNRESOLVABLE`. A repair may need to address more than one failure at once.

### Dimension Overflow

Dimension overflow means the current dimensions `K` do not functionally determine values `V`. For data without missing values, `analyzeCsvGrain(dataset, keyFields, valueFields)` finds every inclusion-minimal supplemental dimension set as a minimal hitting-set problem:

1. Group rows by the complete tuple of values in `K`.
2. Within each group, create a conflict pair `(ri, rj)` for every pair whose complete `V` tuples differ. Ignore non-conflict pairs.
3. For each conflict pair `p`, compute `Dp = { f in U | f(ri) != f(rj) }`.
4. If any `Dp` is empty, the overflow is unresolvable using `U`.
5. Otherwise enumerate all inclusion-minimal hitting sets `S` of the family of sets `Dp`; each one satisfies `K union S -> V` and no field can be removed while retaining that dependency.

### Dimension Underflow

Dimension underflow means required chart roles or independent grouping structure are missing. It is a field-selection plus role-assignment constraint problem, not generally a conflict-pair hitting-set problem.

Enumerate assignments of fields in `U` to missing roles with backtracking or another complete CSP, SAT, or ILP approach. Check role counts, type compatibility, exclusivity, maximum dimension counts, cardinality limits, and cross-field structural constraints during the search. If a chart contract requires a newly added dimension to create a real partition, require that it varies within at least one existing dimension group. Do not impose that rule for contracts that only require a syntactically filled role.

If aggregation is disabled, the completed dimension set must functionally determine the value fields, so underflow repair and overflow repair constraints must both hold. If aggregation such as `sum`, `mean`, or `count` is enabled, duplicate visual keys may be legal and `dimensions -> values` is not required unless the contract explicitly says otherwise.

After enumerating valid assignments, remove field supersets for which a proper subset has any valid assignment. Return both `addedFields` and the role `binding`; a single field set may appear more than once with different bindings. If no assignment satisfies all constraints, return `UNRESOLVABLE`.

### Structural Neutrality

Do not rank, score, truncate, or use beam search over valid repairs. Do not add dataset names, column-name rules, chart-specific patches outside declarative contracts, fixture-tuned thresholds, or business-semantic preferences. Do not filter, penalize, down-rank, or specially recognize row numbers, UUIDs, or other identifiers. Apply type constraints only when declared by a chart role; do not infer that every numeric field is a measure. The engine can report all structurally legal minimal repairs but cannot choose the user's intended business dimension.

### VisAnatomy Audit Boundaries

The sampled `data/VisAnatomy/data_tables` audit found no correctness failure in inclusion-minimal grain repairs: 112 sampled grain analyses and 120 validity/minimality checks passed. Data-quality cases are deferred and must not drive fixture-specific algorithm patches: missing cells, fully empty trailing columns, ragged or multi-row-header tables, and duplicate or blank headers.

Remaining non-data issues are narrow temporal inference for formats such as `M/D/YYYY`, misleading `UndetectableDelimiter` warnings for valid one-column CSVs, and unproven scale limits. Conflict-pair construction is quadratic within a key group, while complete minimal hitting-set enumeration and chart role assignment can have exponential output or search size. Add resource safeguards and worst-case tests without replacing the requirement to return every inclusion-minimal repair.

## Integration Files

- `src/csvDataEngine.ts`: overflow conflict-pair construction and enumeration of all inclusion-minimal hitting sets.
- `src/dimensionInference.ts`: unified minimal-repair search across candidate fields and role assignments.
- Chart compatibility modules: declarative chart contracts and the `ChartValid` predicate, including aggregation and structural policies.
- `src/chartDataPipeline.ts`: materializes selected wide `valueFields` into `__csv_measure__` / `__csv_value__` long rows.
- `src/encodingConfig.ts`, `EncodingConfigPanel.vue`, and `useCanvasStore.ts`: direct CSV bindings while preserving templates and encodings.
- `src/App.vue`: reports validation status and every minimal repair with its added fields and role binding.

## Testing

Test overflow and underflow separately and together. Cover wide and long data, repeated values, numeric categories, identifiers, multiple minimal solutions of different cardinalities, composite repairs, irrelevant non-conflict pairs, empty distinguishable-field sets, missing roles, constant fields, structurally redundant dimensions, type-incompatible assignments, multiple bindings for one field set, role-count limits, aggregation-enabled and aggregation-disabled charts, many columns, and composite existing keys. Primary coverage is in `csvDataEngine.test.ts`, `dimensionInference.test.ts`, and `chartDataPipeline.test.ts`. Before handoff run `npm test`, `npm run type-check`, `npm run build`, and `git diff --check`.

Never run screenshots, Playwright checks, or snapshots unless requested. Use `rg`, read relevant ranges, and never send whole datasets, lockfiles, generated output, or repository dumps to a model.

## Commits and Pull Requests

Use imperative subjects such as `fix: infer CSV grain candidates`. Pull requests must describe behavior, affected modules, and tests.
