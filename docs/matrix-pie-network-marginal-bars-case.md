# Heatmap + Three-Community Force Network + Marginal Stacked Bars

This reproducible case uses a 20 × 20 heatmap table and a separate graph:

- `data/matrix_force_heatmap.csv`: 400 grid cells and five stacked-bar channels
- `data/matrix_force_nodes.csv`: 100 variably sized nodes in three communities
- `data/matrix_force_edges.csv`: 412 dense intra-community and sparse cross-community links

Open the running frontend at:

```text
?case=matrix-force-heatmap-marginal-bars
```

## System configuration

The center unit is a `MatrixDiagram` configured with:

- `column_group -> X`
- `row_group -> Y`
- `heat_value -> Color`, using the global continuous gradient palette
- `id -> Key`
- `source / target / weight -> Force Link`
- `community -> Node Color`
- `size -> Node Radius`

The Matrix renders 400 cells in a 20 × 20 grid. Its generated values contain
three concentrated high-value regions. A deterministic force layout overlays
100 differently sized nodes, 412 links, and three visually separated
communities. Dense links include horizontal, vertical, and diagonal directions;
all axes are hidden.

Two `StackedBarChart` units retain the same 20-category grain and use five dark
series colors. The top chart is vertically concatenated before the Matrix and
shares X (`column_group`). The side chart swaps its axes, is horizontally
concatenated after the Matrix on the right, and shares Y (`row_group`). These
are two directed links in one open mixed-direction Concat composition; the
center Matrix remains the common member.

## Browser replay and screenshot

With the user-owned frontend already running:

```bash
cd cv-author-app
node scripts/build-matrix-pie-network-case.mjs 'http://localhost:5173'
```

The replay verifies 400 heatmap cells, 100 nodes, 412 links, three node colors,
variable radii, both stacked bars, all 200 marginal bar segments, shared X/Y
screen positions, hidden axes, and the top/right placement. The default
screenshot is written to
`docs/screenshots/matrix-pie-network-marginal-bars.png`.
