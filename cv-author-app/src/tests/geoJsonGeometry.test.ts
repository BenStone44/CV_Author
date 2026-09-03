import { describe, expect, it } from "vitest";
import { parseEmbeddedPoint } from "../utils/geoJsonGeometry";

describe("CSV-embedded geographic points", () => {
  it("parses GeoJSON position arrays", () => {
    expect(parseEmbeddedPoint("[-74.23524,40.50613]")).toEqual([-74.23524, 40.50613]);
  });

  it("rejects incomplete or non-numeric positions", () => {
    expect(parseEmbeddedPoint("[40.5]")).toBeNull();
    expect(parseEmbeddedPoint("not a point")).toBeNull();
  });
});
