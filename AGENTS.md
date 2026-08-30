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

## Development Server Ownership

The user owns both development services. The user starts and stops the Vite
frontend and the FastAPI backend, and provides the ports to use. Agents must
not start, stop, restart, or choose ports for either service; use only
user-provided running endpoints for integration checks.

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

## Chart-Local Data Operations and Structural Composition

Filter, aggregate, facet, chart upgrade, and nested relationships must form one
coherent chart-local workflow. Keep the following three concerns distinct:

1. Data-view transforms: ordered filters, aggregates, and bins materialize a
   chart-specific view from the raw CSV without mutating the dataset.
2. Structural operations: facet, chart upgrade, and nested composition consume
   explicit user intent and change chart structure, role bindings, or
   relationships.
3. Lineage and context: record whether a field/value is a hard filter, facet
   clue, inherited parent constraint, structural binding, or derived output.

The conceptual execution path is:

```text
raw CSV
  -> inherited relationship context
  -> chart-local filters
  -> chart-local aggregate/bin transforms
  -> structural bindings and encoding
  -> rendering
```

`ChartSpec.dataTransforms` is the ordered chart-local transform source. Raw CSV
rows remain the source of truth. Legacy `filters`, `valueFilters`, and
`numericFilters` may remain while existing workflows depend on them, but new
behavior must not create a third competing transform representation. Migrate or
adapt legacy state through explicit boundaries.

### D3 and Canvas Polar Conventions

D3 `pie`/`arc` angles and the canvas polar coordinate system use different
origins and directions. D3 measures radians clockwise from 12 o'clock. The
canvas polar guide measures degrees from the ray pointing right and uses
positive counter-clockwise angles in screen space. Do not pass a D3 arc angle
directly to canvas polar helpers. For a D3 angle `a` and radius `r`, place a
screen-space point with `x = cx + sin(a) * r` and
`y = cy - cos(a) * r`; equivalently convert it to the canvas convention before
calling a canvas polar helper. Apply this conversion to labels, hit targets,
nested marks, and derived polar geometry, not only to arc paths.

When the movable angular handle is positioned at the canvas
counter-clockwise angle `n`, the polar coordinate system occupies `[n, 360]`,
not `[0, n]`. Store and render its angular span as `360 - n`: the fixed boundary
remains at the rightward 360-degree ray and the movable boundary remains at
`n`. Polar axes and grid arcs are stroked open paths with `fill="none"`; never
use their fill to depict the coordinate system.

Pie and donut templates use the same built-in default CSV as the Cartesian
templates. Their initial binding is `column -> segment` and `value -> theta`,
with the existing `group = Alpha` default filter. Once a categorical or ordinal
`segment` is selected, automatically aggregate the quantitative `theta` values
with `sum` at that segment grain. Preserve an explicit user-selected
aggregation instead of silently replacing it.

The project polar interaction is not D3's default control geometry. Polar axes
use thin, translucent concentric circles at radial ticks, clipped to concentric
arcs when the chart occupies only part of the angular range. The `r` axis is a
rightward horizontal ray with short tick marks at the same radii. Selection
starts with two adjacent 15-degree control-arc halves at the zero-angle end.
During angle-span dragging, the movable half and its handle follow the angular
endpoint while the fixed half remains at zero angle with the rightward ray. The
movable half owns angle-span dragging; the radial ray and separate right-side
radius handle own radial scaling. Keep their transparent hit targets usable and
non-overlapping so the angle handle cannot intercept radius scaling. Visual
guide paths must not block either interaction.

Visible polar axes belong to the persistent, non-interactive canvas coordinate
layer, not to the selection overlay. Keep enabled concentric guides and the
`r`-axis visible after deselection. The selected polar overlay renders handles
and control arcs only, so it must not redraw the static axes or make their
strokes appear thicker. Hide the persistent polar layer only when both Theta
and R axes are explicitly disabled.

### Filter Intent and Facet Clues

A categorical or ordinal single-select filter may be either a permanent hard
filter or a temporary structural clue. Do not infer the distinction from
`single: true` alone. Add explicit intent metadata equivalent to:

```ts
purpose?: "filter" | "facet-clue" | "nested-context"
```

Normal filters constrain only their owning chart. A `facet-clue` temporarily
constrains the current chart while recording that the exact field can later be
used for faceting. One clue creates a one-dimensional facet. When two or more
clues are available, let the user select the row and optional column dimensions;
do not silently choose, rank, or discard valid clue fields.

Facet creation consumes only the selected clues. Remove their temporary filter
effect before enumerating facet domains so that all cells can be materialized.
Preserve every unrelated hard filter and transform. Each generated facet cell
must carry its fixed field/value context explicitly. Group clue consumption and
facet creation into one undoable canvas operation.

### Aggregate and Derived-Field Lineage

Categorical or ordinal fields may act as group-by dimensions for numeric
`sum`/`average` outputs. Numeric fields may produce equal-width, fixed-width, or
quantile bins. Every derived field must record lineage equivalent to:

```ts
{
  outputField: string
  sourceFields: string[]
  operation: "sum" | "average" | "bin-equal" | "bin-fixed" | "bin-quantile"
}
```

Derived aggregate and bin outputs must be available to encoding and structural
validation. Group-by fields can remain structural dimensions; aggregate outputs
are numeric values; bin outputs are categorical or ordinal dimensions. Facet,
upgrade, and nested resolution must use lineage rather than field-name guessing
when a source field is replaced or removed by aggregation.

### Chart Upgrade Semantics

Chart upgrade must preserve compatible chart-local transforms. Consume only the
clue explicitly selected for the new structural role, such as series, group,
color, or an additional dimension. Preserve unrelated facet clues and hard
filters. Revalidate the complete proposed binding against the target chart
contract and current materialized schema. If a transform or derived field is no
longer compatible, report an explicit conflict or unresolved result; do not
silently drop it, replace its field, or scan unrelated columns for a substitute.

Facet and chart upgrade must share one clue-consumption mechanism so that undo,
layer handling, and transform preservation have identical semantics.

### Nested Filter Inheritance

Nested inheritance belongs to the parent-child relationship, not permanently to
the child's editable local transforms. Extend nested relationship state with an
explicit resolved context equivalent to:

```ts
type InheritedFilterContext = {
  parentChartId: string
  parentDataKey?: string
  parentField: string
  childField: string
  value: string | number
  source: "facet-cell" | "parent-row" | "parent-filter"
}
```

A child may inherit a constraint only when all of the following hold:

- Parent and child use the same dataset identity, or the relationship declares
  an explicit parent-field to child-field mapping.
- Both sides contain the corresponding field and their types are compatible.
- The parent supplies a concrete constraint or value through a facet cell, the
  selected parent row/mark, or an explicitly inheritable parent filter.
- The field remains resolvable through the relevant aggregate lineage.

The mere presence of a field in the parent's raw schema is not enough to create
an inherited filter. If the parent has an active single-value filter on that
field and the child has the same or mapped field, the relationship may inherit
that value. When a child is attached to a specific parent row or mark, that row
value is more specific than a broad parent filter and is the primary nested
context.

Initially inherit only categorical/ordinal equality constraints, facet-cell
fixed values, and concrete parent-row values. Do not blindly copy Top/Bottom N,
numeric ranges, bins, or aggregates: their meaning depends on transform order
and the parent's data domain. Add broader inheritance only with an explicit
cross-chart execution contract.

At child materialization time, combine inherited relationship context with
child-local filters using logical AND, then run the child's aggregate/bin
transforms and encodings. If parent and child impose incompatible values on the
same field, expose a conflict instead of silently overriding either side. Parent
updates must re-resolve relationship context. Detaching a nested relationship
removes inherited context while preserving all child-local transforms.

Facet-cell context, parent-row context, and inherited parent filters are all
relationship inputs. The parent-row value is normally the most specific. Reject
or surface incompatible broader constraints rather than stacking contradictory
filters and rendering an unexplained empty child.

### Outstanding Integration Work

The following issues remain to be solved before the workflow is fully unified:

- Replace `single`-only clue detection with explicit transform purpose metadata
  while preserving existing saved charts.
- Define one canonical adapter or migration path between `dataTransforms` and
  legacy `filters`, `valueFilters`, and `numericFilters`.
- Persist and validate aggregate/bin output lineage through serialization,
  undo/redo, duplication, layer operations, facet creation, and chart upgrade.
- Centralize clue consumption for facet and chart upgrade, including layer-child
  transforms and multi-clue row/column selection.
- Specify chart-upgrade conflict reporting when a preserved transform references
  a field absent from the upgraded materialized schema.
- Add relationship-owned inherited context and optional field mapping to nested
  relationship types, projection, resolution, serialization, and rendering.
- Re-resolve nested context when parent filters, facet cells, rows, aggregates,
  datasets, or upgrades change. Represent missing fields as `UNRESOLVABLE` and
  contradictory constraints as an explicit conflict state.
- Decide whether multi-value categorical filters and numeric filters may later
  be inherited, including precise ordering and domain semantics, before adding
  that behavior.
- Ensure nested children inside facet cells inherit both the cell's fixed context
  and the selected parent-row context without copying either into child-local
  state.
- Keep all combined operations atomic in canvas undo history and ensure removing
  a facet, upgrade, or nested relationship restores only the state owned by that
  operation.
- Add focused coverage for filter-to-facet, filter-to-upgrade,
  aggregate-to-facet, aggregate-to-upgrade, facet-to-nested, filter-to-nested,
  conflicting parent/child filters, parent updates, unresolved lineage, and
  nested detachment. Verification remains user-triggered under the repository
  testing policy.

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
