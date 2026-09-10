# Graph-Derived Heatmap + Weighted Force Network + Marginal Stacked Bars

This reproducible case uses a 20 × 20 heatmap table and a separate graph:

- `data/matrix_force_nodes.csv`: 72 weighted nodes, five weight components,
  three loose community labels, and stored force-layout coordinates
- `data/matrix_force_edges.csv`: 163 weighted local-core, cross-community, and radial links
- `data/matrix_force_heatmap.csv`: 400 grid cells derived from the positioned
  node weights and the same five components

Run `node scripts/generate-matrix-force-data.mjs` to reproduce all three CSVs
from the fixed random seed.

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
- `channel_a ... channel_e -> Node Pie Slices`
- `weight -> Node Pie Radius`
- `layout_x / layout_y -> Stored Force Position`

The generator first creates 48 dense-core nodes and 24 lower-degree scattered
nodes. Short local links preserve three dense regions, while 40 radial links attach
outer nodes to inner nodes in a similar angular direction. Random long links
through the center are intentionally limited, producing a readable outward
flow while the original communities remain latent. Link stroke width is mapped
from the stored edge weight (1–8), on top of a type-specific base width. All
link base widths produce a rendered range of roughly 1.6–9.6. Opacity also
increases with edge weight within each link type, making strong radial links
especially prominent. Links use a white stroke
so their weighted structure remains visible over high-value dark heatmap cells.
It runs a deterministic force simulation, applies a mild outward radial
expansion, and stores each final normalized position. Every node's weight is
randomly split into five fields whose sum is the original weight. The node is
rendered at that position as a five-slice Pie whose radius represents the total
weight.

Each positioned node distributes its five components into nearby cells with a
normalized spatial kernel. Therefore every heat value is graph-derived, and
the global sum of every heatmap component matches the corresponding node
component. The Matrix renders these 400 cells beneath the same stored force
positions. All axes are hidden.

Two `StackedBarChart` units aggregate the graph-derived cell components at the
same 20-category grain. The five series and Pie slices use the first five
colors from the global discrete palette. The top
chart is vertically concatenated before the Matrix and
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

The replay verifies 400 heatmap cells, 72 nodes, 163 weighted links, stored force
positions, and 360 Pie slices using the first five categorical colors. Radii
are mapped to 8–24, and every pair of node centers is separated by more than
1.25 times the sum of its two radii. The three denser groups are anchored around
the center rather than directly on it, while increased link opacity keeps the
weighted radial structure visible.
both stacked bars, all 200 marginal bar segments, shared X/Y screen positions,
hidden axes, and the top/right placement. The default
screenshot is written to
`docs/screenshots/matrix-pie-network-marginal-bars.png`.
