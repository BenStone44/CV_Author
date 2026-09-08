# Chord + per-node Circular Stacked Bar Facet

This direct case uses one graph dataset with separate node and link tables:

- `data/chord_polar_line_nodes.csv`
- `data/chord_polar_line_links.csv`

Open the running frontend at:

```text
?case=chord-circular-stacked-facet-concat
```

The older `?case=chord-polar-line-facet-concat` URL remains an alias.

## Composition

The center is a Chord bound to `node_id`, `source`, `target`, and
`flow_twh`. Its link totals deliberately produce six unequal, ordered node
angle bands.

A Circular Stacked Bar is faceted by `node_id` in Polar coordinates and then
radially concatenated with the Chord while sharing Angle. Each facet therefore
uses the exact start angle and span of its corresponding Chord node; it is not
an independently divided sector.

Inside every node facet:

- `week -> R` creates six visibly separated concentric bars selected by a
  chart-local filter from the complete 52-week source;
- `energy_source -> Color` creates Solar, Wind, and Hydro stack segments;
- `generation_gwh -> Theta` controls angular length;
- every weekly stack begins at the owning node's start angle;
- the largest weekly total reaches that node's end angle, and no stack may
  extend beyond it.

The graph node table contains 936 rows: 6 nodes × 52 weeks × 3 energy sources.
The six displayed weeks use deliberately different totals and energy mixes for
every node, so the radial profiles and stacked color proportions are not
repeated between sectors.
The link table remains the source for Chord edges. There is no relationship-free
outer ring in this version; the complete inner-to-outer structure follows the
same node angle partition.

## Browser replay and screenshot

No manual configuration is required. With the user-owned frontend already
running:

```bash
cd cv-author-app
node scripts/build-chord-polar-line-facet-case.mjs 'http://localhost:5173'
```

The Playwright check verifies:

- one Chord and six Circular Stacked Bar facets;
- six concentric bars and 18 segments per node, 108 displayed segments total;
- all stacks start at their node boundary and never exceed its end angle;
- each facet reuses the matching Chord node's unequal angle band;
- all seven Polar render roots are concentric.

The default screenshot is written to
`docs/screenshots/chord-circular-stacked-facet-concat.png`.
