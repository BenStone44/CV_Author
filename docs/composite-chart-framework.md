# Composite Chart Framework

## 1. Framework Overview

The current system can be summarized as an **atomic-unit-based compositional rendering framework**:

```text
Data / Cube
    |
    v
Atomic Chart Construction
    |
    v
Composition Planning
    |
    v
Scale and Layout Reconciliation
    |
    v
Marks + Coordinate Rendering
```

The system does not compose charts by concatenating completed SVG outputs or by merging multiple charts into one monolithic `ChartSpec`. Instead, it preserves each chart as an independently editable atomic unit, establishes explicit relationships among those units, reconciles compatible coordinate channels, and then re-renders their marks in a shared coordinate space.

## 2. Core Features and Modules

| Core feature | Module | Main responsibility |
| --- | --- | --- |
| Atomic Chart Unit | Chart Template and Encoding Module | Constructs an independent chart and manages its template, Mark Encodings, required channels, and styles |
| Semantic Data Binding | Data and Cube Binding Module | Binds datasets, dimensions, measures, filters, and aggregations to Mark channels |
| Relation-based Composition | Composition and Relationship Module | Represents Layer, Concat, Facet, and Nested compositions as explicit relationships instead of merged chart specifications |
| Shared Coordinate Resolution | Scale and Layout Module | Identifies compatible channels, merges domains, and resolves shared scales and plot geometry |
| Decoupled Rendering | Mark Renderer and Coordinate Renderer | Renders chart marks independently and renders shared axes as a separate coordinate layer |

## 3. Atomic Chart Construction

Every composite visualization is constructed from completed atomic Chart Units.

An atomic unit can be represented as:

\[
U_i=(D_i,T_i,E_i,M_i,F_i)
\]

where:

- \(D_i\) is the dataset or filtered data view.
- \(T_i\) is the chart template, such as Line or Scatter.
- \(E_i\) is the unit's Mark Encoding.
- \(M_i\) is its mark type and visual configuration.
- \(F_i\) is its frame, transform, and coordinate guide.

Each template defines an explicit encoding contract. Examples include:

```text
Line    -> X + Y required
Scatter -> X + Y required
Bar     -> Category + Value required
Pie     -> Angle required
Matrix  -> Row + Column required
```

A unit cannot participate in a Composition until all required Mark Encodings are complete. This ensures that Composition always operates on structured and independently valid visualization units.

Main implementation modules:

- `cv-author-app/src/chartTemplates.ts`
- `cv-author-app/src/types.ts`

## 4. Semantic Data Binding

The Semantic Data Binding module maps data semantics to Mark channels:

```text
Dimension -> X / Color / Row / Slice
Measure   -> Y / Size / Angle / Radius
```

It manages:

- CSV datasets
- dimensions and measures
- Cube Bindings
- filters
- aggregations
- encoding-type synchronization
- pre-render data preparation

The central ownership rule is:

> Data fields belong to Mark Encodings, not to coordinate axes.

Consequently, two charts may use the same coordinate system while retaining different field assignments, aggregations, and visual configurations.

Main implementation modules:

- `cv-author-app/src/cubeModel.ts`
- `cv-author-app/src/cubeBinding.ts`
- `cv-author-app/src/chartDataPipeline.ts`

## 5. Relation-based Composition

A Composition is represented as:

\[
C=(\tau,\{U_1,U_2,\ldots,U_n\},\Gamma,O)
\]

where:

- \(\tau\) is the composition operator.
- \(\{U_1,U_2,\ldots,U_n\}\) is the member set.
- \(\Gamma\) is the set of shared coordinate channels.
- \(O\) is the coordinate owner used for shared frame and axis rendering.

The coordinate owner is not the owner of member Encodings. It is only the geometric representative of the shared coordinate space.

The system currently supports four composition operators:

- **Layer:** overlays marks in a common plot area.
- **Concat:** arranges independent views and may share selected axes.
- **Facet:** generates related views from a data dimension.
- **Nested:** attaches one chart to a data element in another chart.

Internally, the relationship graph contains the following relations:

```text
Chart Unit  --owns------> Mark Group
Chart Unit  --binds-----> Axis Component
Chart Unit  --member-of-> Composition
Composition --shares----> Coordinate Channel
```

This representation allows a Composition to remain editable, reversible, and incrementally updateable. It avoids flattening the participating charts into a single irreversible graphical result.

Main implementation modules:

- `cv-author-app/src/useChartRelationshipStore.ts`
- `cv-author-app/src/useCanvasStore.ts`

## 6. Compatibility and Partial Sharing

For each coordinate channel \(c\), compatibility is currently determined by:

\[
compatible(c)=shareable(c)\land
\forall i,j,\ type(E_i(c))=type(E_j(c))
\]

The shared-channel set is therefore:

\[
\Gamma=\{c\mid compatible(c)\}
\]

This supports partial coordinate sharing:

```text
X compatible + Y compatible   -> share X and Y
X incompatible + Y compatible -> share only Y
X compatible + Y incompatible -> share only X
```

For example:

```text
Line.X  = time      : temporal
Line.Y  = weight_kg : quantitative

Point.X = time      : temporal
Point.Y = water_kg  : quantitative
```

Both X and Y are compatible, but the two Y fields remain independently owned by their respective Mark Encodings.

If one X field is `time : temporal` and the other is `person : nominal`, X remains independent while the compatible quantitative Y channel may still be shared.

Layer composition currently also requires the units to use the same dataset and equivalent filter state, ensuring a consistent data context.

## 7. Shared Coordinate Resolution

The Scale and Layout Module reconciles the local scales of compatible members.

For quantitative and temporal channels, the shared domain is the global extent:

\[
D_c^*=
[\min_i D_{i,c}^{min},\max_i D_{i,c}^{max}]
\]

For nominal channels, the shared domain is the union of categories:

\[
D_c^*=\bigcup_i D_{i,c}
\]

For example:

```text
weight_kg domain = [10, 22]
water_kg  domain = [5, 11]
shared Y domain  = [5, 22]
```

The shared scale maps this merged domain to the coordinate owner's plot range:

\[
S_c^*:D_c^*\rightarrow R_c^*
\]

The module also resolves:

- shared plot area
- coordinate frame
- scale range
- axis direction
- member transforms
- local-origin offsets between different SVG view boxes

## 8. Two-pass Rendering

Composite rendering is performed in two stages.

### 8.1 Pass 1: Atomic Rendering

Each unit is rendered independently:

\[
R_i^0=Render(U_i)
\]

This produces:

- local marks \(G_i\)
- local plot area \(P_i\)
- local scale \(S_i\)
- local channel domains \(D_{i,c}\)

At this stage, fields such as `weight_kg` and `water_kg` compute separate local Y domains.

### 8.2 Pass 2: Reconciled Rendering

After compatible domains have been merged, each unit is rendered again:

\[
R_i=Render(U_i,P^*,S_\Gamma^*)
\]

Only shared channels use the reconciled scale \(S_\Gamma^*\). Unshared channels continue to use their local scales.

This procedure preserves each unit's Encoding while ensuring that compatible marks are projected into a common coordinate space.

Main implementation modules:

- `cv-author-app/src/useCanvasStore.ts`
- `cv-author-app/src/semanticRenderer.ts`
- `cv-author-app/src/lineRenderer.ts`

## 9. Marks-only and Coordinate Rendering

Chart renderers generate marks without embedding their own axes. The final composite visualization is:

\[
V=A(P^*,S_\Gamma^*)\oplus
\bigoplus_{i=1}^{n}Transform_i(G_i)
\]

where:

- \(A\) is the independently rendered coordinate layer.
- \(G_i\) is the mark output of unit \(i\).
- \(\oplus\) denotes visual composition in the resolved coordinate space.

The resulting structure is:

```text
Composite View
|-- Coordinate Layer
|   |-- axis
|   |-- ticks
|   `-- grid
`-- Mark Layers
    |-- Unit A marks
    `-- Unit B marks
```

Main coordinate-rendering modules:

- `cv-author-app/src/CartesianCoordinateSystem.ts`
- `cv-author-app/src/PolarCoordinateSystem.ts`

## 10. Incremental Updates

The architecture distinguishes Mark-level changes from coordinate-level changes.

Mark-level changes include:

- field bindings
- aggregations
- series
- color, size, and shape
- angle and radius
- mark styles

These changes update only the target atomic unit.

Coordinate-level changes include:

- shared scale
- axis direction
- coordinate origin
- scale interaction

These changes propagate to members that participate in the corresponding shared coordinate relationship.

For example, when a Point unit changes its Y field from `water_kg` to `fat_kg`, the system:

1. Updates only the Point unit's Y Mark Encoding.
2. Recomputes the Point unit's local Y domain.
3. Reconciles the Layer's shared Y domain.
4. Re-renders the units that use the shared Y scale.
5. Preserves the Line unit's original `weight_kg` Encoding.

## 11. Primary Contributions

The three most important methodological features are:

### 11.1 Atomic-unit-based Composition

Composite charts are constructed from complete and independently valid Chart Units rather than from low-level SVG elements.

### 11.2 Relation-based, Encoding-preserving Composition

Composition is represented through explicit relationships. Each unit retains its own Mark Encoding instead of inheriting fields from a coordinate owner.

### 11.3 Two-pass Partial-scale Reconciliation

The system first derives local domains and then reconciles only compatible channels, supporting both fully shared and partially shared coordinate spaces.

Together, these features distinguish the framework from simple graphical concatenation and from monolithic visualization specifications.

## 12. Paper-ready Method Description

> We model each chart as an atomic visualization unit with independently owned data encodings and mark specifications. Composite views are represented as relationships among units rather than as a merged monolithic specification. Composition is performed through a two-pass rendering procedure. Each unit is first rendered independently to derive its local plot geometry and scale domains. Compatible coordinate channels are then reconciled into shared domains, after which all participating units are re-rendered using the shared coordinate space while preserving their original encodings. The final visualization overlays marks-only renderings with a separately rendered coordinate-system layer.

## 13. Current Limitation

Channel compatibility is currently based primarily on encoding data types. This is sufficient for fields such as `weight_kg` and `water_kg`, which are both quantitative and use the same unit. However, two quantitative fields are not necessarily semantically compatible.

A stricter extension could include:

- physical units
- semantic measure types
- normalization policies
- explicit user-defined compatibility constraints

Such metadata would distinguish representational compatibility from semantic compatibility.
