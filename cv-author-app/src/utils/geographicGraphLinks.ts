import type {
  Dataset,
  GeoJsonFeature,
  GeographicLayerBinding,
} from "../types";
import {
  canonicalGeoJsonJoinId,
  geoJsonFeatureIds,
} from "./geoJsonGeometry";

export type GeographicGraphLine = {
  start: [number, number];
  end: [number, number];
  value: number;
};

export type GeographicGraphNode = {
  rowKey: string;
  position: [number, number];
};

function geometryCenter(feature: GeoJsonFeature): [number, number] {
  const coordinates = feature.geometry.coordinates;
  if (feature.geometry.type === "Point") return coordinates as [number, number];
  if (feature.geometry.type === "MultiPoint") return (coordinates as [number, number][])[0] ?? [0, 0];
  const ring = feature.geometry.type === "MultiPolygon"
    ? (coordinates as number[][][][]).flatMap((polygon) => polygon[0] ?? [])
    : (coordinates as number[][][])[0] ?? [];
  if (ring.length === 0) return [0, 0];
  const total = ring.reduce<[number, number]>(
    (result, position) => [result[0] + position[0]!, result[1] + position[1]!],
    [0, 0],
  );
  return [total[0] / ring.length, total[1] / ring.length];
}

function graphNodePositions(
  dataset: Dataset | null | undefined,
  binding: GeographicLayerBinding | undefined,
  geometryFeatures: GeoJsonFeature[],
) {
  const graph = dataset?.graph;
  if (!graph || !binding) return new Map<string, [number, number]>();
  const idField = graph.nodes.columns
    .find((column) => ["id", "node_id", "hex_id", "key"].includes(column.name.toLowerCase()))?.name;
  if (!idField) return new Map<string, [number, number]>();
  const positionsByGeometryId = new Map(
    geometryFeatures.flatMap((feature) => geoJsonFeatureIds(feature).map((id) => [
      canonicalGeoJsonJoinId(id),
      geometryCenter(feature),
    ] as const)),
  );
  // Keep graph node IDs verbatim for edge endpoint lookup; canonicalization is
  // limited to the separate node-to-GeoJSON join field.
  return new Map(graph.nodes.rows.flatMap((row) => {
    const nodeId = String(row[idField] ?? "").trim();
    const position = positionsByGeometryId.get(canonicalGeoJsonJoinId(row[binding.idField]));
    return nodeId && position ? [[nodeId, position] as const] : [];
  }));
}

/** Resolve graph nodes through the selected CSV-to-GeoJSON join. */
export function geographicGraphNodeRecords(
  dataset: Dataset | null | undefined,
  binding: GeographicLayerBinding | undefined,
  geometryFeatures: GeoJsonFeature[],
): GeographicGraphNode[] {
  return Array.from(
    graphNodePositions(dataset, binding, geometryFeatures),
    ([rowKey, position]) => ({ rowKey, position }),
  );
}

/** Resolve graph edges through the selected CSV-to-GeoJSON join. */
export function geographicGraphLineRecords(
  dataset: Dataset | null | undefined,
  binding: GeographicLayerBinding | undefined,
  geometryFeatures: GeoJsonFeature[],
): GeographicGraphLine[] {
  const graph = dataset?.graph;
  if (!graph) return [];
  const sourceField = graph.edges.columns
    .find((column) => ["source", "from", "source_id"].includes(column.name.toLowerCase()))?.name;
  const targetField = graph.edges.columns
    .find((column) => ["target", "to", "target_id"].includes(column.name.toLowerCase()))?.name;
  if (!sourceField || !targetField) return [];
  const positions = graphNodePositions(dataset, binding, geometryFeatures);
  return graph.edges.rows.flatMap((row) => {
    const start = positions.get(String(row[sourceField] ?? "").trim());
    const end = positions.get(String(row[targetField] ?? "").trim());
    const value = Number(row.value ?? 1);
    return start && end ? [{ start, end, value: Number.isFinite(value) ? value : 1 }] : [];
  });
}
