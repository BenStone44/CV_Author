import { describe, expect, it } from "vitest";
import type { Dataset, GeoJsonFeature, GeographicLayerBinding } from "../types";
import {
  geographicGraphLineRecords,
  geographicGraphNodeRecords,
} from "../utils/geographicGraphLinks";

const binding: GeographicLayerBinding = {
  datasetId: "graph-data",
  geometrySourceId: "points",
  idField: "geometry_id",
  aggregation: "sum",
};

const geometryFeatures: GeoJsonFeature[] = [
  {
    type: "Feature",
    id: "123.0",
    properties: {},
    geometry: { type: "Point", coordinates: [120, 30] },
  },
  {
    type: "Feature",
    id: "456",
    properties: {},
    geometry: { type: "Point", coordinates: [121, 31] },
  },
];

const dataset: Dataset = {
  id: "graph-data",
  name: "Graph data",
  columns: [],
  rows: [],
  graph: {
    nodes: {
      columns: [
        { name: "id", type: "nominal" },
        { name: "geometry_id", type: "nominal" },
      ],
      rows: [
        { id: "node-a", geometry_id: "00123" },
        { id: "node-b", geometry_id: " 456 " },
      ],
    },
    edges: {
      columns: [
        { name: "source", type: "nominal" },
        { name: "target", type: "nominal" },
        { name: "value", type: "quantitative" },
      ],
      rows: [
        { source: "node-a", target: "node-b", value: "3" },
        { source: "missing", target: "node-b", value: "5" },
      ],
    },
  },
};

describe("geographic graph links", () => {
  it("joins graph nodes to GeoJSON independently from graph edge identities", () => {
    expect(geographicGraphNodeRecords(dataset, binding, geometryFeatures)).toEqual([
      { rowKey: "node-a", position: [120, 30] },
      { rowKey: "node-b", position: [121, 31] },
    ]);
    expect(geographicGraphLineRecords(dataset, binding, geometryFeatures)).toEqual([
      { start: [120, 30], end: [121, 31], value: 3 },
    ]);
  });

  it("returns no records without a geographic binding", () => {
    expect(geographicGraphNodeRecords(dataset, undefined, geometryFeatures)).toEqual([]);
    expect(geographicGraphLineRecords(dataset, undefined, geometryFeatures)).toEqual([]);
  });
});
