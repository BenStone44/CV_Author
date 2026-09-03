# Data panel data modes

The data panel supports three explicit source modes. Raw rows remain the source
of truth; adapters only materialize the view required by a chart.

## Wide CSV

One CSV is represented by `Dataset.columns` and `Dataset.rows`. Columns can be
dragged directly into chart encodings. Filters, aggregates, and bins are kept
as chart-local transforms and do not mutate the imported rows.

## Graph tables

A graph is imported from two CSV files and represented as:

```ts
Dataset {
  columns: []
  rows: []
  graph: {
    nodes: DatasetTable
    edges: DatasetTable
  }
}
```

The panel renders `Nodes` and `Edges` as separate tables. Graph column drag
payloads include `table: "nodes" | "edges"` so a field such as `id` is never
ambiguous. Flow charts consume the edge table; hierarchy charts can consume a
node table with explicit parent references. Tree templates use an ordinary
wide CSV and do not derive bindings from an edge table. Bind `node_id` and
`parent_id` explicitly when configuring a tree:

```ts
d3.stratify()
  .id(row => row.node_id)
  .parentId(row => row.parent_id || null)
```

Node attributes remain on `node.data`; edge attributes remain available to
link encodings for flow charts. The bundled tree example is the ordinary CSV
`data/tree_nodes.csv`, which includes `node_id` and `parent_id` alongside node
attributes and a per-row `weight` field.

Graph nodes use the same GeoJSON ID join as wide CSVs. A node identity such as
`id` remains the graph endpoint key, while a separate field such as `point`
or `incident_zip` is dragged onto a geographic layer to resolve a GeoJSON
feature. Node tables do not provide longitude, latitude, x/y, or embedded
coordinate columns for map positioning.

## Wide CSV joined to GeoJSON

GeoJSON is an independently imported `GeometrySource`; it is not automatically
loaded or merged into a CSV dataset. The panel first selects an imported
geometry source and then a categorical/ordinal CSV column as the join field.
The UI reports matched and unmatched IDs. A geographic layer binding is valid
only after the selected field has values matching feature IDs:

```ts
{
  datasetId,
  geometrySourceId,
  idField,
  aggregation: "sum"
}
```

The CSV remains unchanged. The map renderer performs the join at materialize
time, while color and size continue to use numeric columns from the wide table.
No CSV field is guessed and no default geometry source participates in a chart.

Bundled data may declare an explicit pairing. The current local example maps
`case2.csv:incident_zip` to `nyc-zip-boundaries.geojson`; this pairing is
loaded only after a CSV dataset exists, and the matched column is marked with a
map icon in the panel. User-imported datasets still require an explicit field
selection.
