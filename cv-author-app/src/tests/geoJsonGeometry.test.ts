import { describe, expect, it } from "vitest";
import type { GeoJsonFeature, GeographicLayerBinding } from "../types";
import {
  bindGeoJsonFeatures,
  canonicalGeoJsonJoinId,
  geoJsonFeatureBounds,
  geoJsonFeatureIds,
  geoJsonPolygonRecords,
} from "../utils/geoJsonGeometry";

describe("GeoJSON ID joins", () => {
  it("uses canonical feature IDs and declared aliases", () => {
    expect(geoJsonFeatureIds({
      type: "Feature",
      id: "10001",
      properties: { ids: [10118, "10002"] },
      geometry: { type: "Point", coordinates: [0, 0] },
    })).toEqual(["10001", "10118", "10002"]);
  });

  it("normalizes numeric CSV representations for ID joins", () => {
    expect(canonicalGeoJsonJoinId(" 10001.0 ")).toBe("10001");
    expect(canonicalGeoJsonJoinId("00123")).toBe("123");
    expect(canonicalGeoJsonJoinId("district-a")).toBe("district-a");
  });

  it("materializes matched MultiPolygon aliases as polygon records", () => {
    const feature: GeoJsonFeature = {
      type: "Feature",
      id: "10001",
      properties: { ids: ["10001", "10118"] },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          [[[2, 2], [3, 2], [3, 3], [2, 2]]],
        ],
      },
    };
    const binding: GeographicLayerBinding = {
      datasetId: "case2",
      geometrySourceId: "nyc-zips",
      idField: "incident_zip",
      colorField: "sighting_count",
      aggregation: "sum",
    };

    const bound = bindGeoJsonFeatures(binding, [
      { incident_zip: "10001.0", sighting_count: "2" },
      { incident_zip: "10118", sighting_count: "3" },
    ], [feature]);

    expect(bound).toHaveLength(1);
    expect(bound[0]?.properties.__colorValue).toBe(5);
    expect(geoJsonPolygonRecords(bound)).toHaveLength(2);
  });

  it("computes bounds without spreading large coordinate arrays", () => {
    const coordinates = Array.from({ length: 150_000 }, (_, index) => [
      -74 + index / 1_000_000,
      40 + index / 1_000_000,
    ]);
    const feature: GeoJsonFeature = {
      type: "Feature",
      id: "large-polygon",
      properties: {},
      geometry: { type: "Polygon", coordinates: [coordinates] },
    };

    expect(geoJsonFeatureBounds([feature])).toEqual({
      minLongitude: -74,
      minLatitude: 40,
      maxLongitude: -73.850001,
      maxLatitude: 40.149999,
    });
  });
});
