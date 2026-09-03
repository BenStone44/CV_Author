# GeoJSON Geometry Sources

Geographic templates join a CSV column to a separate GeoJSON `FeatureCollection`.
Each feature must have a unique string or numeric `id`. The same value in the
CSV placeholder column resolves that feature.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "10001",
      "properties": {
        "id": "10001",
        "ids": ["10001", "10118"]
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-74.0, 40.7], [-73.9, 40.7], [-73.9, 40.8], [-74.0, 40.7]]]
      }
    }
  ]
}
```

`properties.id` is accepted when a producer cannot write the top-level
GeoJSON feature `id`. `properties.ids` is optional and declares aliases that
resolve the same geometry without duplicating overlapping shapes.

Supported geometry types are `Point`, `MultiPoint`, `Polygon`, and
`MultiPolygon`. Polygon templates consume polygon geometries. Scatterplot
templates consume point geometries or use the center of a polygon geometry.
CSV and graph-node tables never carry coordinate arrays or longitude/latitude
columns for geographic rendering; every geographic mark is resolved through
this ID join.

After an ID column is bound, repeated CSV IDs remain separate in the raw data.
The geographic view groups them by resolved feature and sums every numeric
field selected for the Color or Size channel.

The bundled `public/geodata/nyc-zip-boundaries.geojson` follows this contract.
Its geometry originates from the NYC Open Data MODZCTA boundary export; its
canonical and alternate ZIP identifiers are normalized into `id` and `ids`.
